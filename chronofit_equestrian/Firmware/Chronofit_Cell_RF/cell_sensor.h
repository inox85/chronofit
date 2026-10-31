#ifndef CELL_SENSOR_H
#define CELL_SENSOR_H

#include <Arduino.h>

// Fotocellula della Cell (GPIO17, attiva bassa). L'interrupt salva l'istante
// del fronte (esp_timer, µs); cellSensorPoll() lo conferma dopo
// CELL_DEBOUNCE_MS senza bloccare (come Chronofit_BLE/Barriers) e restituisce
// il passaggio (fronte verso "attivo") con l'istante del fronte.

void cellSensorBegin(uint32_t lockoutMs);
void cellSensorSetLockout(uint32_t lockoutMs);

// Dal loop(): true se c'è un passaggio nuovo; `localUs` = istante del fronte.
bool cellSensorPoll(uint64_t &localUs);

// Stato confermato (true = fascio interrotto).
bool cellSensorActive();

// Passaggi scartati dal lockout.
uint32_t cellSensorLockedOutCount();

#endif
