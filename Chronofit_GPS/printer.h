// routes.h
#pragma once
#include <Arduino.h>
#include "globals.h"

// flag: codice a 4 caratteri stampato in coda alla riga (vedi checkpointFlagLabel).
void printFormatted(int index, String line, int competitor, int hh, int mm, int ss, int ms, int cr, const char* flag);

// Determina il codice da stampare in coda alla riga di checkpoint:
// ANN (annullata) > EDIT (modificata) > SCR (linea 6, "fuori pressostato",
// innescata da pressione schermo) > MAN/AUT (in base alla modalità di
// rilevamento configurata sulla linea, per le linee 1-4).
const char* checkpointFlagLabel(int lineNumber, int lineMode, bool cancelled, bool edited);

// Inizializza task e coda
void printerInit();

// Funzione asincrona di stampa
void printOnPrinter(const String &text, int cr);

// Etichetta breve della modalità di sincronizzazione (MAN/EST/GPS), usata
// sullo scontrino. Stringa vuota per le modalità senza sincronizzazione
// (es. MODE_ELAPSED_TIME) — in quel caso print*Sync* non stampa nulla.
const char* syncModeLabel(int mode);

// Stampata quando la sincronizzazione viene stabilita per la prima volta
// (GPS agganciato, segnale da linea esterna ricevuto, orario manuale impostato).
void printSyncStart(int mode, int hh, int mm, int ss, int ms);

// Stampata ad ogni conferma/test di sincronizzazione successivo alla prima.
void printSyncConfirm(int mode, int hh, int mm, int ss, int ms);