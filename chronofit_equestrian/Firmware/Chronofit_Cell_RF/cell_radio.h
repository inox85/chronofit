#ifndef CELL_RADIO_H
#define CELL_RADIO_H

#include <Arduino.h>

// Radio NRF24 della Cell (protocollo in rf_protocol.h). Un task dedicato fa
// abbinamento, sync del clock con la Main (che è anche il battito di
// presenza), invio dei passaggi con ritentativi e applica la configurazione e
// i comandi che arrivano dalla Main. È l'unico che tocca il modulo radio.

struct CellRadioStatus {
  uint32_t id;              // id di questa Cell
  uint32_t kit;             // id della Main abbinata (0 = non abbinata)
  bool     mainHeard;       // pacchetto valido dalla Main negli ultimi CELL_MAIN_LOST_MS
  bool     syncValid;       // offset utilizzabile
  int64_t  offsetUs;        // clock Main - clock Cell
  uint32_t delayUs;         // ritardo del campione migliore
  uint8_t  linkPct;         // scambi riusciti sugli ultimi CELL_LINK_WINDOW
  uint8_t  line;            // configurazione corrente
  uint16_t lockoutMs;
  bool     buzzer;
  uint32_t sent, duplicates, rejected, dropped, pending;
  uint32_t lastErrorAgeMs;  // UINT32_MAX = mai
  uint32_t lastAckMs;       // millis() dell'ultima consegna confermata (0 = mai)
};

// Ritorna false se il modulo radio non risponde.
bool cellRadioBegin();

// Accoda un passaggio (timestamp esp_timer locale, µs). Scartato se la Cell
// non ha una linea assegnata.
void cellRadioEnqueue(uint64_t localUs);

CellRadioStatus cellRadioStatus();

// Callback chiamati dal task radio (implementati nello sketch).
void onCellConfigChanged(uint8_t line, uint16_t lockoutMs, bool buzzer);
void onCellCommand(uint8_t cmd);

#endif
