#pragma once  // evita inclusioni multiple
#include <Arduino.h>

// Struct per rappresentare un orario preciso
struct PreciseTime {
    int hh;  // ore
    int mm;  // minuti
    int ss;  // secondi
    int ms;  // millisecondi
};


// Dichiarazioni delle funzioni di gestione del tempo
void updateTime(int hh, int mm, int ss);

void checkPointRoutine(int i);

PreciseTime getPreciseTime();           // legge l'orario corrente

PreciseTime getPreciseSensorTime(int i);

void handlePpsSync();

void handleLineSync();

void handleRTCSync();

void broadcastTime();

int getLastSessionRowIndex();

void broadcastStaticTime(uint8_t hh, uint8_t mm, uint8_t ss, uint8_t ms);

void broadcastAsync(const String& message);

uint64_t correctedElapsedUs(uint64_t rawUs);

uint64_t micros64();

double setTimeBaseCalibration(double deltaUs, double minutes);

double readInternalTemp();

double termFactor(double T);

double computePpm(uint64_t measuredUs, uint32_t expectedSeconds);


