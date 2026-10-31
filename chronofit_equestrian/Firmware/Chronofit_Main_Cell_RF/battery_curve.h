#ifndef BATTERY_CURVE_H
#define BATTERY_CURVE_H

#include <Arduino.h>

// Curva di scarica tensione → carica, usata dalla Main per sé e per le Cell RF
// (le celle inviano solo i mV). C'è una curva per la Main e una condivisa da
// tutte le Cell RF: all'inizio sono la curva tipica di una cella al litio a
// potenza costante, poi la Main le impara dalle scariche complete.
//
// Apprendimento: dopo una carica piena (tensione filtrata oltre 4100 mV), da
// quando la tensione scende sotto i 4100 mV la Main ne registra un campione ogni
// 2 minuti fino allo spegnimento per batteria scarica. A potenza costante la
// carica cala in modo lineare nel tempo, quindi il campione i di n vale
// 100 × (n−1−i)/(n−1) %: da qui la carica a ogni tensione della griglia. La
// nuova curva si media con quelle delle ultime scariche (/bat_curve.json).
// Una scarica interrotta (ricarica, cella spenta o persa prima della fine)
// viene scartata. Per la Main i campioni stanno in /bat_log_main.bin, perché la
// scarica finisce con la Main che si spegne: si valuta al riavvio.

enum BatteryCurveKind : uint8_t { BAT_CURVE_MAIN = 0, BAT_CURVE_CELL = 1 };

// Dal setup(), dopo il montaggio di LittleFS.
void batteryCurveBegin();

// Carica reale sulla curva intera (0–100 %, 100 % = scarica appena iniziata
// sotto i 4100 mV), senza arrotondare: per la stima del tempo residuo.
float batteryPercentF(float mv, BatteryCurveKind kind);

// Carica mostrata (0–100 %): 100 % da 3900 mV in su, sotto scala lungo la
// stessa curva. -1 se la tensione non è nota. Leggibile da qualunque task.
int batteryPercent(uint16_t mv, BatteryCurveKind kind);

// Registrazione delle scariche, chiamata da battery_runtime ogni secondo con la
// tensione filtrata. `id` = 0 per la Main, rfId per le Cell RF. `present` =
// false quando la cella non si sente più (spenta o fuori portata).
void batteryCurveFeed(uint32_t id, BatteryCurveKind kind, uint32_t now,
                      float emaMv, bool charging, bool present);

// Cella rimossa: libera la sua registrazione.
void batteryCurveForget(uint32_t id);

// Torna alla curva tipica (kind = BAT_CURVE_MAIN o BAT_CURVE_CELL).
void batteryCurveReset(BatteryCurveKind kind);

// {"grid":[mV...],"default":[%...],"main":{"n":scariche,"pct":[...]|null},
//  "cell":{...},"logging":[{"id","minutes","startMv","lastMv"}...]}
String batteryCurveJson();

#endif
