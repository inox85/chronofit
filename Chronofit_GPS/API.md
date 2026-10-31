# Chronofit GPS — API Reference

Tutte le route sono esposte dal server HTTP AsyncWebServer sull'ESP32, raggiungibili sia via rete AP (`192.168.10.1`) che via STA (IP assegnato dal router).

---

## Autenticazione

Alcune route richiedono autorizzazione. Il controllo avviene tramite la funzione `isAuthorized()`:
- Se non è configurato nessun token NVS, tutte le richieste sono autorizzate.
- Se è configurato un token, la richiesta deve includere l'header `X-Token: <valore>`.

Le route che richiedono autorizzazione sono marcate con 🔒.

---

## WebSocket

### `WS /ws`
Connessione WebSocket bidirezionale per il push real-time degli eventi.

**Messaggi inviati dal server (JSON):**

| Campo `t` | Tipo evento | Descrizione |
|---|---|---|
| `0` | `TYPE_CHECKPOINT` | Nuovo passaggio registrato |
| `1` | `TYPE_TIME_UPDATE` | Aggiornamento orologio (ogni secondo) |
| `2` | `TYPE_SESSION_CLEARED` | Sessione cancellata |
| `3` | `TYPE_PARAMS_UPDATED` | Parametri di sistema aggiornati |
| `4` | `TYPE_ROW_UPDATED` | Riga sessione modificata |
| `5` | `TYPE_GENERIC_MESSAGE` | Messaggio generico |
| `6` | `TYPE_EMAIL_SENT` | Conferma email inviata |
| `11` | `TYPE_LINE_UPDATED` | Configurazione linea aggiornata |
| `12` | `TYPE_CELLS_UPDATED` | Cambiata la lista delle fotocellule wireless (stesso JSON di `GET /cells`); inviato solo quando cambia qualcosa di visibile |
| `20` | `TYPE_EQ_UPDATE` | Equitazione: turno attivo cambiato o in corso (vedi [Equitazione](#equitazione-salto-ostacoli)) |
| `21` | `TYPE_EQ_CONFIG` | Equitazione: regolamento cambiato |

---

## Tempo e sincronizzazione

### `GET /time`
Restituisce l'orario corrente preciso.

**Risposta JSON:**
```json
{ "hh": 10, "mm": 23, "ss": 45, "ms": 678 }
```

---

### 🔒 `GET /setTime`
Imposta l'orario e la modalità di sincronizzazione.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `mode` | int | `0` = manuale, `1` = sincronizzazione su chiusura linea, `2` = GPS, `3` = elapsed (nessun sync) |
| `hour` | int | Ore (0–23) — usato in modalità 0 e 1 |
| `minute` | int | Minuti (0–59) |
| `second` | int | Secondi (0–59) |
| `gpsInterval` | int | Intervallo sync GPS in minuti (solo modalità 2) |
| `utcOffset` | int | Offset UTC (-12 … +14) |

**Risposta:** testo descrittivo dell'operazione eseguita.

---

### 🔒 `GET /setOffset`
Imposta solo l'offset UTC senza cambiare modalità.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `offset` | int | Offset UTC (-12 … +14) |

---

### `GET /syncTest`
Avvia un test di sincronizzazione (emette segnale su linea di sync).

**Risposta:** testo di conferma.

---

### `GET /timeBaseCal`
Calibrazione della base tempi del RTC.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `delta_us` | int | Deviazione in microsecondi misurata |
| `minutes` | int | Finestra di misurazione in minuti |
| `agingFactor` | int | (alternativa) fattore di aging diretto del RTC |

---

## Checkpoint e sessione

### `GET /checkPoint`
Registra manualmente un passaggio (normalmente generato dall'hardware IR).

**Parametri:**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `lineNumber` | int | 0 | Indice **0-based** della linea (0 = linea 1) che ha rilevato il passaggio |

Il passaggio manuale conta come valido anche su una linea disabilitata (riga con `e = 1`, beep, può far partire il tempo trascorso). `lineNumber` fuori da 0–5 → 400.

**Risposta:** testo di conferma con timestamp. Il base timbra l'istante di *arrivo* della richiesta: latenza e jitter di rete finiscono nel tempo (per le fotocellule wireless usare `/remoteCheckpoint`).

---

### `GET /clockSync`
Restituisce l'orologio `esp_timer` del base in microsecondi (stringa decimale), campionato come prima istruzione dell'handler. Usato dalle fotocellule wireless per stimare l'offset di clock (round-trip, stile NTP).

**Risposta:** `text/plain`, es. `123456789012`.

**Parametri opzionali (battito di presenza della fotocellula):** `cell` (id), `line` (1–4), `rssi` (dBm), `rtt` (µs, miglior RTT misurato), `fw` (versione). Se `cell` e `line` sono presenti il base registra/aggiorna la cella in elenco (vedi `GET /cells`); senza parametri la route resta un semplice clock. La route non richiede autenticazione, quindi la presenza è solo informativa (falsificabile) e non influisce sui tempi.

---

### `GET /cells`
Elenco delle fotocellule wireless viste dal base. Una cella è `connected` se ha mandato un battito (`/clockSync`) negli ultimi 10 s; altrimenti resta in elenco come persa (fino a 8 celle, la più vecchia persa viene sostituita da una nuova). Lo stesso JSON viene inviato sul WebSocket (`t = 12`) a ogni cambiamento.

**Risposta JSON:**
```json
{
  "t": 12, "n": 1, "total": 2,
  "cells": [
    { "id": "a4cf12345678", "line": 2, "rssi": -58, "rtt": 3100, "fw": "C1.0.0",
      "ip": "192.168.10.2", "connected": true, "conflict": false,
      "ageMs": 1800, "lastEventAgeMs": 42000, "events": 7 }
  ]
}
```
`conflict` è `true` se due celle connesse dichiarano la stessa linea. `lastEventAgeMs` è `-1` se la cella non ha ancora inviato passaggi; `rssi` è `0` se sconosciuto.

---

### 🔒 `GET /remoteCheckpoint`
Registra un passaggio proveniente da una fotocellula wireless (`Chronofit_Cell`) con timestamp già espresso nel clock `esp_timer` del base. Il passaggio entra nella stessa pipeline di un sensore cablato (sync su linea, avvio elapsed, buzzer, stampa, MQTT, WebSocket).

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `lineNumber` | int | Linea **1-based** (1–4), diversamente da `/checkPoint` |
| `t` | uint64 | Istante del fronte in µs, dominio `esp_timer` del base |
| `seq` | uint32 | (opz.) Numero progressivo: uno stesso `seq` ripetuto sulla stessa linea risponde `DUP` senza duplicare il passaggio |

**Risposta:** `OK`, `DUP`, oppure `400` (`Missed params`, `Bad lineNumber`, `Bad timestamp` se `t` è oltre 50 ms nel futuro o più vecchio di 5 minuti).

---

### `GET /getCheckpoints`
Scarica il file di sessione corrente (`session.json`) in streaming chunked.

**Risposta:** file NDJSON (newline-delimited JSON), una riga per ogni checkpoint.

**Formato riga:**
```json
{"id":1,"ln":1,"lId":"A1","c":42,"h":10,"m":23,"s":45,"ms":678,"x":0,"e":1,"p":0,"r":0}
```

| Campo | Descrizione |
|---|---|
| `id` | Indice progressivo del passaggio |
| `ln` | Numero linea |
| `lId` | ID linea (stringa) |
| `c` | Numero competitor |
| `h`,`m`,`s`,`ms` | Orario evento |
| `x` | Penalità (secondi) |
| `e` | Abilitato (1) / disabilitato (0) |
| `p` | Tipo prova/sensore (testo libero impostato dall'utente, es. "FPC 102") |
| `r` | Modalità trigger (`0` = automatico, `1` = manuale) |

---

### `GET /downloadSession`
Scarica il file di sessione come allegato (Content-Disposition: attachment).

**Risposta:** stesso formato di `/getCheckpoints`, con header per il download diretto.

---

### 🔒 `GET /athletes` · `POST /athletes`
Copia di sicurezza dell'elenco competitor della console, che il browser tiene nel `localStorage`: se la console si apre da un altro dispositivo o indirizzo, o i dati del sito vengono cancellati, l'elenco locale risulta vuoto e la console lo ripristina da questa copia.

- `GET`: restituisce il JSON dell'elenco (array di `{competitor, name, surname, team, …}`); 404 con `[]` se la copia non esiste.
- `POST`: corpo JSON dell'intero elenco (massimo 64 KB, scritto in `/athletes.json` in modo atomico). Risposta `{ "ok": true }`, oppure 413 `size` / 500 `fs`.

La copia **si perde con l'aggiornamento del filesystem** (`fs.bin`); `/clearSession` non la tocca.

---

### 🔒 `GET /clearSession`
Cancella l'intera sessione corrente (elimina `session.json`). Notifica tutti i client WebSocket.

**Risposta:** testo di conferma.

---

### `GET /checkPointFields`
Aggiorna la configurazione di una linea tramite query string. Solo `l` è obbligatorio; gli altri parametri sono facoltativi — vengono modificati solo i campi presenti.

**Parametri:**

| Parametro | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `l` | int | ✅ | Numero linea (1–4) |
| `ld` | string | — | ID linea |
| `c` | int | — | Numero competitor assegnato |
| `d` | int | — | Delay (lockout) della linea in millisecondi, salvato in NVS (`ldelay_<linea>`, default `0`) |
| `e` | int | — | Abilitato: `1` / `0` |

**Esempio:** `GET /checkPointFields?l=2&c=7&e=1`

---

### `GET /lineDisableAfterPass`
Disattivazione automatica delle linee dopo il primo passaggio. Con il valore `1`, al primo passaggio una linea abilitata viene disattivata (`e = 0`, notificato con `TYPE_LINE_UPDATED`) e resta così finché non viene riabilitata con `/checkPointFields` (`e=1`). I passaggi successivi restano in sessione come righe disabilitate. Salvato in NVS (`line_once`), default `0`.

| Parametro | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `v` | int | — | `1` attiva, `0` disattiva. Senza parametro restituisce solo lo stato |

**Risposta:** `{ "v": 0 }`

---

### `GET /license`
Stato della licenza a numero di accensioni (vedi `license.h`).

**Risposta:** `{ "device": "f43aece0f908", "left": 49, "unlimited": false, "active": true, "seq": 3, "boot": 2716393851, "contact": "" }`

- `device`: codice dispositivo da comunicare al produttore (seriale della scheda, eFuse MAC in 12 cifre esadecimali, come `sn` in `/systemSettings`). `left`: accensioni residue dopo quella in corso (`-1` = illimitata). Un'accensione vera si conta solo dopo 90 s di funzionamento o al primo passaggio registrato (`LICENSE_COMMIT_MS`): programmazione, pressione di EN e monitor seriale non consumano utilizzi. `active`: `false` = licenza esaurita, i passaggi non vengono registrati. `boot` cambia a ogni avvio: sotto i 20 utilizzi la console mostra il popup a ogni caricamento della pagina, e di nuovo se `boot` cambia.

### `GET /licenseApply`
Applica un codice di sblocco generato dal produttore (`Firmware/License/keygen.py`). Parametro `code` (16 caratteri, `XXXX-XXXX-XXXX-XXXX`). Imposta le accensioni residue al valore del codice.

**Risposta:** come `GET /license`; errore 400 `{ "ok": false, "error": "format" | "invalid" | "used" }`.

---

### `GET /elapsedStartLine`
Linea il cui primo passaggio fa partire il tempo trascorso (modalità elapsed). Senza parametri restituisce il valore attuale. Salvata in NVS (`el_start`), default `0`.

| Parametro | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `l` | int | — | `0` = qualsiasi linea, `1`–`4` = solo quella linea |

**Risposta:** `{ "l": 0 }`

---

### `POST /checkPointFields`
Aggiorna la configurazione di una linea (competitor, ID linea, delay, stato). Tutti i campi sono inviati nel body.

**Body JSON:**
```json
{ "l": 1, "ld": "A1", "c": 42, "d": 500, "e": 1 }
```

| Campo | Descrizione |
|---|---|
| `l` | Numero linea (1–4) |
| `ld` | ID linea (stringa) |
| `c` | Numero competitor assegnato |
| `d` | Delay (lockout) della linea in millisecondi, salvato in NVS (`ldelay_<linea>`, default `0`) |
| `e` | Abilitato: `1` / `0` |

---

### `POST /sendCheckPointRow`
Invia (o re-invia) manualmente un passaggio: stampa sulla stampante termica e pubblica su MQTT.

**Body JSON:**
```json
{ "lineNumber": 1, "index": 5, "lineId": "A1", "competitor": 42, "hour": 10, "minute": 23, "second": 45, "millis": 678 }
```

---

### `POST /updateCheckPointRow`
Modifica un passaggio esistente nella sessione (aggiorna `session.json`).

**Body JSON:**
```json
{ "index": 5, "lineNumber": 1, "lineId": "A1", "competitor": 42, "hour": 10, "minute": 23, "second": 45, "millis": 678, "penality": 0 }
```

Il campo `index` identifica il record da modificare. Se non esiste viene creato.

---

## Equitazione (salto ostacoli)

Turno del cavaliere, campana, penalità e classifica, calcolati dal dispositivo (`equestrian.cpp`). Sono le **gare**, spente di default (`GET /eqEnable`; nella console il toggle «Gare» si vede solo con la disciplina Equitazione): da spente il dispositivo non usa i passaggi per i turni, i comandi rispondono `off` e la linea di start del tempo trascorso è quella scelta con `/elapsedStartLine`, cioè il cronometraggio standard. Le pagine (`data/equestrian.js`, console e view equitazione) mostrano lo stato e inviano i comandi. Funziona sopra il cronometraggio elapsed normale: i passaggi restano registrati nella sessione come sempre.

**Turno** (`st`): `ready` (cavaliere selezionato, linee riarmate) → `countdown` (campana suonata, conto alla rovescia) → `running` (partito: passaggio sulla linea di partenza, fine del conto alla rovescia con partenza automatica, o comando) ⇄ `paused` (campana durante il percorso: interruzione) → `finished` (passaggio sulla linea di arrivo, tempo limite superato, eliminazione o ritiro) → `confirmed`. Un turno può diventare `cancelled`. Selezionando il cavaliere successivo il turno `finished` diventa `confirmed`, uno non ancora partito `cancelled`. Se la linea di partenza coincide con quella di arrivo, l'arrivo vale solo dopo 2 s dalla partenza.

**Calcolo** (per turno):
- penalità percorso = Σ errori × punti; gli errori con secondi (es. rifiuto con abbattimento) li aggiungono al tempo;
- eliminazione: errore con `elim`, errori di un gruppo arrivati a `elimAt` (es. 2° rifiuto), tempo limite superato, o manuale;
- tempo = cronometrato (senza le interruzioni) + correzioni in secondi, troncato al centesimo; oppure il tempo corretto dal giudice (`time`);
- penalità tempo = intervalli di `every` s oltre il tempo concesso (iniziati se `commenced`, altrimenti completi) × `amount`, in punti (`mode` 1) o in secondi aggiunti al tempo (`mode` 2);
- tempo concesso = `ta` se impostato, altrimenti lunghezza / velocità arrotondato al secondo superiore; tempo limite = concesso × `tl`. La 2ª fase o il barrage usano `ta2` / `length2`, se impostati;
- linea intermedia (`course.mid`): con una variante a due fasi consecutive (`final` 2, `consec`) è l'arrivo della 1ª fase. Se il cavaliere è netto (0 penalità, non eliminato né ritirato) la 1ª fase si chiude confermata e parte subito, da quell'istante, un nuovo turno della 2ª fase; altrimenti il turno finisce lì. Con le altre varianti registra solo il tempo intermedio del turno (`mid`). Il dispositivo arma con il cavaliere anche la linea intermedia.

Messaggi WebSocket: `{ "t": 20, "rev": 12, "cur": {…turno…} }` (`TYPE_EQ_UPDATE`) a ogni cambiamento e ogni secondo durante conto alla rovescia e percorso; `{ "t": 21 }` (`TYPE_EQ_CONFIG`) quando cambia il regolamento. Quando `rev` cambia le pagine ricaricano `GET /eq`.

### `GET /eqEnable`
Accende (`on=1`) o spegne (`on=0`) le gare, salvata in NVS (`eq_on`, default spenta). Senza parametri restituisce lo stato. Spegnendola il turno attivo viene chiuso (arrivato → confermato, altrimenti annullato) e la linea di start del tempo trascorso torna a quella di `/elapsedStartLine`. Invia `{ "t": 21 }`.

**Risposta:** `{ "on": true }`

### `GET /eq`
Stato completo: `on` (gare accese), regolamento (come `GET /eqConfig`), `rev`, `cur` (id del turno attivo, `0` = nessuno), `taMs` e `taMs2` (tempo concesso della 1ª e della 2ª fase/barrage) e `rounds`, tutti i turni (al massimo 400, salvati in `/eq_rounds.json`; vengono cancellati con la sessione).

Turno: `{ "id", "comp", "phase", "v" (variante), "st", "auto" (partenza automatica), "ta", "tl" (ms), "t" (tempo ms), "fp" (penalità percorso), "tp" (penalità tempo), "pts" (totale), "tt" (tempo con le penalità in secondi), "elim", "ret", "reason" ("refusals" | "time_limit" | "manual" | etichetta dell'errore), "ovr" (tempo corretto), "mid" (tempo intermedio ms, 0 = non passato), "faults" [conteggi per tipo], "cd" (ms al termine del conto alla rovescia) }`. `fp`, `tp` e `pts` sono in punti (anche decimali).

### `GET /eqCmd`
Comandi del turno. Risposta `{ "ok": true }` o errore 400 `{ "ok": false, "error": "off" | "running" | "state" | "no_round" | "fault" | "cmd" }`.

| `c` | Altri parametri | Effetto |
|---|---|---|
| `select` | `comp`, `phase` (opz.), `force=1`, `rearm=0` (opz.) | Nuovo turno per il cavaliere: assegna il suo numero alle linee di partenza e arrivo, le riabilita (non con `rearm=0`: ne lascia invariato lo stato) e mette il tempo trascorso in attesa. Con un turno in corso risponde `running`, salvo `force=1` |
| `reset` | `rearm=0` (opz.) | Reset del tempo trascorso: annulla il turno attivo (confermato se concluso) e ne crea uno pronto per lo stesso cavaliere, così la campana torna attiva. Con `rearm=0` le linee non vengono riabilitate. Senza turno attivo risponde `no_round` |
| `bell` | — | Campana: avvia il conto alla rovescia, o interrompe / riprende il percorso |
| `start` / `finish` | `id` (opz.) | Partenza / arrivo manuale |
| `fault` | `k` (indice dell'errore), `d` (`1` / `-1`), `id` | Aggiunge o toglie un errore; un'eliminazione ferma il percorso |
| `status` | `s` = `elim` \| `ret` \| vuoto, `id` | Eliminato, ritirato o annulla lo stato |
| `confirm` / `cancel` | `id` | Conferma o annulla il turno |
| `time` | `ms` (`-1` = torna al tempo cronometrato), `id` | Tempo corretto dal giudice |
| `phase` | `p` (`1` / `2`), `id` | Fase o barrage del turno |

Senza `id` il comando vale per il turno attivo.

### `GET /eqConfig`
Regolamento e dati della gara (salvati in NVS, chiave `eq_cfg`). Con `reset=1` ripristina le varianti predefinite.

```json
{ "v": 1,
  "variants": [ { "name": "Tabella A a tempo", "cd": 45, "auto": true, "warn": true,
                  "tp": { "mode": 1, "every": 4, "amount": 1, "commenced": true }, "tl": 2,
                  "rank": 0, "final": 0, "consec": false,
                  "faults": [ { "label": "Abbattimento", "pts": 4, "sec": 0, "group": 0, "elimAt": 0, "elim": false } ] } ],
  "course": { "variant": 0, "start": 1, "finish": 2, "length": 350, "speed": 350, "ta": 0, "phase": 1, "mid": 0, "length2": 0, "ta2": 0 } }
```

- `cd`: secondi di conto alla rovescia (`0` = niente), `auto`: partenza automatica allo zero, `warn`: beep negli ultimi 5 s;
- `tp.mode`: `0` nessuna penalità tempo, `1` in punti, `2` in secondi; `tl`: tempo limite come multiplo del concesso (`0` = nessuno);
- `rank`: `0` punti poi tempo, `1` solo tempo, `2` solo punti; `final`: `0` percorso unico, `1` con barrage, `2` due fasi; `consec`: due fasi consecutive (servono la linea intermedia);
- `faults` (max 8): `group` + `elimAt` = eliminazione al numero di errori del gruppo; `elim` = eliminazione immediata;
- `course`: variante in uso, linee di partenza e arrivo, lunghezza (m), velocità (m/min), tempo concesso fisso (ms, `0` = calcolato), fase predefinita, linea intermedia (`mid`, `0` = nessuna, diversa da partenza e arrivo), lunghezza e tempo concesso fisso della 2ª fase/barrage (`length2`, `ta2`, `0` = come la 1ª fase / calcolato).

### `POST /eqConfig`
Salva il regolamento: corpo JSON come la risposta di `GET /eqConfig` (max 8 varianti). Risposta `{ "ok": true }` o 400 `{ "ok": false, "error": "config" }`. La linea di partenza diventa anche la linea di start del tempo trascorso.

---

## Impostazioni di sistema

### `GET /allSettings`
Restituisce tutte le impostazioni del dispositivo serializzate in JSON.

**Risposta JSON (campi principali):**

| Campo | Descrizione |
|---|---|
| `c1`–`c4` | Competitor assegnati alle linee 1–4 |
| `l1`–`l4` | ID linea 1–4 |
| `d1`–`d4` | Delay linee 1–4 (ms) |
| `e1`–`e4` | Stato abilitazione linee |
| `sm` | Sync method corrente |
| `si` | GPS sync interval |
| `utc` | Offset UTC |
| `sn` | Nome stazione |
| `print` | Stampa abilitata (0/1) |
| `bz` | Buzzer abilitato (0/1) |
| `mqttAcquireRow` | MQTT acquire row mode |
| `mqttImmediateMode` | MQTT immediate mode |
| `mqttShowPopup` | Mostra popup UI all'arrivo di messaggi MQTT (0/1) |

---

### 🔒 `GET /setAttribute`
Aggiorna attributi del dispositivo.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `printEnabled` | int | `1` = stampa abilitata, `0` = disabilitata |
| `buzzerEnable` | int | `1` = buzzer abilitato |
| `stationName` | string | Nome della stazione |

---

### `GET /systemSettings`
**Parametri opzionali:** `files=1` aggiunge `files` (elenco dei file: pesa svariati KB di RAM per richiesta, lo usa solo la pagina admin); `tasks=1` aggiunge `tasks` (stack libero in byte di ogni task, per dimensionarli).

Restituisce informazioni complete sull'hardware e sul sistema.

**Risposta JSON (campi principali):**

| Campo | Descrizione |
|---|---|
| `cpuTemp` | Temperatura CPU |
| `freeRam` | RAM libera (byte) |
| `minFreeRam` | Minimo RAM libera raggiunto |
| `maxAllocRam` | Blocco di RAM libera più grande (byte): indica la frammentazione |
| `resetReason` | Motivo dell'ultimo riavvio (power-on, software, panic, watchdog, brownout…) |
| `fwVersion` | Versione firmware |
| `hwName` | Nome hardware |
| `fsTotal` / `fsUsed` | Dimensione filesystem totale/usata |
| `gpsFix` | Stato fix GPS |
| `gpsLat` / `gpsLng` | Coordinate GPS |
| `gpsAlt` | Altitudine GPS |
| `gpsSat` | Numero satelliti |
| `files` | Lista file nel filesystem |

---

### 🔒 `GET /reset`
Riavvia il dispositivo (reboot).

**Risposta:** testo di conferma (il dispositivo si riavvia dopo l'invio).

---

## Branding e discipline

Impostazioni di branding/licensing a livello dealer: quali discipline sono
sbloccate nella schermata di selezione e se mostrare il logo sponsor
(`sponsor.png`, caricato da `sponsor.html`) sulle pagine. Pensate per essere
gestite da un tool esterno al dealer (o dalla pagina `branding.html`), non
dal cliente finale.

### `GET /brandingSettings`
Restituisce lo stato corrente di branding/licensing.

**Risposta JSON:**
```json
{
  "disciplines": { "regularity": 1, "ski": 1, "enduro": 1, "equestrian": 0 },
  "showSponsorLogo": 1,
  "sponsorLogoExists": true
}
```
`disciplines` è una mappa `id disciplina → 0|1` (1 = abilitata, 0 = visibile
ma bloccata nella schermata di selezione). Un id assente equivale a `1`
(abilitata). `showSponsorLogo` di default è `1` (per non cambiare il
comportamento sui device esistenti, dove `sponsor.png` è sempre mostrato
oggi). `sponsorLogoExists` indica se `/sponsor.png` è già stato caricato
(vedi `POST /upload`, o la pagina `sponsor.html`).

---

### 🔒 `GET /brandingSave`
Aggiorna lo stato di branding/licensing. Ogni parametro è opzionale: se
omesso, il relativo valore resta invariato.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `disciplines` | string (JSON) | Mappa `{"id":0\|1, ...}` da salvare così com'è |
| `showSponsorLogo` | int | `1` = mostra `sponsor.png` sulle pagine, `0` = nascondilo |

**Risposta:** testo di conferma `OK`.

---

## WiFi

### `GET /wifiCredential`
Restituisce lo stato della connessione WiFi STA.

**Risposta JSON:**
```json
{ "ssid": "MyNetwork", "staConnected": true, "staIp": "192.168.1.42" }
```

---

### `GET /wifiScan`
Scansione asincrona delle reti WiFi vicine. Richiamarla finché `scanning` è `true`: la prima chiamata avvia la scansione, quelle successive restituiscono `{"scanning":true}` finché è in corso, poi l'elenco.

Se la STA non è connessa, la scansione sospende i tentativi di riconnessione (che altrimenti la farebbero fallire) e li riprende a fine scansione. Durante la scansione l'AP può sparire per qualche istante: il client deve ritentare.

**Risposta JSON (a scansione conclusa):**
```json
{ "scanning": false, "networks": [ { "ssid": "MyNetwork", "rssi": -55, "channel": 6, "secure": true } ] }
```

---

### 🔒 `GET /wifiConnect`
Avvia la connessione WiFi STA.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `ssid` | string | SSID della rete |
| `pw` | string | Password della rete |

**Risposta:** testo di conferma (la connessione avviene in background).

---

### `GET /wifiStop`
Interrompe i tentativi di riconnessione WiFi STA.

**Risposta:** testo di conferma.

---

### 🔒 `GET /setApPassword`
Cambia la password dell'Access Point WiFi.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `current` | string | Password attuale dell'AP |
| `newpwd` | string | Nuova password (minimo 8 caratteri) |

**Risposta:** testo di conferma o messaggio di errore.

---

### `GET /resetApPassword`
⚠️ **Non richiede autorizzazione** — route di emergenza per ripristinare la password AP al valore di default (chip ID). Accessibile via rete STA anche se si è persa la password AP.

**Risposta:** testo di conferma.

---

## MQTT

### `GET /mqttSettings`
Restituisce la configurazione MQTT corrente.

**Risposta JSON:**
```json
{
  "subTopic": "gara1",
  "eventName": "evento",
  "prefix": "chronofit",
  "showPopup": 1,
  "acquireRow": 0,
  "immediateMode": 0,
  "brokerHost": "broker.example.com",
  "brokerPort": 1883,
  "brokerUser": "",
  "brokerPass": ""
}
```

Il topic di pubblicazione è: `{prefix}/{eventName}/{stationName}/{chipId}/checkpoint`

---

### `GET /mqttSave`
Salva le impostazioni MQTT generali.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `subTopic` | string | Subtopic (nome gara) |
| `eventName` | string | Nome evento |
| `prefix` | string | Prefisso del topic (default: `chronofit`) |
| `showPopup` | int | Mostra popup UI alla ricezione di un messaggio MQTT (0/1) |
| `acquireRow` | int | Acquisisce il competitor ricevuto nella lista atleti (0/1) |
| `immediateMode` | int | Registra la riga ricevuta immediatamente senza conferma utente (0/1) |

---

### `GET /mqttBrokerSave`
Salva la configurazione del broker MQTT e riconnette.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `host` | string | Hostname o IP del broker |
| `port` | int | Porta (default: 1883) |
| `user` | string | Username (opzionale) |
| `pass` | string | Password (opzionale) |

---

### `GET /mqttConfirmPending`
Conferma un'azione MQTT in attesa di approvazione.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID dell'azione pending |

---

### `GET /mqttDiscardPending`
Scarta un'azione MQTT in attesa di approvazione.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID dell'azione pending |

---

## Email

### `GET /email`
Invia un'email (richiede connessione internet via STA).

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `address` | string | Indirizzo email destinatario |

**Risposta:** testo di conferma (l'invio avviene in modo asincrono).

---

## Stampa

### `GET /print`
Invia testo alla stampante termica seriale.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `text` | string | Testo da stampare (URL-encoded) |
| `cr` | int | `1` = aggiunge carriage return, `0` = no |

---

## Gestione file

### `GET /download`
Scarica un file dal filesystem dell'ESP32.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `file` | string | Percorso del file (es. `/session.json`) |

⚠️ Protetto da path traversal: sono ammessi solo percorsi relativi alla root del filesystem.

---

### `DELETE /delete` 🔒
Elimina un file dal filesystem.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `file` | string | Percorso del file da eliminare |

---

### `POST /upload`
Upload generico di un file nel filesystem.

**Body:** `multipart/form-data` con il file nel campo `upload`.

⚠️ Protetto da path traversal.

---

### `POST /uploadFS`
Upload di un'intera immagine del filesystem (LittleFS). Usato per l'aggiornamento OTA del filesystem.

**Body:** `multipart/form-data` con il file nel campo `fs`.

---

## Firmware OTA

### `POST /update`
Aggiornamento firmware OTA.

**Body:** `multipart/form-data` con il file `.bin` nel campo `fw`.

**Risposta:** testo di conferma. Il dispositivo si riavvia automaticamente al termine.

### `POST /updatefs`
Aggiornamento OTA del filesystem (LittleFS), usato dalla pagina `update.html`.

**Body:** `multipart/form-data` con l'immagine `.bin` del filesystem.

**Risposta:** `OK - Riavvio...` oppure `ERRORE`. Se va a buon fine il dispositivo si riavvia. 🔒 L'autorizzazione è verificata all'inizio dell'upload.

---

## Debug

### 🔒 `GET /setSerialDebug`
Attiva o disattiva i messaggi di debug sulla seriale.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `enabled` | int | `1` attiva, `0` disattiva; senza parametro inverte lo stato |

**Risposta:** `serialDebug ON` / `serialDebug OFF`

### 🔒 `GET /setNmeaDeltaDebug`
Attiva o disattiva la stampa sulla seriale dello scarto tra PPS e frase NMEA.

| Parametro | Tipo | Descrizione |
|---|---|---|
| `enabled` | int | `1` attiva, `0` disattiva; senza parametro inverte lo stato |

**Risposta:** `nmeaDeltaDebug ON` / `nmeaDeltaDebug OFF`

---

## Note generali

- Tutte le risposte sono in `text/plain` o `application/json` a seconda della route.
- Il server non implementa CORS — le richieste cross-origin vanno gestite lato client.
- Le route GET usano parametri query string (`?param=value&...`).
- Le route POST usano body JSON (`Content-Type: application/json`) salvo dove indicato diversamente (multipart).
- Il WebSocket è l'unico canale bidirezionale; tutte le altre route sono unidirezionali (request/response).
