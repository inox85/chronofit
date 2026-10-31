// Chronofit Cell RF — fotocellula per ChronofitMainCell RF, sulla scheda delle
// barriere Chronofit_BLE (ESP32 + NRF24L01+).
//
// Stesse funzioni di Chronofit_Cell (timestamp locale del passaggio, sync del
// clock con la Main, coda con ritentativi e deduplica, battito di presenza,
// feedback con LED e buzzer) ma il collegamento con la Main è radio NRF24
// (cell_radio.cpp, protocollo in rf_protocol.h) e non c'è WiFi: abbinamento,
// linea, lockout e buzzer si impostano dalla console della Main.

#include "cell_config.h"
#include "rf_protocol.h"
#include "cell_radio.h"
#include "cell_sensor.h"
#include "cell_feedback.h"
#include "power.h"
#include "esp_timer.h"

// Chiamati dal task radio.
void onCellConfigChanged(uint8_t line, uint16_t lockoutMs, bool buzzer) {
  cellSensorSetLockout(lockoutMs);
  cellFeedbackSetBuzzer(buzzer);
  (void)line;
}

void onCellCommand(uint8_t cmd) {
  if (cmd == RF_CMD_BEEP) cellFeedbackLocate();
  else if (cmd == RF_CMD_TEST) cellFeedbackTrigger();
  else if (cmd == RF_CMD_BAT_CAL) cellFeedbackBeep(150);   // conferma della taratura
}

static void shutdownBeep() {
  for (int i = 0; i < 3; i++) {
    ledcWrite(PIN_BUZZER, 128);
    delay(50);
    ledcWrite(PIN_BUZZER, 0);
    delay(50);
  }
}

// Errore hardware all'avvio: segnalazione con LED e buzzer, poi spegnimento
// (o riavvio se alimentata da USB), come Chronofit_BLE.
static void signalFatalError(const char *message) {
  const int pins[4] = {PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4};
  for (int i = 0; i < 10; i++) {
    Serial.println(message);
    for (int pin : pins) digitalWrite(pin, HIGH);
    ledcWrite(PIN_BUZZER, 128);
    delay(150);
    for (int pin : pins) digitalWrite(pin, LOW);
    ledcWrite(PIN_BUZZER, 0);
    delay(150);
  }
  powerOff();
  esp_restart();
}

void setup() {
  // Autoritenuta subito: altrimenti la scheda si spegne al rilascio del pulsante.
  powerBegin(shutdownBeep);
  Serial.begin(115200);

  cellFeedbackBegin();
  cellSensorBegin(CELL_DEFAULT_LOCKOUT_MS);   // il lockout vero arriva da cellRadioBegin()

  if (!cellRadioBegin()) signalFatalError("Modulo radio non trovato");

  cellFeedbackBeep(60);
  CellRadioStatus st = cellRadioStatus();
  Serial.printf("Chronofit Cell RF %s pronta: id %08lx, Main %08lx, linea %u\n",
                CELL_FW_VERSION, (unsigned long)st.id, (unsigned long)st.kit, st.line);
}

void loop() {
  uint64_t localUs;
  if (cellSensorPoll(localUs)) {
    if (cellFeedbackSuppressSensor()) {
      Serial.println("[sensore] passaggio ignorato durante Trova");
    } else {
      cellRadioEnqueue(localUs);
      cellFeedbackTrigger();
    }
  }

  static uint32_t lastUiMs = 0;
  if ((uint32_t)(millis() - lastUiMs) >= 10) {
    lastUiMs = millis();
    cellFeedbackUpdate(cellRadioStatus(), cellSensorActive());
  }

  powerUpdate();

  // Batteria bassa: avviso sonoro subito e poi ogni minuto
  static uint32_t lastLowBatMs = 0;
  if (!powerBatteryLow()) lastLowBatMs = 0;
  else if (lastLowBatMs == 0 || (uint32_t)(millis() - lastLowBatMs) >= 60000) {
    lastLowBatMs = millis() | 1;
    cellFeedbackLowBattery();
  }
  delay(1);
}
