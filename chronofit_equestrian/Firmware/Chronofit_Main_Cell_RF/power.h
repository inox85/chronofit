#ifndef POWER_H
#define POWER_H

// Alimentazione della scheda Chronofit_BLE: autoritenuta, pulsante, batteria,
// stato del caricatore. Portato da Chronofit_BLE/PowerManager.
//
// FILE CONDIVISO: Chronofit_Main_Cell_RF/power.* e Chronofit_Cell_RF/power.*
// devono restare identici.

#include <Arduino.h>

// Da chiamare per prima in setup(): porta HIGH l'autoritenuta (altrimenti la
// scheda si spegne al rilascio del pulsante) e fa la sequenza dei LED.
// `beep` (opzionale) suona allo spegnimento.
void powerBegin(void (*beep)() = nullptr);

// Dal loop(): campiona la batteria (spegne se scarica) e gestisce il pulsante.
void powerUpdate();

// Pressione lunga in corso: numero di LED da tenere accesi (4 → 0, uno in meno
// ogni 500 ms; a 0 la scheda si spegne). -1 = pulsante non premuto.
int powerButtonCountdown();

// Dopo una pressione breve, per 3 s: numero di LED da accendere (da LED1) per
// mostrare la carica (4 = oltre il 75 %, 3, 2, 1 lampeggiante = sotto il 25 %;
// 0 durante il lampeggio). -1 = barra non visibile.
int powerBatteryBar();

// Spegnimento (autoritenuta LOW). Se la scheda resta accesa perché alimentata
// da USB la funzione ritorna dopo qualche secondo.
void powerOff();

int  powerBatteryMv();      // mediana delle ultime letture (0 = non ancora letta)
// Batteria bassa (sotto il 30 % della carica, con isteresi); false con
// alimentazione esterna. Lo sketch lo usa per l'avviso sonoro.
bool powerBatteryLow();
// Carica in % calcolata dalla Main con la curva di scarica (-1 = non nota): la
// usano powerBatteryLow() e powerBatteryBar(). Va ripassata almeno ogni 30 s,
// altrimenti si torna alle soglie in tensione della curva tipica.
void powerSetBatteryPercent(int pct);

// Taratura della batteria di QUESTA scheda: `realMv` = tensione misurata al
// tester (meglio senza caricatore collegato). Salva il fattore in NVS
// ("bat_factor") e lo restituisce; -1 se la misura non è plausibile.
int  powerBatteryCalibrate(int realMv);
int  powerBatteryFactor();  // fattore del partitore in millesimi
bool powerCharging();       // caricatore attivo
bool powerCharged();        // carica completa
bool powerExternal();       // alimentazione esterna presente (in carica o carica completa)

#endif
