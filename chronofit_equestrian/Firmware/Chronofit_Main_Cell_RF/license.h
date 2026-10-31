#ifndef LICENSE_H
#define LICENSE_H

#include <Arduino.h>

// Licenza a numero di accensioni.
//
// FILE CONDIVISO: license.h e license.cpp sono identici in Chronofit_GPS,
// Chronofit_Main_Cell e Chronofit_Main_Cell_RF. Il segreto sta in
// license_secret.h (generato da Firmware/License/keygen.py --init, escluso da git):
// deve essere lo stesso del keygen, altrimenti nessun codice viene accettato.
//
// - Il codice dispositivo è il seriale della scheda: l'eFuse MAC del chip in 12
//   cifre esadecimali minuscole (es. f43aece0f908), come `chipIdStr` e il campo
//   `sn` di /systemSettings.
// - Ogni accensione vera (ESP_RST_POWERON; non i riavvii software, gli OTA o i
//   crash) consuma un utilizzo, ma solo se la scheda resta accesa almeno
//   LICENSE_COMMIT_MS o registra un passaggio: i riavvii dovuti alla programmazione
//   (esptool resetta la scheda a ogni scrittura), alla pressione di EN o all'apertura
//   del monitor seriale non contano. A zero utilizzi la scheda parte bloccata: niente
//   passaggi, finché non si inserisce un codice. Una scheda senza licenza salvata
//   (nuova o con la NVS cancellata) parte bloccata.
// - Il codice di sblocco (16 caratteri base32 Crockford, XXXX-XXXX-XXXX-XXXX)
//   contiene un progressivo (16 bit), il numero di accensioni concesse (16 bit,
//   0xFFFF = illimitata) e 48 bit di HMAC-SHA256(segreto, "CFL2" | dispositivo
//   (6 byte) | progressivo | accensioni). Imposta gli utilizzi residui al valore concesso; un
//   codice con progressivo non superiore all'ultimo applicato viene rifiutato.

// Contatto del produttore mostrato nel popup della licenza ("" = testo generico).
#define LICENSE_CONTACT ""

enum LicenseResult {
  LICENSE_OK = 0,
  LICENSE_ERR_FORMAT,    // non è un codice di 16 caratteri validi
  LICENSE_ERR_INVALID,   // firma sbagliata (codice di un altro dispositivo o errato)
  LICENSE_ERR_USED,      // progressivo già usato
};

// Tempo di funzionamento dopo il quale un'accensione vera viene contata.
#define LICENSE_COMMIT_MS 90000UL

// Dal setup(), dopo l'apertura delle impostazioni NVS: legge lo stato e segna
// l'accensione da contare (il conteggio avviene in licenseLoop() o al primo passaggio).
void licenseBegin();

// Dal loop(): conta l'accensione dopo LICENSE_COMMIT_MS di funzionamento.
void licenseLoop();

// Da checkPointRoutine(): un passaggio vero conta subito l'accensione.
void licenseCountPassage();

// true se questa accensione può cronometrare.
bool licenseActive();

LicenseResult licenseApply(const char *code);

// {"device","left","unlimited","active","seq","boot","contact"}
String licenseJson();

#endif
