// Chronofit Cell — fotocellula wireless per il base Chronofit_GPS.
//
// Stessa scheda del base. Rileva il fronte sul proprio ingresso, lo timbra con
// l'esp_timer locale e lo invia al base (via /remoteCheckpoint) già convertito
// nel clock del base, stimato con /clockSync. Espone una AP propria
// (ChronofitCell_<id>, 192.168.11.1) con la UI di configurazione, mentre in
// STA è collegata alla AP del base.

#include <LittleFS.h>
#include <WiFi.h>
#include "cell_config.h"
#include "cell_net.h"
#include "cell_routes.h"
#include "cell_sensor.h"
#include "cell_feedback.h"
#include "settings.h"

void setup() {
  Serial.begin(115200);

  if (!LittleFS.begin(true, "/spiffs", 20)) {
    Serial.println("Errore nel montaggio di LittleFS");
  }

  cellFeedbackBegin(readIntFromSettings("cell_buzzer", 1) != 0);
  cellNetBegin();
  cellRoutesBegin();
  cellSensorBegin(readIntFromSettings("cell_pin", 1), (uint32_t)readIntFromSettings("lockout_ms", 200));

  Serial.printf("Chronofit Cell pronta: AP %s\n", cellApSsid().c_str());
}

void loop() {
  uint64_t localUs;
  while (cellSensorPop(localUs)) {
    cellEnqueueEvent(localUs);
    cellFeedbackTrigger();
  }

  static uint32_t lastUiMs = 0;
  if ((uint32_t)(millis() - lastUiMs) >= 100) {
    lastUiMs = millis();
    CellNetStatus st = cellNetStatus();
    cellFeedbackUpdate(st, cellSensorActive(), WiFi.softAPgetStationNum());
  }

  if (shouldRestart) {
    delay(500);
    ESP.restart();
  }
  delay(1);
}
