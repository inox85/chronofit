#include "time_utils.h"
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


PreciseTime getPreciseTime() {
  PreciseTime t;

  uint64_t rawUs = micros64() - syncReference;
  uint64_t elapsedUs = correctedElapsedUs(rawUs) + 500;

  uint64_t elapsedSec = elapsedUs / 1000000ULL;
  uint64_t remUs     = elapsedUs % 1000000ULL;

  // millisecondi arrotondati
  uint32_t ms = (remUs) / 1000;
  if (ms >= 1000) ms = 999;
  t.ms = ms;

  // ⏱️ tempo assoluto
  uint64_t absSec = ppsEpochSec + elapsedSec;

  t.ss = absSec % 60;
  t.mm = (absSec / 60) % 60;
  t.hh = (absSec / 3600) % 24;

  return t;
}


PreciseTime getPreciseSensorTime(int i) {
    PreciseTime t;

  uint64_t rawUs = sensorTime[i] - syncReference;
  uint64_t elapsedUs = correctedElapsedUs(rawUs) + 500;

  uint64_t elapsedSec = elapsedUs / 1000000ULL;
  uint64_t remUs     = elapsedUs % 1000000ULL;

  // millisecondi arrotondati
  uint32_t ms = (remUs) / 1000;
  if (ms >= 1000) ms = 999;
  t.ms = ms;

  // ⏱️ tempo assoluto
  uint64_t absSec = ppsEpochSec + elapsedSec;

  t.ss = absSec % 60;
  t.mm = (absSec / 60) % 60;
  t.hh = (absSec / 3600) % 24;

  return t;
}


void checkPointRoutine(int i) {

  PreciseTime t = getPreciseSensorTime(i);

  uint16_t ms = t.ms;
  uint8_t hh = t.hh;
  uint8_t mm = t.mm;
  uint8_t ss = t.ss;

  // 🔹 Crea il JSON base
  StaticJsonDocument<256> checkpoint;
  checkpoint["lineNumber"] = i+1;
  checkpoint["lineId"] = lineIds[i];
  checkpoint["competitor"] = competitors[i];
  checkpoint["hour"] = hh;
  checkpoint["minute"] = mm;
  checkpoint["second"] = ss;
  checkpoint["millis"] = ms;

  // 🔹 Calcola nuovo index
  sessionRowIndex = sessionRowIndex + 1;
  checkpoint["index"] = sessionRowIndex;

  if(printEnabled){
    printFormatted(sessionRowIndex, lineIds[i], competitors[i], hh, mm, ss, ms, 1);
  }

  // 🔹 Crea una copia ordinata del JSON (index per primo)
  StaticJsonDocument<256> ordered;
  ordered["index"] = sessionRowIndex;

  // Copia i campi principali in ordine desiderato
  if (checkpoint.containsKey("lineNumber")) ordered["lineNumber"] = checkpoint["lineNumber"];
  if (checkpoint.containsKey("lineId")) ordered["lineId"] = checkpoint["lineId"];
  if (checkpoint.containsKey("competitor")) ordered["competitor"] = checkpoint["competitor"];
  if (checkpoint.containsKey("hour")) ordered["hour"] = checkpoint["hour"];
  if (checkpoint.containsKey("minute")) ordered["minute"] = checkpoint["minute"];
  if (checkpoint.containsKey("second")) ordered["second"] = checkpoint["second"];
  if (checkpoint.containsKey("millis")) ordered["millis"] = checkpoint["millis"];

  // 🔹 Aggiungi in coda (append) il nuovo JSON come riga separata
  File file = LittleFS.open("/session.json", "a");
  if (!file) {
      debug("Errore apertura file per scrittura!");
      return;
  }
  serializeJson(ordered, file);  // no indentazione
  file.println();                // nuova riga
  file.close();

  #ifdef DEBUG
    Serial.printf("Checkpoint #%d salvato su LittleFS (in append)\n", sessionRowIndex);
  #endif

  // 🔹 Invia sul WebSocket
  StaticJsonDocument<256> wsDoc = ordered;
  wsDoc["t"] = "checkPoint";

  String jsonMessage;
  serializeJson(wsDoc, jsonMessage);
  //ws.cleanupClients(); // rimuove client chiusi
  ws.textAll(jsonMessage);
}



// ----------------------------------------
void handlePpsSync() {

  // PPS = inizio del secondo successivo
  uint32_t hh = gps.time.hour() + utcOffset;
  uint32_t mm = gps.time.minute();
  uint32_t ss = gps.time.second() + 1;

  // rollover
  if (ss >= 60) { ss = 0; mm++; }
  if (mm >= 60) { mm = 0; hh = (hh + 1) % 24; }

  // 🔒 ancora assoluta (epoch-like, giornaliera)
  ppsEpochSec = (uint64_t)hh * 3600ULL +
                (uint64_t)mm * 60ULL +
                (uint64_t)ss;

  // riferimento temporale
  syncReference = lastSyncTrigger;

  lastBroadcast = millis();
}


// Funzione di supporto: gestione sincronizzazione Line
void handleLineSync() {

  // PPS = inizio del secondo successivo
  uint32_t hh = temp_hh;
  uint32_t mm = temp_mm;
  uint32_t ss = temp_ss;

  // rollover
  if (ss >= 60) { ss = 0; mm++; }
  if (mm >= 60) { mm = 0; hh = (hh + 1) % 24; }

  // 🔒 ancora assoluta (epoch-like, giornaliera)
  ppsEpochSec = (uint64_t)hh * 3600ULL +
                (uint64_t)mm * 60ULL +
                (uint64_t)ss;

  // riferimento temporale
  syncReference = lastSyncTrigger;

  lastBroadcast = millis();

  // 🔹 Aggiorna stato
  syncStatus = SYNC_SET_BY_LINE_SIGNAL;

}

void broadcastAsync(const String& message) {
  ws.cleanupClients(); // rimuove client chiusi

  for (auto& client : ws.getClients()) { 
      client.text(message); // invio asincrono, non blocca
  }
}


int getLastSessionRowIndex(){
  int lastIdx = 0;
  File file = LittleFS.open("/session.json", "r");
  if (file) {
      while (file.available()) {
          String line = file.readStringUntil('\n');
          DynamicJsonDocument tmp(256);
          DeserializationError err = deserializeJson(tmp, line);
          if (!err) {
              int idx = tmp["index"] | 0;
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
  doc["t"] = "timeUpdate";
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
  

  fixStatus = syncMode == MODE_SYNC_GPS;

  if (gps.time.isValid())
    fixStatus += 2;

  if (gps.location.isValid())
    fixStatus += 4;
  
  if(calRunning)
    fixStatus += 8;

  doc["f"] = fixStatus;

  String json;
  serializeJson(doc, json);
  ws.cleanupClients(); // rimuove client chiusi
  ws.textAll(json);  // 🔹 invia a tutti i client connessi

  //Serial.println(json);

}

double readInternalTemp() {
  double t =  (double)(temprature_sens_read() - 32) / 1.8;
  return round(t * 10.0) / 10.0;   // 1 decimale
}

uint64_t correctedElapsedUs(uint64_t rawUs) {
  //double T =  readInternalTemp();
  return (uint64_t)(rawUs * calibrationFactor);
  //return (uint64_t)(rawUs * calibrationFactor * termFactor(T));
}

uint64_t micros64() {
  return esp_timer_get_time();  
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

double termFactor(double T) {
    double dT = T - Tref;
    double df_over_f = a * dT * dT;  // deriva relativa del quarzo
    return 1.0 - df_over_f;          // fattore moltiplicativo
}

