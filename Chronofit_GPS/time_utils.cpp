#include "time_utils.h"
#include "mqtt.h"
#include <TimeLib.h>  // se usi TimeLib
#include "globals.h"
#include "constants.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include "printer.h"
#include "services_serial.h"
#include <LittleFS.h>
#include "debug.h"
#include "routes.h"
#include "params.h"
#include "diagnostic.h"
#include "settings.h"
#include <WiFi.h>
#include "RTC.h"

PreciseTime getPreciseTime() {
  PreciseTime t;

  uint64_t rawUs = esp_timer_get_time() - syncReference;
  uint64_t elapsedUs = correctedElapsedUs(rawUs) + MILLIS_OFFSET_ADJ;

  uint64_t elapsedSec = elapsedUs / 1000000ULL;
  uint64_t remUs = elapsedUs % 1000000ULL;
  
  // Printf corretta
  //Serial.printf("us_drift=%lld  ms=%u\n", t.us_drift, ms);

  uint32_t ms = (remUs + 500) / 1000;  // arrotondamento

  // ── ROLLOVER: se ms arrotonda a 1000 propagalo al secondo ──
  if (ms >= 1000) {
    ms = 0;
    elapsedSec += 1;
  }

  t.ms = ms;

  // ⏱️ tempo assoluto
  uint64_t absSec = ppsEpochSec + elapsedSec;

  t.ss = absSec % 60;
  t.mm = (absSec / 60) % 60;
  t.hh = (absSec / 3600) % 24;

  return t;
}

uint32_t getPreciseMillis(uint64_t lpps){
  uint64_t rawUs = lpps - syncReference;
  uint64_t elapsedUs = correctedElapsedUs(rawUs) + MILLIS_OFFSET_ADJ;

  uint64_t elapsedSec = elapsedUs / 1000000ULL;
  uint64_t remUs = elapsedUs % 1000000ULL;
  uint32_t ms = (remUs) / 1000;
  return ms;
}

PreciseTime getPreciseSensorTime(int i) {
  PreciseTime t;

  uint64_t rawUs    = sensorTime[i] - syncReference;
  uint64_t elapsedUs = correctedElapsedUs(rawUs) + MILLIS_OFFSET_ADJ;

  uint64_t elapsedSec = elapsedUs / 1000000ULL;
  uint64_t remUs      = elapsedUs % 1000000ULL;

  uint32_t ms = (remUs + 500) / 1000;  // arrotondamento

  // ── ROLLOVER: se ms arrotonda a 1000 propagalo al secondo ──
  if (ms >= 1000) {
    ms = 0;
    elapsedSec += 1;
  }

  if (remUs > 500000ULL) {
    t.us_drift = (int64_t)(remUs - 1000000ULL);
  } else {
    t.us_drift = (int64_t)remUs;
  }

  t.ms = ms;

  // ⏱️ tempo assoluto
  uint64_t absSec = ppsEpochSec + elapsedSec;

  t.ss = absSec % 60;
  t.mm = (absSec / 60) % 60;
  t.hh = (absSec / 3600) % 24;

  return t;
}

PreciseTime getPreciseTimeFromSync(uint64_t referenceUs) {
  PreciseTime t;

  uint64_t rawUs    = referenceUs - syncReference;
  uint64_t elapsedUs = correctedElapsedUs(rawUs) + MILLIS_OFFSET_ADJ;

  uint64_t elapsedSec = elapsedUs / 1000000ULL;
  uint64_t remUs      = elapsedUs % 1000000ULL;

  uint32_t ms = (remUs + 500) / 1000;  // arrotondamento

  // ── ROLLOVER: se ms arrotonda a 1000 propagalo al secondo ──
  if (ms >= 1000) {
    ms = 0;
    elapsedSec += 1;
  }

  if (remUs > 500000ULL) {
    t.us_drift = (int64_t)(remUs - 1000000ULL);
  } else {
    t.us_drift = (int64_t)remUs;
  }

  t.ms = ms;

  // ⏱️ tempo assoluto
  uint64_t absSec = ppsEpochSec + elapsedSec;

  t.ss = absSec % 60;
  t.mm = (absSec / 60) % 60;
  t.hh = (absSec / 3600) % 24;

  return t;
}

