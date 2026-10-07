#include "cell_feedback.h"
#include "cell_config.h"
#include <FastLED.h>

static CRGB s_leds[CELL_NUM_LEDS];
static bool s_buzzer = true;
static uint32_t s_flashUntilMs = 0;
static uint32_t s_ackUntilMs = 0;
static uint32_t s_lastDelivered = 0;
static bool     s_deliveredInit = false;

constexpr uint32_t RTT_DEGRADED_US = 20000;   // oltre: precisione del sync ridotta
constexpr uint32_t ERROR_HOLD_MS   = 10000;   // quanto resta rosso LED3 dopo un errore

static bool active(uint32_t untilMs) {
  return (int32_t)(untilMs - millis()) > 0;
}

void cellFeedbackBegin(bool buzzerEnabled) {
  s_buzzer = buzzerEnabled;
  FastLED.addLeds<WS2812B, CELL_LED_PIN, GRB>(s_leds, CELL_NUM_LEDS);
  FastLED.setBrightness(60);
  fill_solid(s_leds, CELL_NUM_LEDS, CRGB::Black);
  FastLED.show();
  pinMode(CELL_BUZZER_PIN, OUTPUT);
}

void cellFeedbackTrigger() {
  s_flashUntilMs = millis() + 150;
  if (s_buzzer) tone(CELL_BUZZER_PIN, 2000, 40);
}

void cellFeedbackUpdate(const CellNetStatus &st, bool inputActive, int apClients) {
  const uint32_t now = millis();
  const bool blinkOn = (now % 1000) < 500;

  // LED0 — collegamento al base e sync
  if (!st.ssidConfigured) {
    s_leds[0] = blinkOn ? CRGB::Purple : CRGB::Black;
  } else if (!st.staConnected) {
    s_leds[0] = CRGB::Red;
  } else if (!st.syncValid) {
    s_leds[0] = CRGB::Yellow;
  } else if (st.rttUs > RTT_DEGRADED_US) {
    s_leds[0] = CRGB(255, 90, 0);
  } else {
    s_leds[0] = CRGB::Green;
  }

  // LED1 — qualità del segnale verso il base
  if (!st.staConnected) {
    s_leds[1] = CRGB::Black;
  } else if (st.rssi >= -60) {
    s_leds[1] = CRGB::Green;
  } else if (st.rssi >= -75) {
    s_leds[1] = CRGB::Yellow;
  } else {
    s_leds[1] = CRGB::Red;
  }

  // LED2 — sensore (il lampo di rilevamento ha la precedenza)
  if (active(s_flashUntilMs)) s_leds[2] = CRGB::Blue;
  else s_leds[2] = inputActive ? CRGB::White : CRGB::Black;

  // LED3 — consegna al base
  uint32_t delivered = st.sent + st.duplicates;
  if (!s_deliveredInit) { s_lastDelivered = delivered; s_deliveredInit = true; }
  if (delivered != s_lastDelivered) {
    s_lastDelivered = delivered;
    s_ackUntilMs = now + 300;
  }
  if (st.lastErrorAgeMs < ERROR_HOLD_MS) {
    s_leds[3] = CRGB::Red;
  } else if (st.pending > 0) {
    s_leds[3] = CRGB(255, 90, 0);
  } else if (active(s_ackUntilMs)) {
    s_leds[3] = CRGB::Green;
  } else if (apClients > 0) {
    s_leds[3] = CRGB(0, 40, 40);
  } else {
    s_leds[3] = CRGB::Black;
  }

  FastLED.show();
}
