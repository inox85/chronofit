#pragma once  // evita inclusioni multiple
#include <Arduino.h>
#include <ESPAsyncWebServer.h>

// Struct per rappresentare un orario preciso
struct PreciseTime {
    int hh;  // ore
    int mm;  // minuti
    int ss;  // secondi
    int ms;  // millisecondi
    int us_drift;
};


// Dichiarazioni delle funzioni di gestione del tempo
void updateTime(int hh, int mm, int ss);

void checkPointRoutine(int i);

PreciseTime getPreciseTime();           // legge l'orario corrente

PreciseTime getPreciseTimeFromSync(uint64_t referenceUs);           // legge l'orario corrente

uint32_t getPreciseMillis(uint64_t pm);

PreciseTime getPreciseSensorTime(int i);

void handlePpsSync();

void handleLineSync();

void handleRTCSync();

void broadcastTime();

int getLastSessionRowIndex();

//void broadcastStaticTime(uint8_t hh, uint8_t mm, uint8_t ss, uint8_t ms);

void broadcastAsync(const String& message);

uint64_t correctedElapsedUs(uint64_t rawUs);

double setTimeBaseCalibration(double deltaUs, double minutes);

double readInternalTemp();

double termFactor(double T);

void updateCalibrationFactor(double driftPPM);

void setExtimatedDriftParams(int us);

void writeCheckpointFromMqtt(const String& jsonPayload);

int  appendToPending(const String& topic, const String& jsonPayload);
bool processPending(int id, bool confirm);
void broadcastPendingItems(AsyncWebSocketClient* client);
void initPendingIndex();
void clearPendingFile();