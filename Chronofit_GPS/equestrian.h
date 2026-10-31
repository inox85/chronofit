#ifndef EQUESTRIAN_H
#define EQUESTRIAN_H

#include <Arduino.h>
#include <ESPAsyncWebServer.h>

// Gare di equitazione (salto ostacoli): turno del cavaliere, campana, conto alla
// rovescia con partenza automatica, interruzioni, penalità e risultati.
//
// - Regolamento ("varianti") e dati della gara (linee di partenza/arrivo,
//   percorso, tempo concesso) sono salvati in NVS (blob "eq_cfg"): restano anche
//   caricando un nuovo fs.bin. I valori predefiniti delle varianti sono un punto
//   di partenza da verificare con il regolamento della gara (FEI/FISE).
// - Turno (round): Pronto → (campana) Conto alla rovescia → (passaggio sulla
//   linea di partenza o scadenza con partenza automatica) In corso ⇄ Interrotto
//   (campana) → (passaggio sulla linea di arrivo, eliminazione o tempo limite)
//   Arrivato → Confermato. Un solo turno attivo alla volta.
// - Il risultato (tempo, penalità di percorso e di tempo, totale, eliminazione)
//   lo calcola la Main; le pagine lo mostrano e calcolano solo la classifica.
// - I turni della sessione stanno in /eq_rounds.json (una riga JSON per turno) e
//   si cancellano con la sessione. Un turno in corso a un riavvio viene annullato.
// - Le pagine ricevono TYPE_EQ_UPDATE (turno attivo e "rev", che cambia quando
//   cambia un qualsiasi turno) e TYPE_EQ_CONFIG (regolamento modificato).

// Dal setup(), dopo LittleFS e NVS.
void equestrianBegin();

// Dal loop(): conto alla rovescia, partenza automatica, tempo limite,
// salvataggio dei turni e aggiornamenti periodici alle console.
void equestrianLoop();

// Dal loop(), per ogni passaggio registrato: linea 1-6, istante del passaggio,
// linea abilitata (o passaggio manuale).
void equestrianOnPassage(int line, uint64_t tUs, bool enabled);

// Sessione cancellata: via anche i turni.
void equestrianClear();

void equestrianRegisterRoutes(AsyncWebServer &server);

#endif
