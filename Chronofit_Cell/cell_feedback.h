#ifndef CELL_FEEDBACK_H
#define CELL_FEEDBACK_H

#include <Arduino.h>
#include "cell_net.h"

// Feedback in campo (4 LED WS2812 + buzzer della scheda), senza display:
//
//   LED0  collegamento al base / sync clock
//         viola lampeggiante = nessun SSID del base configurato
//         rosso              = non collegata al WiFi del base
//         giallo             = collegata, clock non ancora sincronizzato
//         verde              = collegata e sincronizzata
//         arancione          = sincronizzata ma rete lenta (RTT alto → precisione ridotta)
//   LED1  segnale WiFi verso il base (RSSI): verde ≥ -60 dBm, giallo ≥ -75, rosso sotto;
//         spento se non collegata
//   LED2  sensore: bianco = ingresso attivo (utile per l'allineamento),
//         blu (150 ms) = fronte rilevato
//   LED3  consegna al base (priorità dall'alto):
//         rosso      = errore negli ultimi 10 s (base non raggiungibile, token errato,
//                      evento rifiutato o scartato)
//         arancione  = eventi in coda non ancora consegnati
//         verde      = lampo di 300 ms a ogni consegna confermata dal base
//         ciano fioco = un telefono/PC è collegato alla AP di configurazione
//         spento     = tutto ok, nulla da segnalare
void cellFeedbackBegin(bool buzzerEnabled);
void cellFeedbackTrigger();
void cellFeedbackUpdate(const CellNetStatus &st, bool inputActive, int apClients);

#endif
