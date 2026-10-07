// ChronofitMainCell — unità centrale del sistema a fotocellule wireless.
//
// Derivato da Chronofit_GPS (stessa console operatore, sessioni, viste,
// discipline, registro celle /clockSync /remoteCheckpoint /cells,
// branding) ma SENZA sincronizzazione GPS, RTC DS3231 termocompensato e
// stampante termica. L'orologio si basa solo su esp_timer_get_time();
// modalità di sync disponibili: manuale (0), chiusura linea (1), elapsed (3).

#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <TimeLib.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <DNSServer.h>
#include <Update.h>
#include "params.h"
#include "esp_wifi.h"
#include "routes.h"
#include "globals.h"
#include "constants.h"
#include "time_utils.h"
#include "debug.h"
#include "buzzer.h"
#include "diagnostic.h"
#include "settings.h"
#include <FastLED.h>
#include "esp_netif.h"
#include "lwip/netif.h"
#include "lwip/stats.h"
#include "cells.h"
#include "esp_task_wdt.h"

void IRAM_ATTR sensorISR(void *arg) {
  int i = (int)arg;
  signalMenagement(i);
}

void signalMenagement(int i){

  bool current = digitalRead(sensorsPins[i]);

  // fronte HIGH -> LOW
  if (lastSensorState[i] == HIGH && current == LOW) {
      unsigned long now = millis();
      uint64_t nowMicros = esp_timer_get_time();

      if ((unsigned long)(now - lastSensorsSignal[i]) > delays[i]) {
          sensorTime[i] = nowMicros;
          sensorTriggered[i] = true;
          lastSensorsSignal[i] = now;
      }
  }

  lastSensorState[i] = current;

}

void setup() {
  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = 30000,  // 30 secondi
      .idle_core_mask = (1 << 0) | (1 << 1),  // entrambi i core
      .trigger_panic = true
  };
  esp_task_wdt_reconfigure(&wdt_config);

  configFS();

  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm
  esp_wifi_set_protocol(WIFI_IF_AP, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G);

  Serial.begin(9600, SERIAL_8N1);

  #ifdef VER2

    RGBLeds.begin();

  #else

    digitalWrite(LED_1, LOW);
    digitalWrite(LED_2, LOW);
    digitalWrite(LED_3, LOW);

    pinMode(LED_1, OUTPUT);
    pinMode(LED_2, OUTPUT);
    pinMode(LED_3, OUTPUT);

    digitalWrite(LED_1, HIGH);
    digitalWrite(LED_2, HIGH);
    digitalWrite(LED_3, HIGH);

  #endif

  stationName       = readStringFromSettings("stationName", "");
  calibrationFactor = readDoubleFromSettings("timeCal", 1.0);

  lineDevice[0] = readStringFromSettings("lt1_1", lineDevice[0]);
  lineDevice[1] = readStringFromSettings("lt1_2", lineDevice[1]);
  lineDevice[2] = readStringFromSettings("lt1_3", lineDevice[2]);
  lineDevice[3] = readStringFromSettings("lt1_4", lineDevice[3]);

  // Nessuna sincronizzazione dell'orario: il cronometro lavora sempre in modalità
  // elapsed e parte dal primo segnale di start (la modalità salvata da firmware
  // precedenti viene ignorata).
  syncMode = MODE_ELAPSED_TIME;
  syncStatus = ELAPSED_WAITING_START;
  utcOffset = readIntFromSettings("utcOffset", 0);
  buzzerActive = readIntFromSettings("buzzActive", 0);

  Serial.println();
  Serial.print("Time cal factor: ");
  Serial.println(calibrationFactor, 10);

  buzzerInit(BUZZER);

  sweepBuzz();

  pinMode(0, INPUT);

  for (int i = 0; i < 4; i++) {
    pinMode(sensorsPins[i], INPUT_PULLUP);
    lastSensorState[i] = digitalRead(sensorsPins[i]);

    attachInterruptArg(
      sensorsPins[i],
      sensorISR,
      (void*)i,
      CHANGE
    );
  }

  sessionRowIndex = getLastSessionRowIndex();

  activateAccessPoint();

  RGBLeds.defaultSweepSequence();

}

