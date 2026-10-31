#include "cell_feedback.h"
#include "cell_config.h"
#include "power.h"

constexpr uint32_t BUZZER_FREQUENCY = 3000;   // come Chronofit_BLE
constexpr uint32_t ERROR_HOLD_MS    = 10000;  // quanto lampeggia LED3 dopo un passaggio rifiutato o perso
constexpr uint32_t LOCATE_MS        = 3000;
constexpr uint32_t LOW_BAT_BEEP_MS  = 120;    // avviso di batteria bassa: 3 beep da 120 ms
constexpr uint32_t LOW_BAT_PERIOD_MS = 240;   // beep + pausa
constexpr int      LOW_BAT_BEEPS    = 3;

static volatile bool     s_buzzer = true;
static volatile uint32_t s_flashUntilMs = 0;
static volatile uint32_t s_locateUntilMs = 0;
static volatile uint32_t s_beepUntilMs = 0;
static volatile uint32_t s_lowBatStartMs = 0;   // 0 = nessun avviso in corso
static bool              s_beepOn = false;

static bool active(uint32_t untilMs) {
  return untilMs != 0 && (int32_t)(untilMs - millis()) > 0;
}

void cellFeedbackBegin() {
  pinMode(PIN_LED1, OUTPUT);
  pinMode(PIN_LED2, OUTPUT);
  pinMode(PIN_LED3, OUTPUT);
  pinMode(PIN_LED4, OUTPUT);
  ledcAttach(PIN_BUZZER, BUZZER_FREQUENCY, 8);
  ledcWrite(PIN_BUZZER, 0);
}

void cellFeedbackSetBuzzer(bool enabled) { s_buzzer = enabled; }

void cellFeedbackBeep(uint32_t ms) {
  s_beepUntilMs = (millis() + ms) | 1;
}

void cellFeedbackLowBattery() {
  s_lowBatStartMs = millis() | 1;
}

void cellFeedbackTrigger() {
  s_flashUntilMs = (millis() + 150) | 1;
  if (s_buzzer) cellFeedbackBeep(40);
}

void cellFeedbackLocate() {
  s_locateUntilMs = (millis() + LOCATE_MS) | 1;
}

bool cellFeedbackSuppressSensor() {
  uint32_t until = s_locateUntilMs;
  return until != 0 && (int32_t)(until + 300 - millis()) > 0;
}

static void updateBuzzer(uint32_t now) {
  bool on = active(s_beepUntilMs);
  if (s_lowBatStartMs) {
    uint32_t t = now - s_lowBatStartMs;
    if (t >= LOW_BAT_PERIOD_MS * LOW_BAT_BEEPS) s_lowBatStartMs = 0;
    else if (t % LOW_BAT_PERIOD_MS < LOW_BAT_BEEP_MS) on = true;
  }
  if (active(s_locateUntilMs)) on = (now % 400) < 200;
  if (on != s_beepOn) {
    s_beepOn = on;
    ledcWrite(PIN_BUZZER, on ? 128 : 0);
  }
}

void cellFeedbackUpdate(const CellRadioStatus &st, bool inputActive) {
  const uint32_t now = millis();
  updateBuzzer(now);

  int countdown = powerButtonCountdown();
  if (countdown < 0) countdown = powerBatteryBar();
  if (countdown >= 0) {
    const int pins[4] = {PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4};
    for (int i = 0; i < 4; i++) digitalWrite(pins[i], i < countdown ? HIGH : LOW);
    return;
  }

  if (active(s_locateUntilMs)) {
    bool phase = (now % 200) < 100;
    digitalWrite(PIN_LED1, phase);
    digitalWrite(PIN_LED2, !phase);
    digitalWrite(PIN_LED3, phase);
    digitalWrite(PIN_LED4, !phase);
    return;
  }

  const bool slowBlink = (now % 1000) < 500;
  const bool fastBlink = (now % 250) < 125;
  const uint32_t ph = now % 1000;
  const bool doubleBlink = ph < 100 || (ph >= 200 && ph < 300);

  // LED1 — collegamento alla Main
  bool led1;
  if (st.kit == 0)                               led1 = slowBlink;
  else if (!st.mainHeard || !st.syncValid)       led1 = fastBlink;
  else if (st.delayUs > CELL_SYNC_DEGRADED_US)   led1 = !doubleBlink;
  else                                           led1 = true;

  // LED2 — sensore (il lampo del passaggio inverte lo stato)
  bool led2 = inputActive;
  if (active(s_flashUntilMs)) led2 = !led2;

  // LED3 — consegna
  bool led3;
  if (st.lastErrorAgeMs < ERROR_HOLD_MS)                         led3 = fastBlink;
  else if (st.pending > 0)                                       led3 = true;
  else if (st.lastAckMs != 0 && (uint32_t)(now - st.lastAckMs) < 300) led3 = true;
  else                                                           led3 = false;

  // LED4 — ricarica
  bool led4;
  if (powerCharged())       led4 = true;
  else if (powerCharging()) led4 = slowBlink;
  else                      led4 = false;

  digitalWrite(PIN_LED1, led1);
  digitalWrite(PIN_LED2, led2);
  digitalWrite(PIN_LED3, led3);
  digitalWrite(PIN_LED4, led4);
}
