#ifndef GLOBALS_H
#define GLOBALS_H

#include <Arduino.h>
#include "constants.h"
#include <ESPAsyncWebServer.h>
#include <TinyGPSPlus.h>
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
extern TinyGPSPlus gps;

// --- Variabili generali ---
extern String stationName;

// WiFi Connection

extern unsigned long startAttemptTime;
extern const unsigned long wifiTimeout; // 10 secondi
extern volatile bool internetOK;
extern bool wifiReconnecting;
extern volatile bool mqttConnected;

// --- PPS ---
extern volatile uint8_t ppsH, ppsM, ppsS;
extern uint64_t ppsEpochSec;
extern volatile bool ppsTriggered;
extern volatile bool lineTriggered;

extern volatile bool RTCTriggered;

extern double calibrationFactor;
extern double calTempRef;

extern bool testOnSync;
extern int calRunning;
extern int calPpsCount;

extern int fixStatus;

extern volatile uint64_t calStartUs;
extern volatile uint64_t lastSyncTrigger;
extern volatile uint64_t lastNmeaValid;
extern volatile uint64_t syncReference;
extern unsigned long gpsTimeOffsetUs;
extern int utcOffset;

extern uint64_t lastPPSDetected;

extern int syncEnabled;

extern volatile uint64_t lastRTCTrigger;

// --- Sensori ---

extern String lineIds[5];
extern int competitors[5];
extern unsigned long delays[5];
extern int lineEnabled[5];
extern volatile unsigned long lastSensorsSignal[5];
extern int sensorsPins[5];
extern volatile  bool lastSensorState[5];
extern volatile bool sensorTriggered[5];
extern volatile uint64_t sensorTime[5];

extern volatile int syncTestRequested;

extern volatile int8_t actualSecond;
extern volatile int8_t actualSecondForTest;

extern volatile uint32_t ppsCounter;

// --- Varie ---
extern unsigned long lastBroadcast;

extern int printEnabled;

extern int temp_hh;
extern int temp_mm;
extern int temp_ss;

extern int syncStatus;
extern int syncMode;
extern unsigned long lastGPSSync;
extern int GPSRefreshInterval;

extern int lastBroadCastSecond;

extern int sessionRowIndex;

extern unsigned long lastClientCheck;

extern "C" uint8_t temprature_sens_read();

extern uint32_t RTCTtriggerCount;
extern uint64_t startRTC;

extern int agingFactor;

extern int32_t usDriftAtPPS;
extern uint64_t lastDeltaPPSSync;
extern double extimatedDriftByPPS;

extern unsigned long lastRxTime;
extern unsigned long lastTxTime;

extern volatile bool shouldRestart;

extern int buzzerActive;

extern int mqttShowPopup;
extern int mqttAcquireRow;
extern int mqttImmediateMode;
extern int pendingRowIndex;

extern portMUX_TYPE isrMux;
#endif