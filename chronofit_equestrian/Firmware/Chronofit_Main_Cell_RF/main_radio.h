#ifndef MAIN_RADIO_H
#define MAIN_RADIO_H

#include <Arduino.h>

// Radio NRF24 della Main (protocollo in rf_protocol.h). Un task dedicato
// ascolta le Cell RF, risponde ai sync, riceve i passaggi e pubblica il beacon.
// È l'unico che tocca il modulo radio.

// Ritorna false se il modulo radio non risponde (il resto della Main funziona).
bool mainRadioBegin();

bool     mainRadioOk();
uint32_t mainRadioId();             // id della Main = kit delle sue celle
String   mainRadioIdStr();          // id in esadecimale (8 cifre)

// Abbinamento: per `ms` le Cell RF non abbinate (o accese da poco e senza la
// loro Main) che sentono il beacon si abbinano a questa Main. 0 = chiudi.
void     mainRadioSetPairing(uint32_t ms);
uint32_t mainRadioPairingRemainingMs();

// Istante dell'ultimo pacchetto valido ricevuto (millis), per il LED.
uint32_t mainRadioLastRxMs();

#endif