void configFS(){
  if (!LittleFS.begin(true, "/spiffs", 20)) {  // true = formatta se non montato!
    Serial.println("Errore nel montaggio di LittleFS");
    return;
  }
  // no-cache: dopo un aggiornamento del filesystem il browser non deve restare
  // agganciato a una versione vecchia della UI (il base usa 30 giorni di cache).
  server.serveStatic("/", LittleFS, "/").setCacheControl("no-cache");

}


#define IDLE_TIMEOUT 200  // ms

void updateWifiLed(uint8_t ledIndex) {
  unsigned long now = millis();
  bool rxRecent = (now - lastRxTime) < IDLE_TIMEOUT;
  bool txRecent = (now - lastTxTime) < IDLE_TIMEOUT;

  if      (txRecent) RGBLeds.setLed(ledIndex, CRGB(0, 255, 0));
  else if (rxRecent) RGBLeds.setLed(ledIndex, CRGB(255, 140, 0));
  else               RGBLeds.setLed(ledIndex, CRGB::Black);
}

void loop() {

  if(shouldRestart){
    delay(500);
    ESP.restart();
  }

  dnsServer.processNextRequest();

  if((millis() - lastClientCheck) > LAST_CLIENT_CHECK){
    lastClientCheck = millis();
    ws.cleanupClients();
    if (cellsPoll()) broadcastCells();   // fotocellule wireless: connessa/persa/linea/segnale

    #ifdef VER2
      if(checkConnectedClient()){
        if(internetOK){
          RGBLeds.setLed(WIFI_LED, CRGB::Green);
        }else{
          RGBLeds.setLed(WIFI_LED, CRGB::Yellow);
        }
      }else{
        RGBLeds.setLed(WIFI_LED, CRGB::Red);
      }
    #else
      digitalWrite(LED_1, checkConnectedClient());
    #endif

  }

  PreciseTime t = getPreciseTime();
  actualSecond = t.ss;

  if(actualSecond != lastBroadCastSecond && t.ms < 100){
    lastBroadCastSecond = actualSecond;
    broadcastTime();
  }

  #ifdef VER2
    RGBLeds.setLed(LINE_LED, getStatusColor());
  #endif

  handleSensorTrigger();

  updateWifiLed(COM_LED);

}

bool checkConnectedClient(){
  int n = WiFi.softAPgetStationNum();
  if(n > 0)
  {
    return true;
  }
  return false;
}


void handleSensorTrigger(){
  for (int i = 0; i < 6; i++) {
    bool triggered = false;
    uint64_t tUs = 0;
    portENTER_CRITICAL(&isrMux);
      if (sensorTriggered[i]) {
        triggered = true;
        tUs = sensorTime[i];
        sensorTriggered[i] = false;
      }
    portEXIT_CRITICAL(&isrMux);

    if (triggered) {
      playBinary(i+1);
      if (syncStatus == ELAPSED_WAITING_START) {
        // primo segnale dopo l'avvio/reset: parte il tempo trascorso
        lastSyncTrigger = tUs;
        syncReference = lastSyncTrigger;
        handleLineSync();
      }
      checkPointRoutine(i);
    }
  }
}

CRGB getStatusColor() {
  CRGB color = CRGB::Black;  // parte da spento

  if (digitalRead(SENSOR_IN1) == LOW) color += CRGB::Red;
  if (digitalRead(SENSOR_IN2) == LOW) color += CRGB::Green;
  if (digitalRead(SENSOR_IN3) == LOW) color += CRGB::Blue;
  if (digitalRead(SENSOR_IN4) == LOW) color += CRGB::Yellow;

  return color;
}
