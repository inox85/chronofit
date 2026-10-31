#ifndef LOCAL_INPUTS_H
#define LOCAL_INPUTS_H

#include <Arduino.h>

// Ingressi locali della Main (scheda Chronofit_BLE): fotocellula su GPIO17 e
// pedana su GPIO36. Ognuno si assegna a una linea 1..4 (0 = disattivato);
// il lockout è quello della linea (delays[], "Ritardo" nella console).
//
// L'interrupt salva l'istante del fronte (esp_timer, µs); loop() lo conferma
// dopo LOCAL_DEBOUNCE_MS senza bloccare (come Chronofit_BLE/Barriers) e solo
// allora genera il passaggio, con l'istante del fronte. La rilettura del
// livello scarta anche gli interrupt spuri del GPIO36 (errata ESP32).

constexpr uint32_t LOCAL_DEBOUNCE_MS = 10;

constexpr int PAD_EDGE_CONTACT = 0;   // passaggio quando l'atleta sale sulla pedana
constexpr int PAD_EDGE_RELEASE = 1;   // passaggio quando la lascia (partenza da pedana)

void localInputsBegin();
void localInputsPoll();

// Salva in NVS e applica subito. Valori fuori range = invariati.
void localInputsConfigure(int barrierLine, int padLine, int padEdge);

int  localBarrierLine();
int  localPadLine();
int  localPadEdge();
bool localBarrierActive();
bool localPadActive();

#endif