void setExtimatedDriftParams(int us){

    // tempo dall'ultima sync in microsecondi
    uint64_t deltaUs = sensorTime[4] - ((uint64_t)lastGPSSync * 1000ULL);
    Serial.print("deltaus:");
    Serial.println(deltaUs);
    
    lastDeltaPPSSync = deltaUs;
    // Normalizzazione errore [-500000, +500000]
    //int32_t driftUs = (us > 500000) ? (us - 1000000) : us;  

    usDriftAtPPS = us;
    Serial.print("usDriftAtPPS:");
    Serial.println(usDriftAtPPS);

    // Calcolo ppm
    if (deltaUs > 0) {
        extimatedDriftByPPS = ((double)us / (double)deltaUs) * 1e6;
    } else {
        extimatedDriftByPPS = 0;
    }
}

void checkPointRoutine(int i) {

  PreciseTime t = getPreciseSensorTime(i);
  int us_drift = t.us_drift;
  uint16_t ms = t.ms;
  uint8_t hh = t.hh;
  uint8_t mm = t.mm;
  uint8_t ss = t.ss;

  if(i == 4){
    setExtimatedDriftParams(us_drift);
  }
  // 🔹 Crea il JSON base
  StaticJsonDocument<256> checkpoint;
  checkpoint[LINE_NUMBER_FIELD] = i + 1;
  checkpoint[LINE_ID_FIELD]     = lineIds[i];
  checkpoint[COMPETITOR_FIELD]  = competitors[i];
  checkpoint[HOUR_FIELD]        = hh;
  checkpoint[MINUTE_FIELD]      = mm;
  checkpoint[SECOND_FIELD]      = ss;
  checkpoint[MILLIS_FIELD]      = ms;
  checkpoint[PENALITY_FIELD]    = 0;
  checkpoint[ENABLED_FIELD]     = lineEnabled[i];

  // 🔹 Calcola nuovo index
  sessionRowIndex = sessionRowIndex + 1;
  checkpoint[INDEX_FIELD] = sessionRowIndex;

  if (printEnabled) {
    printFormatted(sessionRowIndex, lineIds[i], competitors[i], hh, mm, ss, ms, 1);
  }

  // 🔹 Crea una copia ordinata del JSON (index per primo)
  StaticJsonDocument<256> ordered;
  ordered[INDEX_FIELD] = sessionRowIndex;

  // Copia i campi principali in ordine desiderato
  if (checkpoint.containsKey(LINE_NUMBER_FIELD)) ordered[LINE_NUMBER_FIELD] = checkpoint[LINE_NUMBER_FIELD];
  if (checkpoint.containsKey(LINE_ID_FIELD))     ordered[LINE_ID_FIELD]     = checkpoint[LINE_ID_FIELD];
  if (checkpoint.containsKey(COMPETITOR_FIELD))  ordered[COMPETITOR_FIELD]  = checkpoint[COMPETITOR_FIELD];
  if (checkpoint.containsKey(HOUR_FIELD))        ordered[HOUR_FIELD]        = checkpoint[HOUR_FIELD];
  if (checkpoint.containsKey(MINUTE_FIELD))      ordered[MINUTE_FIELD]      = checkpoint[MINUTE_FIELD];
  if (checkpoint.containsKey(SECOND_FIELD))      ordered[SECOND_FIELD]      = checkpoint[SECOND_FIELD];
  if (checkpoint.containsKey(MILLIS_FIELD))      ordered[MILLIS_FIELD]      = checkpoint[MILLIS_FIELD];
  if (checkpoint.containsKey(PENALITY_FIELD))    ordered[PENALITY_FIELD]    = checkpoint[PENALITY_FIELD];
  if (checkpoint.containsKey(ENABLED_FIELD))     ordered[ENABLED_FIELD]     = checkpoint[ENABLED_FIELD];

  // 🔹 Aggiungi in coda (append) il nuovo JSON come riga separata
  File file = LittleFS.open("/session.json", "a");
  if (!file) {
    debug("Errore apertura file per scrittura!");
    return;
  }
  serializeJson(ordered, file);  // no indentazione
  file.println();                // nuova riga
  file.close();

  // 🔹 Invia sul WebSocket
  StaticJsonDocument<256> wsDoc = ordered;
  wsDoc["t"] = TYPE_CHECKPOINT;

  String jsonMessage;
  serializeJson(wsDoc, jsonMessage);
  //ws.cleanupClients(); // rimuove client chiusi
  ws.textAll(jsonMessage);

  // 🔹 Pubblica su MQTT
  String mqttPayload;
  serializeJson(ordered, mqttPayload);
  mqttPublishCheckpoint(mqttPayload);
}


