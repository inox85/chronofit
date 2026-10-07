#ifndef GLOBALS_H
#define GLOBALS_H

#include <Arduino.h>
#include "constants.h"
#include <ESPAsyncWebServer.h>
#include <DNSServer.h>
#include "LedStrip.h"

// Dichiarazione (solo extern qui)
extern const char* BASE64_CHARS;
extern const char* DEVICE_ID;

extern LedStrip RGBLeds;

// --- Costanti ---
extern String chipIdStr;
extern const char *ssid;
extern const byte DNS_PORT;

extern DNSServer dnsServer;

// --- Hardware ---

// --- Variabili generali ---
extern String stationName;

// WiFi Connection

extern unsigned long startAttemptTime;
extern const unsigned long wifiTimeout; // 10 secondi
extern volatile bool internetOK;
extern bool wifiReconnecting;

// --- Ancora oraria assoluta (secondi dall'inizio del giorno al momento del sync) ---
extern uint64_t ppsEpochSec;


extern double calibrationFactor;



extern volatile uint64_t lastSyncTrigger;
extern volatile uint64_t syncReference;
extern int utcOffset;


extern int syncEnabled;


// --- Sensori ---

extern String lineIds[6];
extern String lineDevice[6];   // testo libero (default: "FPC 102" / "Non gestita")
extern int lineMode[6];     // 0=auto   | 1=manuale
extern int competitors[6];
extern unsigned long delays[6];
extern int lineEnabled[6];
extern volatile unsigned long lastSensorsSignal[6];
extern int sensorsPins[6];
extern volatile  bool lastSensorState[6];
extern volatile bool sensorTriggered[6];
extern volatile uint64_t sensorTime[6];


extern volatile int8_t actualSecond;


// --- Varie ---
extern unsigned long lastBroadcast;


extern int temp_hh;
extern int temp_mm;
extern int temp_ss;

extern int syncStatus;
extern int syncMode;

extern int lastBroadCastSecond;

extern int sessionRowIndex;

extern unsigned long lastClientCheck;

extern "C" uint8_t temprature_sens_read();




extern unsigned long lastRxTime;
extern unsigned long lastTxTime;

extern volatile bool shouldRestart;

extern int buzzerActive;


extern portMUX_TYPE isrMux;
#endif