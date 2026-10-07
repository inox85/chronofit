#ifndef CONSTANTS_H
#define CONSTANTS_H

#define VER2
#include <Arduino.h>

// --- Configurazione hardware condizionale ---

// --- Pin sensori ---

#ifdef VER2

  // constexpr int SENSOR_IN1 = 26;
  // constexpr int SENSOR_IN2 = 27;
  // constexpr int SENSOR_IN3 = 25;
  // constexpr int SENSOR_IN4 = 0;

  constexpr int SENSOR_IN1 = 0;
  constexpr int SENSOR_IN2 = 25;
  constexpr int SENSOR_IN3 = 27;
  constexpr int SENSOR_IN4 = 26;

  constexpr int WIFI_LED = 0;
  constexpr int COM_LED = 1;
  constexpr int LINE_LED = 2;

#else

  constexpr int SENSOR_IN1 = 13;
  constexpr int SENSOR_IN2 = 25;
  constexpr int SENSOR_IN3 = 27;
  constexpr int SENSOR_IN4 = 26;

  constexpr int LED_1 = 12;
  constexpr int LED_2 = 2;
  constexpr int LED_3 = 14;

#endif

// --- Costanti generiche ---

constexpr int TIME_UPDATE_INTERVAL = 1000;
constexpr int LAST_CLIENT_CHECK = 1000;

constexpr int BUZZER = 15;

constexpr int POWER_SOURCE = 36;

constexpr int MILLIS_OFFSET_ADJ = 0;

constexpr const char INDEX_FIELD[] = "id";
constexpr const char LINE_NUMBER_FIELD[] = "ln";
constexpr const char LINE_ID_FIELD[] = "lId";
constexpr const char COMPETITOR_FIELD[] = "c";
constexpr const char HOUR_FIELD[] = "h";
constexpr const char MINUTE_FIELD[] = "m";
constexpr const char SECOND_FIELD[] = "s";
constexpr const char MILLIS_FIELD[] = "ms";
constexpr const char PENALITY_FIELD[] = "x";
constexpr const char ENABLED_FIELD[]  = "e";
constexpr const char LINE_DEVICE_FIELD[] = "p";
constexpr const char LINE_MODE_FIELD[]   = "r";
constexpr const char CANCELLED_FIELD[]   = "an";  // annullamento riga (persistito)
constexpr const char EDITED_FIELD[]      = "ed";  // riga modificata almeno una volta (persistito)

#endif
