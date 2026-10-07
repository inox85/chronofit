#line 1 "C:\\src\\chronofit\\Chronofit_Cell\\cell_sensor.h"
#ifndef CELL_SENSOR_H
#define CELL_SENSOR_H

#include <Arduino.h>

// Ingresso sensore (1..4 → IN1..IN4 della scheda). Attivo basso con pull-up,
// stessa convenzione del base: l'evento è il fronte HIGH→LOW.
void cellSensorBegin(int input, uint32_t lockoutMs);

// Lato loop(): estrae il prossimo fronte catturato dalla ISR (timestamp
// esp_timer locale, µs). Ritorna false se non ce ne sono.
bool cellSensorPop(uint64_t &localUs);

// Stato istantaneo dell'ingresso (true = LOW = fascio interrotto/attivo).
bool cellSensorActive();

// Fronti scartati dal lockout (utile per tarare il debounce).
uint32_t cellSensorLockedOutCount();

#endif
