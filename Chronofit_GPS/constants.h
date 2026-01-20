#ifndef CONSTANTS_H
#define CONSTANTS_H

#include <Arduino.h>

// --- Configurazione hardware condizionale ---

constexpr int GPS_RX = 17;
constexpr int PRINTER_TX  = 16;

// --- Pin sensori ---
constexpr int SENSOR_IN1 = 26;
constexpr int SENSOR_IN2 = 27;
constexpr int SENSOR_IN3 = 25;
constexpr int SENSOR_IN4 = 13;

constexpr int LED_1 = 12;
constexpr int LED_2 = 12;
constexpr int LED_3 = 12;

// --- Altri pin ---
constexpr int PPS_PIN = 34;

// --- Costanti generiche ---
constexpr int TIME_UPDATE_INTERVAL = 1000;
constexpr int LAST_CLIENT_CHECK = 1000;

constexpr int BUZZER = 15;

constexpr int POWER_SOURCE = 36;

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
