#ifndef BATTERY_RUNTIME_H
#define BATTERY_RUNTIME_H

#include <Arduino.h>

// Stima del tempo residuo della batteria della Main e delle Cell RF.
//
// A potenza assorbita costante la carica (in %, dalla curva di scarica di
// batteryPercentF() in battery_curve.h, appresa dalla Main) cala in modo lineare nel tempo: la pendenza si ricava con
// una regressione lineare sugli ultimi BR_SAMPLES minuti della tensione filtrata
// (media esponenziale di circa un minuto) e il tempo residuo è carica / pendenza.
// Finché i dati sono pochi si usa il consumo medio (%/h) imparato nelle sessioni
// precedenti e salvato in NVS (bat_rate per la Main, cbat_rate per le Cell RF).
//
// In carica la stima è sospesa: per la Main lo dice il caricatore, per le Cell RF
// (che inviano solo i mV) si deduce da una risalita della tensione.

// Valori restituiti oltre ai minuti
constexpr int BATTERY_MIN_UNKNOWN    = -1;   // tensione non nota o in carica
constexpr int BATTERY_MIN_ESTIMATING = -2;   // dati ancora insufficienti

// Dal setup(), dopo l'apertura delle impostazioni NVS.
void batteryRuntimeBegin();

// Dal loop(): campiona la Main e le Cell RF (una volta al secondo).
void batteryRuntimeUpdate();

// Minuti residui (o BATTERY_MIN_*). Leggibili da qualunque task.
int batteryRuntimeMainMinutes();
int batteryRuntimeCellMinutes(uint32_t rfId);

#endif
