#ifndef CELL_FEEDBACK_H
#define CELL_FEEDBACK_H

#include <Arduino.h>
#include "cell_radio.h"

// Feedback in campo con i 4 LED discreti e il buzzer della scheda Chronofit_BLE:
//
//   LED1  collegamento alla Main
//         lampeggio lento (1 Hz)    = non abbinata (in attesa di un abbinamento)
//         lampeggio veloce (4 Hz)   = abbinata, Main non raggiungibile o clock non sincronizzato
//         doppio lampeggio          = sincronizzata ma con ritardo radio alto (precisione ridotta)
//         acceso fisso              = sincronizzata
//   LED2  sensore: acceso = fascio interrotto (utile per l'allineamento);
//         si inverte per 150 ms a ogni passaggio
//   LED3  consegna dei passaggi (priorità dall'alto)
//         lampeggio veloce = passaggio rifiutato o perso negli ultimi 10 s
//         (gli scambi falliti e poi ritentati con successo non contano)
//         acceso fisso     = passaggi in coda non ancora consegnati
//         flash di 300 ms  = consegna confermata dalla Main
//         spento           = nulla da segnalare
//   LED4  ricarica: fisso = carica completa, lampeggio = in carica
//
// "Trova" dalla console (o abbinamento riuscito): tutti i LED lampeggiano e il
// buzzer suona per 3 s. Durante la pressione lunga del pulsante restano accesi
// i LED del conto alla rovescia di spegnimento; dopo una pressione breve, per
// 3 s, la barra della carica (powerBatteryBar).

void cellFeedbackBegin();
void cellFeedbackSetBuzzer(bool enabled);
void cellFeedbackTrigger();          // passaggio rilevato
void cellFeedbackLocate();           // "trova la cella"

// true durante "Trova" (e per poco dopo): il buzzer suonato a lungo può
// disturbare l'ingresso della fotocellula e generare passaggi falsi.
bool cellFeedbackSuppressSensor();
void cellFeedbackBeep(uint32_t ms);  // beep non bloccante (anche con buzzer disattivato)
// Avviso di batteria bassa: tre beep da 120 ms (anche con buzzer disattivato)
void cellFeedbackLowBattery();
void cellFeedbackUpdate(const CellRadioStatus &st, bool inputActive);

#endif