// ----------------------------------------
void writeCheckpointFromMqtt(const String& jsonPayload) {
  StaticJsonDocument<256> src;
  if (deserializeJson(src, jsonPayload) != DeserializationError::Ok) return;

  sessionRowIndex++;

  StaticJsonDocument<256> ordered;
  ordered[INDEX_FIELD]       = sessionRowIndex;
  ordered[LINE_NUMBER_FIELD] = src[LINE_NUMBER_FIELD];
  ordered[LINE_ID_FIELD]     = src[LINE_ID_FIELD];
  ordered[COMPETITOR_FIELD]  = src[COMPETITOR_FIELD];
  ordered[HOUR_FIELD]        = src[HOUR_FIELD];
  ordered[MINUTE_FIELD]      = src[MINUTE_FIELD];
  ordered[SECOND_FIELD]      = src[SECOND_FIELD];
  ordered[MILLIS_FIELD]      = src[MILLIS_FIELD];
  ordered[PENALITY_FIELD]    = src[PENALITY_FIELD] | 0;
  ordered[ENABLED_FIELD]     = src[ENABLED_FIELD]  | 1;

  if (printEnabled) {
    printFormatted(
      sessionRowIndex,
      src[LINE_ID_FIELD].as<String>(),
      src[COMPETITOR_FIELD].as<int>(),
      src[HOUR_FIELD].as<int>(),
      src[MINUTE_FIELD].as<int>(),
      src[SECOND_FIELD].as<int>(),
      src[MILLIS_FIELD].as<int>(),
      1
    );
  }

  File file = LittleFS.open("/session.json", "a");
  if (file) {
    serializeJson(ordered, file);
    file.println();
    file.close();
  }

  StaticJsonDocument<256> wsDoc = ordered;
  wsDoc["t"] = TYPE_CHECKPOINT;
  String jsonMessage;
  serializeJson(wsDoc, jsonMessage);
  ws.textAll(jsonMessage);
}

// ----------------------------------------
void initPendingIndex() {
  pendingRowIndex = 0;
  File file = LittleFS.open("/mqtt_pending.json", "r");
  if (!file) return;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    StaticJsonDocument<256> entry;
    if (deserializeJson(entry, line) == DeserializationError::Ok) {
      int id = entry["id"] | 0;
      if (id > pendingRowIndex) pendingRowIndex = id;
    }
  }
  file.close();
}

void clearPendingFile() {
  LittleFS.remove("/mqtt_pending.json");
}

int appendToPending(const String& topic, const String& jsonPayload) {
  pendingRowIndex++;
  StaticJsonDocument<512> entry;
  entry["id"]    = pendingRowIndex;
  entry["topic"] = topic;
  entry["data"]  = serialized(jsonPayload);
  File file = LittleFS.open("/mqtt_pending.json", "a");
  if (!file) return -1;
  serializeJson(entry, file);
  file.println();
  file.close();
  return pendingRowIndex;
}

