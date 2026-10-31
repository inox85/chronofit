// ChronofitMainCell RF — unità centrale del sistema a fotocellule, sulla scheda
// delle barriere Chronofit_BLE (ESP32 4 MB + NRF24L01+).
//
// Stessa console operatore di Chronofit_Main_Cell (sessioni, viste, discipline,
// branding, AP WiFi con la UI), ma le fotocellule remote (Chronofit_Cell_RF)
// comunicano via radio NRF24 (main_radio.cpp, protocollo in rf_protocol.h)
// invece che via WiFi. Le Cell WiFi (Chronofit_Cell) restano supportate
// tramite /clockSync e /remoteCheckpoint.
//
// Ingressi locali: fotocellula (GPIO17) e pedana (GPIO36), assegnabili a una
// linea (local_inputs.cpp). L'orologio è solo esp_timer, in modalità elapsed.

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
#include "license.h"
#include "equestrian.h"
#include "esp_netif.h"
#include "lwip/netif.h"
#include "lwip/stats.h"
#include "cells.h"
#include "local_inputs.h"
#include "main_radio.h"
#include "power.h"
#include "battery_runtime.h"
#include "battery_curve.h"
#include "esp_task_wdt.h"

static void shutdownBeep() {
  buzzerBeep(60, 3, 60, 3000, 128);
}

void setup() {
  // Autoritenuta subito: altrimenti la scheda si spegne al rilascio del pulsante.

  powerBegin(shutdownBeep);

  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = 30000,  // 30 secondi
      .idle_core_mask = (1 << 0) | (1 << 1),  // entrambi i core
      .trigger_panic = true
  };
  esp_task_wdt_reconfigure(&wdt_config);

  Serial.begin(115200);

  configFS();

  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm
  esp_wifi_set_protocol(WIFI_IF_AP, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G);

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
  elapsedStartLine = readIntFromSettings("el_start", 0);
  if (elapsedStartLine < 0 || elapsedStartLine > 4) elapsedStartLine = 0;
  licenseBegin();   // conta l'accensione; a licenza esaurita niente passaggi
  buzzerActive = readIntFromSettings("buzzActive", 1);   // default acceso, come l'interruttore della console
  lineDelaysLoad();   // prima di avviare la radio: è il lockout mandato alle Cell RF
  lineDisableAfterPass = readIntFromSettings("line_once", 0);
  batteryRuntimeBegin();

  Serial.println();
  Serial.print("Time cal factor: ");
  Serial.println(calibrationFactor, 10);

  buzzerInit(PIN_BUZZER);

  sweepBuzz();

  localInputsBegin();

  sessionRowIndex = getLastSessionRowIndex();

  activateAccessPoint();
  wifiAutoConnectAtBoot();

  batteryCurveBegin();   // curve di scarica apprese (LittleFS montato)
  cellsBegin();
  equestrianBegin();   // regolamento (NVS) e turni della sessione (LittleFS)
  if (!mainRadioBegin()) {
    // Senza radio la Main funziona comunque (ingressi locali, Cell WiFi): lo si
    // segnala con un tono grave e il LED radio spento.
    graveBuzz();
  }
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

// ── LED discreti ────────────────────────────────────────────────────────────
//   LED1  WiFi: acceso = almeno un client sull'AP; flash spento = traffico HTTP/WS
//   LED2  ingressi locali: acceso = fotocellula o pedana attiva
//   LED3  radio: lampeggio lento = nessuna cella connessa, fisso = almeno una
//         cella connessa, flash = pacchetto ricevuto; spento = modulo radio guasto;
//         lampeggio veloce = abbinamento aperto
//   LED4  ricarica: fisso = carica completa, lampeggio = in carica
// Durante la pressione lunga del pulsante restano accesi i LED del conto alla
// rovescia di spegnimento; dopo una pressione breve, per 3 s, la barra della carica.
#define IDLE_TIMEOUT 200  // ms

