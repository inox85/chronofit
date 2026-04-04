#ifndef CONSTANTS_H
#define CONSTANTS_H

#define VER2
#include <Arduino.h>

// --- Configurazione hardware condizionale ---

constexpr int GPS_RX = 17;
constexpr int PRINTER_TX  = 16;

// --- Pin sensori ---

#ifdef VER2

  constexpr int SENSOR_IN1 = 26;
  constexpr int SENSOR_IN2 = 27;
  constexpr int SENSOR_IN3 = 25;
  constexpr int SENSOR_IN4 = 0;

  constexpr int SDA_PIN = 32;
  constexpr int SCL_PIN = 32;
  constexpr int SQW_PIN = 4;

#else

  constexpr int SENSOR_IN1 = 13;
  constexpr int SENSOR_IN2 = 25;
  constexpr int SENSOR_IN3 = 27;
  constexpr int SENSOR_IN4 = 26;

  constexpr int SDA_PIN = 21;
  constexpr int SCL_PIN = 22;
  constexpr int SQW_PIN = 23;

  constexpr int LED_1 = 12;
  constexpr int LED_2 = 2;
  constexpr int LED_3 = 14;

#endif

// --- GPS PINs ---

constexpr int PPS_PIN = 34;

// --- Costanti generiche ---

constexpr int TIME_UPDATE_INTERVAL = 1000;
constexpr int LAST_CLIENT_CHECK = 1000;

constexpr int BUZZER = 15;

constexpr int POWER_SOURCE = 36;

constexpr int MILLIS_OFFSET_ADJ = 0;

constexpr uint32_t CAL_WINDOW_SEC = 3600UL;
constexpr uint32_t CAL_WINDOW_US  = CAL_WINDOW_SEC * 1000000UL;

constexpr const char INDEX_FIELD[] = "id";
constexpr const char LINE_NUMBER_FIELD[] = "ln";
constexpr const char LINE_ID_FIELD[] = "lId";
constexpr const char COMPETITOR_FIELD[] = "c";
constexpr const char HOUR_FIELD[] = "h";
constexpr const char MINUTE_FIELD[] = "m";
constexpr const char SECOND_FIELD[] = "s";
constexpr const char MILLIS_FIELD[] = "ms";
constexpr const char PENALITY_FIELD[] = "x";

#endif