bool processPending(int id, bool confirm) {
  File inFile = LittleFS.open("/mqtt_pending.json", "r");
  if (!inFile) return false;
  File tmpFile = LittleFS.open("/mqtt_pending_tmp.json", "w");
  if (!tmpFile) { inFile.close(); return false; }

  bool   found    = false;
  String foundData;

  while (inFile.available()) {
    String line = inFile.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    StaticJsonDocument<512> entry;
    if (deserializeJson(entry, line) == DeserializationError::Ok && (int)(entry["id"] | 0) == id) {
      found = true;
      if (confirm) serializeJson(entry["data"], foundData);
      continue;
    }
    tmpFile.println(line);
  }
  inFile.close();
  tmpFile.close();

  if (found) {
    LittleFS.remove("/mqtt_pending.json");
    LittleFS.rename("/mqtt_pending_tmp.json", "/mqtt_pending.json");
    if (confirm && foundData.length() > 0) writeCheckpointFromMqtt(foundData);
  } else {
    LittleFS.remove("/mqtt_pending_tmp.json");
  }
  return found;
}

void broadcastPendingItems(AsyncWebSocketClient* client) {
  File file = LittleFS.open("/mqtt_pending.json", "r");
  if (!file) return;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) continue;
    StaticJsonDocument<512> entry;
    if (deserializeJson(entry, line) != DeserializationError::Ok) continue;
    StaticJsonDocument<512> msg;
    msg["t"]         = TYPE_MQTT_PENDING;
    msg["topic"]     = entry["topic"];
    msg["data"]      = entry["data"];
    msg["pendingId"] = entry["id"];
    String out;
    serializeJson(msg, out);
    client->text(out);
  }
  file.close();
}

// ----------------------------------------
void handlePpsSync() {
  //syncReference = lastSyncTrigger;
  // PPS = inizio del secondo successivo
  uint32_t yy = 2025;
  uint32_t MM = 1;
  uint32_t dd = 1;
  uint32_t hh = gps.time.hour() + utcOffset;
  uint32_t mm = gps.time.minute();
  uint32_t ss = gps.time.second() + 1;

  // rollover
  if (ss >= 60) {
    ss = 0;
    mm++;
  }
  if (mm >= 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }

  rtc_set_datetime(yy, MM, dd, hh, mm, ss);

  // 🔒 ancora assoluta (epoch-like, giornaliera)
  ppsEpochSec = (uint64_t)hh * 3600ULL + (uint64_t)mm * 60ULL + (uint64_t)ss;

  // riferimento temporale


  lastBroadcast = millis();
}

void handleRTCSync() {
  DateTime dTime = rtc_now();

  uint32_t hh = dTime.hour();
  uint32_t mm = dTime.minute();
  uint32_t ss = dTime.second();

  // 🔒 ancora assoluta (epoch-like, giornaliera)
  ppsEpochSec = (uint64_t)hh * 3600ULL + (uint64_t)mm * 60ULL + (uint64_t)ss;

  syncReference = lastRTCTrigger;

  lastBroadcast = millis();
}

// Funzione di supporto: gestione sincronizzazione Line
void handleLineSync() {

  // PPS = inizio del secondo successivo
  uint32_t yy = 2025;
  uint32_t MM = 1;
  uint32_t dd = 1;
  uint32_t hh = temp_hh;
  uint32_t mm = temp_mm;
  uint32_t ss = temp_ss;

  // rollover
  if (ss >= 60) {
    ss = 0;
    mm++;
  }
  if (mm >= 60) {
    mm = 0;
    hh = (hh + 1) % 24;
  }

  rtc_set_datetime(yy, MM, dd, hh, mm, ss);

  // 🔒 ancora assoluta (epoch-like, giornaliera)
  ppsEpochSec = (uint64_t)hh * 3600ULL + (uint64_t)mm * 60ULL + (uint64_t)ss;

  // riferimento temporale
  syncReference = lastSyncTrigger;

  lastBroadcast = millis();

  // 🔹 Aggiorna stato
  if (syncMode == MODE_SYNC_LINE)
    syncStatus = SYNC_SET_BY_LINE_SIGNAL;
  // 🔹 Aggiorna stato
  if (syncMode == MODE_ELAPSED_TIME)
    syncStatus = ELAPSED_TIME_STARTED;
}

void broadcastAsync(const String& message) {
  ws.cleanupClients();  // rimuove client chiusi

  for (auto& client : ws.getClients()) {
    client.text(message);  // invio asincrono, non blocca
  }
}


