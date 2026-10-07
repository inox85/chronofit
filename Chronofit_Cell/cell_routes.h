#ifndef CELL_ROUTES_H
#define CELL_ROUTES_H

#include <Arduino.h>

extern volatile bool shouldRestart;

// Registra tutte le route HTTP (UI di configurazione + API) e avvia il server.
void cellRoutesBegin();

#endif
