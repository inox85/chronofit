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

// --- Altri pin ---
constexpr int PPS_PIN     = 34;

// --- Costanti generiche ---
constexpr int TIME_UPDATE_INTERVAL = 1000;

constexpr int BUZZER = 15;

constexpr int POWER_SOURCE = 36;

constexpr uint32_t CAL_WINDOW_SEC = 3600UL;
constexpr uint32_t CAL_WINDOW_US  = CAL_WINDOW_SEC * 1000000UL;

constexpr double a = -0.035e-6;      // coefficiente quarzo (ppm/°C²)

#endif
