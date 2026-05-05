#pragma once
#include <Arduino.h>

typedef struct
{
  uint16_t durationMs;     // durata singolo beep
  uint8_t  count;          // numero beep
  uint16_t pauseMs;        // pausa tra beep
  uint16_t frequencyHz;    // frequenza tono
  uint8_t  duty;           // 0–255 (volume)
} BuzzerCmd_t;

void buzzerInit(uint8_t pin);
void buzzerBeep(uint16_t durationMs,
                uint8_t count = 1,
                uint16_t pauseMs = 100,
                uint16_t frequencyHz = 2000,
                uint8_t duty = 128);

void sweepBuzz();

void playBinary(uint32_t value);

void graveBuzz();

void reverseSweepBuzz();

