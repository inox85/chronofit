#ifndef CELLS_H
#define CELLS_H

#include <Arduino.h>
#include "rf_protocol.h"

// Registro delle fotocellule viste dalla Main.
//
// - Cell RF (Chronofit_Cell_RF, NRF24): vanno ABBINATE (vedi main_radio). La
//   configurazione di ogni cella abbinata (linea, lockout, buzzer) è decisa
//   qui, salvata in /rf_cells.json e inviata alla cella a ogni sync. Una cella
//   abbinata resta in elenco anche se non si è mai fatta sentire.
// - Cell WiFi (Chronofit_Cell): compatibilità con la versione WiFi. Il
//   "battito" è /clockSync con ?cell=&line=&rssi=&rtt=&fw=, i passaggi
//   arrivano da /remoteCheckpoint. La linea la decide la cella.
//
// Una cella è "connessa" se è stata sentita negli ultimi CELL_LOST_AFTER_MS.

constexpr int      CELLS_MAX          = 8;
constexpr uint32_t CELL_LOST_AFTER_MS = 10000;

constexpr uint16_t RF_CELL_DEFAULT_LOCKOUT_MS = 200;

// Carica della batteria in %: batteryPercent() in battery_curve.h.

// Carica le Cell RF abbinate da LittleFS (dopo il montaggio del filesystem).
void cellsBegin();

// Da loop(): salva /rf_cells.json se l'elenco degli abbinamenti è cambiato.
void cellsSaveIfNeeded();

// ── Cell WiFi ───────────────────────────────────────────────────────────────
// Da /clockSync (task async_tcp). `ip` = IP della cella (uint32 lwip).
void cellsTouch(const char *id, int line, int rssi, uint32_t rttUs, const char *fw, uint32_t ip);
// Da /remoteCheckpoint, dopo la scrittura del passaggio.
void cellsEvent(const char *id, int line, uint32_t ip);

// ── Cell RF (dal task radio) ────────────────────────────────────────────────
// Battito (SYNC_REQ). Ritorna false se la cella non è abbinata; altrimenti
// copia la configurazione da inviarle e il comando in attesa (che viene consumato).
bool cellsRfSync(const RfSyncReq &req, RfCellConfig &cfg, uint8_t &cmd, uint16_t &cmdArg);
// Livelli di potenza correnti (0..3): della Main verso la cella e della cella verso la Main.
void cellsRfSetPower(uint32_t id, uint8_t mainLevel, uint8_t cellLevel);

// Abbinamento: crea la cella con la configurazione di default (prima linea
// libera) o, se è già abbinata, ne restituisce la configurazione.
// Ritorna false se il registro è pieno.
bool cellsRfPair(uint32_t id, const char *fw, RfCellConfig &cfg);

// Passaggio già validato (linea e timestamp). Ritorna RF_EV_OK se è nuovo,
// RF_EV_DUP se `seq` è quello dell'ultimo passaggio, RF_EV_NOT_PAIRED.
uint8_t cellsRfEvent(uint32_t id, uint32_t seq, int line);

// ── Cell RF (dalle route) ───────────────────────────────────────────────────
// `id` = id esadecimale come in cellsToJson(). Ritornano false se la cella
// RF non esiste. Valori negativi = invariati.
bool cellsRfConfigure(const char *id, int line, int lockoutMs, int buzzer);
bool cellsRfCommand(const char *id, uint8_t cmd, uint16_t arg = 0);
bool cellsRfRemove(const char *id);

// Da loop() (~1 Hz): marca le celle perse e ricalcola i conflitti di linea.
// Ritorna true se è cambiato qualcosa di visibile e va fatto un broadcast.
bool cellsPoll();

// Forza un broadcast al prossimo cellsPoll() (es. cambio ingressi locali o abbinamento).
void cellsMarkDirty();

// Batteria delle Cell RF abbinate, per la stima del tempo residuo (battery_runtime).
struct CellBatterySnap {
  uint32_t rfId;
  uint16_t mv;
  bool     connected;
};
// Riempie `out` (al massimo `max` celle) e ritorna quante sono.
int cellsRfBatterySnapshot(CellBatterySnap *out, int max);

// Numero di Cell RF connesse (LED della Main).
int cellsRfConnected();

// {"t":TYPE_CELLS_UPDATED,"n":connesse,"total":note,"cells":[...],
//  "radio":{...},"local":{...}}
String cellsToJson();

#endif
