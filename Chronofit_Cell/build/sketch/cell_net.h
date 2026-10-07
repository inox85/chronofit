#line 1 "C:\\src\\chronofit\\Chronofit_Cell\\cell_net.h"
#ifndef CELL_NET_H
#define CELL_NET_H

#include <Arduino.h>

extern String chipIdStr;

struct CellNetStatus {
  bool     ssidConfigured;  // è stato impostato un SSID del base
  bool     staConnected;
  int      rssi;
  String   staIp;
  bool     syncValid;       // offset utilizzabile (campione recente)
  int64_t  offsetUs;        // base_esp_timer - local_esp_timer
  uint32_t rttUs;           // RTT del campione migliore
  uint32_t syncAgeMs;       // età del campione migliore usato
  uint32_t syncSamples;     // campioni validi in finestra
  uint32_t sent;            // eventi consegnati (OK)
  uint32_t duplicates;      // risposte DUP (consegnati ma già visti)
  uint32_t rejected;        // 400 dal base (timestamp/linea non validi)
  uint32_t dropped;         // scaduti o coda piena
  uint32_t pending;         // in coda adesso
  String   lastError;
  uint32_t lastErrorAgeMs;  // da quanto è stato impostato lastError (UINT32_MAX = mai)
};

// Avvia WiFi (AP + STA) e il task di rete (sync clock + invio eventi).
void cellNetBegin();

// Accoda un fronte (timestamp esp_timer locale, µs) da inviare al base.
void cellEnqueueEvent(uint64_t localUs);

CellNetStatus cellNetStatus();

String cellApSsid();

#endif
