#ifndef CELLS_H
#define CELLS_H

#include <Arduino.h>

// Registro delle fotocellule wireless (Chronofit_Cell) viste dal base.
// Il "battito" è la richiesta /clockSync che ogni cella fa ogni ~3 s con
// ?cell=<id>&line=<1..4>&rssi=&rtt=&fw=; /remoteCheckpoint aggiunge l'ultimo
// passaggio. Una cella è "connessa" se è stata sentita negli ultimi
// CELL_LOST_AFTER_MS, altrimenti resta in elenco come "persa".

constexpr int      CELLS_MAX          = 8;
constexpr uint32_t CELL_LOST_AFTER_MS = 10000;

// Da /clockSync (task async_tcp). `ip` = IP della cella (uint32 lwip).
void cellsTouch(const char *id, int line, int rssi, uint32_t rttUs, const char *fw, uint32_t ip);

// Da /remoteCheckpoint, dopo la scrittura del passaggio.
void cellsEvent(const char *id, int line, uint32_t ip);

// Porta UDP su cui le celle ascoltano il comando di beep.
constexpr uint16_t CELL_BEEP_PORT = 4210;

// Da /checkPoint (passaggio simulato dalla GUI): manda un pacchetto UDP a ogni cella
// connessa sulla linea `line` (1..4) perché faccia anche lei il beep. Senza risposta
// né ritentativi: se si perde, la cella semplicemente non suona.
void cellsBeepLine(int line);

// Da loop() (~1 Hz): marca le celle perse e ricalcola i conflitti di linea.
// Ritorna true se è cambiato qualcosa di visibile e va fatto un broadcast.
bool cellsPoll();

// {"t":TYPE_CELLS_UPDATED,"n":connesse,"total":note,"cells":[...]}
String cellsToJson();

#endif
