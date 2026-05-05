#pragma once
#include <Arduino.h>

extern int powerSource;          // solo dichiarazione
extern unsigned long lastPowerCheck;
extern int prevPowerSourceStatus;

void checkPowerSource();

