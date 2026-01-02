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

void handlePpsSync();

void handleLineSync();

void broadcastTime();

int getLastSessionRowIndex();

void broadcastAsync(const String& message);

uint32_t correctedElapsedUs(uint32_t rawUs);

uint64_t micros64();

double setTimeBaseCalibration(double deltaUs, double minutes);