int getLastSessionRowIndex() {
  int lastIdx = 0;
  File file = LittleFS.open("/session.json", "r");
  if (file) {
    while (file.available()) {
      String line = file.readStringUntil('\n');
      JsonDocument tmp;
      DeserializationError err = deserializeJson(tmp, line);
      if (!err) {
        int idx = tmp[INDEX_FIELD] | 0;
        if (idx > lastIdx) lastIdx = idx;
      }
    }
    file.close();
  }
  return lastIdx;
}


void broadcastTime() {
  PreciseTime t = getPreciseTime();
  StaticJsonDocument<256> doc;
  doc["t"] = TYPE_TIME_UPDATE;
  doc["h"] = t.hh;
  doc["m"] = t.mm;
  doc["s"] = t.ss;
  doc["ms"] = t.ms;

  doc["lt"] = gps.location.isValid() ? gps.location.lat() : 0;
  doc["ln"] = gps.location.isValid() ? gps.location.lng() : 0;
  doc["st"] = gps.satellites.value();
  doc["sy"] = syncStatus;
  doc["ls"] = (millis() - lastGPSSync) / 1000;
  doc["lg"] = GPSRefreshInterval * 60;
  doc["pw"] = powerSource;
  doc["ts"] = syncTestRequested;
  doc["cl"] = ws.count();

  fixStatus = syncMode == MODE_SYNC_GPS;

  if (gps.time.isValid())
    fixStatus += 2;

  if (gps.location.isValid())
    fixStatus += 4;

  if(esp_timer_get_time() - lastPPSDetected < 5000000){
    fixStatus += 8;
  }

  doc["f"] = fixStatus;

  doc["mq"] = (mqttConnected && internetOK) ? 1 : 0;

  if (WiFi.status() == WL_CONNECTED) {
    doc["w"] = internetOK ? 3 : 2;
  } else if (wifiReconnecting) {
    doc["w"] = 4;  // caduta post-connessione, retry in corso
  } else if (millis() - startAttemptTime < wifiTimeout) {
    doc["w"] = 1;  // primo tentativo di connessione in corso
  } else {
    doc["w"] = 0;
  }

  if (doc["w"] == 3){
    #ifdef VER2
      
    #else
      digitalWrite(LED_2, HIGH);
    #endif
  }
  else{
    #ifdef VER2
      
    #else
      digitalWrite(LED_2, LOW);
    #endif
  }

  String json;
  serializeJson(doc, json);
  ws.cleanupClients();  // rimuove client chiusi
  ws.textAll(json);     // 🔹 invia a tutti i client connessi
  //wifiTxActivity();
}

double readInternalTemp() {
  double t = (double)(temprature_sens_read() - 32) / 1.8;
  return round(t * 10.0) / 10.0;  // 1 decimale
}

uint64_t correctedElapsedUs(uint64_t rawUs) {
  //double T =  readInternalTemp();
  return (uint64_t)((double)rawUs * (double)calibrationFactor);
  //return (uint64_t)(rawUs * calibrationFactor * termFactor(T));
}


double setTimeBaseCalibration(double deltaUs, double minutes) {
  if (minutes <= 0.0) {
    Serial.println("Invalid minutes for calibration");
    return -1.0;  // valore di errore
  }

  // Tempo atteso in microsecondi
  double T_us = minutes * 60.0 * 1e6;

  // Calcolo fattore di calibrazione
  calibrationFactor = 1.0 + (deltaUs / T_us);

  // Scrittura nel settings
  double calFactorSaved = writeDoubleToSettings("timeCal", calibrationFactor);

  // Log seriale
  Serial.println("Calibrazione aggiornata:");
  Serial.println(String("delta_us=") + deltaUs);
  Serial.println(String("minutes=") + minutes);
  Serial.println(String("factor=") + String(calFactorSaved, 10));

  return calFactorSaved;
}


void updateCalibrationFactor(double driftPPM)
{
    const double gain = 0.3;

    double correction = 1.0 / (1.0 + driftPPM * 1e-6);

    calibrationFactor *= 1.0 + (correction - 1.0) * gain;

    calibrationFactor = writeDoubleToSettings("timeCal", calibrationFactor);

    Serial.print("calibrationFactor: ");
    Serial.println(calibrationFactor, 12);
}