static void updateLeds() {
  const uint32_t now = millis();
  const int pins[4] = {PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4};

  int countdown = powerButtonCountdown();
  if (countdown < 0) countdown = powerBatteryBar();
  if (countdown >= 0) {
    for (int i = 0; i < 4; i++) digitalWrite(pins[i], i < countdown ? HIGH : LOW);
    return;
  }

  bool slowBlink = (now % 1000) < 500;
  bool fastBlink = (now % 250) < 125;

  bool wifiActivity = (now - lastRxTime) < IDLE_TIMEOUT || (now - lastTxTime) < IDLE_TIMEOUT;
  bool led1 = checkConnectedClient() && !(wifiActivity && fastBlink);

  bool led2 = localBarrierActive() || localPadActive();

  bool led3;
  if (!mainRadioOk())                         led3 = false;
  else if (mainRadioPairingRemainingMs() > 0) led3 = fastBlink;
  else if ((uint32_t)(now - mainRadioLastRxMs()) < 60) led3 = false;   // flash su pacchetto
  else if (cellsRfConnected() > 0)            led3 = true;
  else                                        led3 = slowBlink;

  bool led4;
  if (powerCharged())       led4 = true;
  else if (powerCharging()) led4 = slowBlink;
  else                      led4 = false;

  digitalWrite(PIN_LED1, led1);
  digitalWrite(PIN_LED2, led2);
  digitalWrite(PIN_LED3, led3);
  digitalWrite(PIN_LED4, led4);
}

void loop() {
  wifiLoop();

  if(shouldRestart){
    delay(500);
    ESP.restart();
  }

  dnsServer.processNextRequest();

  if((millis() - lastClientCheck) > LAST_CLIENT_CHECK){
    lastClientCheck = millis();
    ws.cleanupClients();
    if (cellsPoll()) broadcastCells();   // fotocellule: connessa/persa/linea/segnale/abbinamenti
    cellsSaveIfNeeded();
    checkPowerSource();
  }

  PreciseTime t = getPreciseTime();
  actualSecond = t.ss;

  if(actualSecond != lastBroadCastSecond && t.ms < 100){
    lastBroadCastSecond = actualSecond;
    broadcastTime();
  }

  localInputsPoll();
  handleSensorTrigger();

  powerUpdate();
  batteryRuntimeUpdate();
  equestrianLoop();
  licenseLoop();   // conta l'accensione dopo LICENSE_COMMIT_MS di funzionamento

  // Batteria bassa: avviso sonoro (3 beep da 120 ms, come sulle Cell RF) subito e
  // poi ogni minuto, anche con il buzzer dei passaggi disattivato
  static uint32_t lastLowBatMs = 0;
  if (!powerBatteryLow()) lastLowBatMs = 0;
  else if (lastLowBatMs == 0 || (uint32_t)(millis() - lastLowBatMs) >= 60000) {
    lastLowBatMs = millis() | 1;
    buzzerBeep(120, 3, 120, 3000);
  }
  updateLeds();

  delay(1);
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
    bool manual = false;
    uint64_t tUs = 0;
    portENTER_CRITICAL(&isrMux);
      if (sensorTriggered[i]) {
        triggered = true;
        manual = sensorManual[i];
        tUs = sensorTime[i];
        sensorTriggered[i] = false;
        sensorManual[i] = false;
      }
    portEXIT_CRITICAL(&isrMux);

    if (triggered) {
      // Linea disabilitata: il passaggio della barriera va in sessione come riga
      // disabilitata, ma non suona e non fa partire il tempo trascorso. Il
      // passaggio manuale dalla console (tocco sul numero di linea, Start) conta
      // invece come su una linea abilitata.
      bool enabled = i >= 4 || lineEnabled[i] || manual;
      if (enabled) playBinary(i+1);
      if (syncStatus == ELAPSED_WAITING_START &&
          enabled && licenseActive() && (elapsedStartLine == 0 || elapsedStartLine == i + 1)) {   // solo la linea di start, se abilitata
        // primo segnale dopo l'avvio/reset: parte il tempo trascorso
        lastSyncTrigger = tUs;
        syncReference = lastSyncTrigger;
        handleLineSync();
      }
      checkPointRoutine(i, manual);
      if (licenseActive()) equestrianOnPassage(i + 1, tUs, enabled);
    }
  }
}
