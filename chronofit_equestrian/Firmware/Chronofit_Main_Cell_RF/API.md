# ChronofitMainCell RF — API Reference

Copia dell'API di `Chronofit_Main_Cell` per la versione sulla scheda delle barriere `Chronofit_BLE` con radio NRF24. Le differenze sono: le route delle fotocellule RF (`/cellsPair`, `/cellConfig`, `/cellCmd`, `/cellRemove`), gli ingressi locali (`/localInputsSave`), i campi `radio`/`local` e i campi delle celle RF in `GET /cells`, i campi batteria/radio in `/systemSettings`, e manca `/email` (invio della sessione via email, tolto per far stare il firmware nella partizione standard da 4 MB). L'AP si chiama `ChronofitMainCellRF_<chipId>`. Il protocollo radio è descritto in `rf_protocol.h`.

Testo originale di `Chronofit_Main_Cell`: derivata da `Chronofit_GPS/API.md`. ChronofitMainCell è l'unità centrale del sistema a fotocellule wireless: stessa console e stessa API del base, ma **senza GPS, RTC termocompensato, stampante e MQTT**. Mancano quindi le route `/print`, tutte le route `/mqtt*` e `/sendCheckPointRow`, `/syncTest`, `/setNmeaDeltaDebug`, `/setSerialDebug`, ogni modalità di sincronizzazione dell'orario (resta solo l'elapsed, vedi `/setTime`) e i campi GPS/RTC di `/systemSettings`. L'AP si chiama `ChronofitMainCell_<chipId>` (stesso schema di password del base).

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
| `11` | `TYPE_LINE_UPDATED` | Configurazione linea aggiornata |
| `12` | `TYPE_CELLS_UPDATED` | Cambiata la lista delle fotocellule, l'abbinamento o gli ingressi locali (stesso JSON di `GET /cells`); inviato solo quando cambia qualcosa di visibile |
| `20` | `TYPE_EQ_UPDATE` | Equitazione: turno attivo cambiato o in corso (vedi [Equitazione](#equitazione-salto-ostacoli)) |
| `21` | `TYPE_EQ_CONFIG` | Equitazione: regolamento cambiato |

---

## Tempo

### `GET /time`
Restituisce l'orario corrente preciso.

**Risposta JSON:**
```json
{ "hh": 10, "mm": 23, "ss": 45, "ms": 678 }
```

---

### 🔒 `GET /setTime`
Riarma il cronometro in modalità **elapsed**: il tempo trascorso riparte da zero al prossimo segnale di start (sensore o cella wireless). ChronofitMainCell non ha sincronizzazione dell'orario: è l'unica modalità (all'avvio il dispositivo è già in attesa dello start).

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `mode` | int | Facoltativo; se presente deve essere `3` (elapsed), altrimenti risponde `400` |

**Risposta:** `Wait start signal`.

---

### 🔒 `GET /setOffset`
Imposta solo l'offset UTC senza cambiare modalità.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `offset` | int | Offset UTC (-12 … +14) |

---

### `GET /timeBaseCal`
Calibrazione manuale della base tempi (fattore moltiplicativo salvato in NVS `timeCal`). Non c'è calibrazione automatica: senza RTC la deriva del quarzo ESP32 (~10–20 ppm) incide solo sull'ora assoluta, non sugli intervalli.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `delta_us` | int | Deviazione in microsecondi misurata |
| `minutes` | int | Finestra di misurazione in minuti |

---

## Checkpoint e sessione

### `GET /checkPoint`
Registra manualmente un passaggio (normalmente generato dall'hardware IR). Conta come su una linea abilitata anche se la linea è disabilitata: riga abilitata, beep e, sulla linea di start in attesa, avvio del tempo trascorso (il passaggio della barriera di una linea disabilitata invece no).

**Parametri:**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `lineNumber` | int | 0 | Indice **0-based** della linea (0 = linea 1) che ha rilevato il passaggio |

**Risposta:** testo di conferma con timestamp. Il base timbra l'istante di *arrivo* della richiesta: latenza e jitter di rete finiscono nel tempo (per le fotocellule wireless usare `/remoteCheckpoint`).

---

### `GET /clockSync`
Restituisce l'orologio `esp_timer` del base in microsecondi (stringa decimale), campionato come prima istruzione dell'handler. Usato dalle fotocellule wireless per stimare l'offset di clock (round-trip, stile NTP).

**Risposta:** `text/plain`, es. `123456789012`.

**Parametri opzionali (battito di presenza della fotocellula):** `cell` (id), `line` (1–4), `rssi` (dBm), `rtt` (µs, miglior RTT misurato), `fw` (versione). Se `cell` e `line` sono presenti il base registra/aggiorna la cella in elenco (vedi `GET /cells`); senza parametri la route resta un semplice clock. La route non richiede autenticazione, quindi la presenza è solo informativa (falsificabile) e non influisce sui tempi.

---

### `GET /cells`
Elenco delle fotocellule viste dalla Main: le Cell RF abbinate (`Chronofit_Cell_RF`, radio NRF24) e le Cell WiFi (`Chronofit_Cell`). Una cella è `connected` se si è fatta sentire negli ultimi 10 s (battito RF ogni ~1 s, `/clockSync` per le WiFi); altrimenti resta in elenco come persa. Al massimo 8 celle: una Cell WiFi persa da più tempo può essere sostituita da una nuova, una Cell RF abbinata resta finché non viene rimossa (`/cellRemove`). Lo stesso JSON viene inviato sul WebSocket (`t = 12`) a ogni cambiamento.

**Risposta JSON:**
```json
{
  "t": 12, "n": 2, "total": 2,
  "cells": [
    { "id": "1a2b3c4d", "line": 2, "rssi": -50, "rtt": 1450, "fw": "CR1.0.0",
      "ip": "RF", "connected": true, "conflict": false,
      "ageMs": 600, "lastEventAgeMs": 42000, "events": 7,
      "rf": true, "link": 100, "bat": 3950, "batPct": 83, "batMin": 245, "txMain": 1, "txCell": 1, "input": false, "pending": 0,
      "lockoutMs": 200, "buzzer": 1 },
    { "id": "a4cf12345678", "line": 3, "rssi": -58, "rtt": 3100, "fw": "C1.1.1",
      "ip": "192.168.10.2", "connected": true, "conflict": false,
      "ageMs": 1800, "lastEventAgeMs": -1, "events": 0, "rf": false }
  ],
  "radio": { "ok": true, "id": "5e6f7a8b", "channel": 80, "pairingS": 0 },
  "main": { "bat": 3910, "batPct": 79, "charging": false, "batMin": 310 },
  "local": { "barrierLine": 1, "padLine": 0, "padEdge": 1, "barrier": false, "pad": false }
}
```
- `conflict` è `true` se la linea della cella è usata anche da un'altra cella connessa o da un ingresso locale della Main.
- `ageMs` è `-1` per una Cell RF abbinata che non si è ancora fatta sentire da quando la Main è accesa; `lastEventAgeMs` è `-1` se la cella non ha ancora inviato passaggi.
- `rtt` è il ritardo (µs) del campione di sync migliore.
- Cell RF: l'NRF24 non misura l'RSSI, quindi `rssi` è un valore convenzionale ricavato da `link` (percentuale di scambi riusciti sugli ultimi 20): -50 = link ≥ 60 % (4 tacche), -60 = ≥ 35 % (3), -70 = ≥ 15 % (2), -80 = sotto (1), 0 = sconosciuto. `bat` è la batteria della cella in mV e `batPct` la sua carica in % (vedi sotto), `input` lo stato del fascio, `pending` i passaggi in coda sulla cella. `lossAck` / `lossResp`: scambi falliti sugli ultimi 20, rispettivamente senza ACK hardware (il pacchetto non è arrivato alla Main: distanza, ostacoli, alimentazione del modulo) e senza risposta (la Main l'ha ricevuto ma non ha risposto entro 60 ms: Main occupata, per esempio durante una scrittura in flash). Presenti dalla versione CR1.1.0 della cella. `line` 0 = nessuna linea (la cella non invia passaggi).
- `radio`: stato del modulo NRF24 della Main, suo id (= kit delle celle) e secondi rimanenti di abbinamento.
- `lockoutMs`: lockout effettivo della cella = Ritardo della sua linea (al massimo 60000 ms).
- `txMain` / `txCell`: potenza di trasmissione scelta in automatico, rispettivamente della Main verso la cella e della cella verso la Main: 0 = minima … 3 = massima (`RF24_PA_MIN`…`RF24_PA_MAX`), -1 = non ancora nota. Vedi `RfPowerCtl` in `rf_protocol.h`.
- `main`: batteria della Main (`bat` in mV, `batPct` in %) e caricatore attivo (`charging`).
- `batPct` è calcolata dalla Main dalla tensione (le celle inviano solo i mV), per batterie al litio con step-up a potenza costante: 3900 mV o più = 100 %, 3100 mV = 0 %, seguendo la curva di scarica (3,5 V ≈ 22 %, 3,6 V ≈ 38 %, 3,7 V ≈ 62 %, 3,8 V ≈ 82 %). Il tempo residuo `batMin` conta invece anche l'energia tra 4,1 e 3,9 V. Vale -1 se la tensione non è ancora nota. In carica la tensione è più alta del reale, quindi la percentuale è sovrastimata.
- `batMin` (Main e Cell RF): tempo residuo stimato in minuti, `-1` se non disponibile (tensione non nota o batteria in carica), `-2` se la stima è in corso. A potenza assorbita costante la carica cala in modo lineare: la Main filtra la tensione (media esponenziale di circa un minuto), registra la carica una volta al minuto e ne ricava la pendenza con una regressione sugli ultimi 40 minuti. Finché i dati sono pochi usa il consumo medio delle sessioni precedenti (NVS `bat_rate` per la Main, `cbat_rate` per le Cell RF). Le Cell RF non comunicano se sono in carica: la Main lo deduce da una risalita della tensione. Vedi `battery_runtime.cpp`. Quando cambiano la percentuale o il tempo residuo, la Main invia un `TYPE_CELLS_UPDATED` al massimo una volta al minuto.
- `local`: ingressi locali della Main (vedi `/localInputsSave`); `barrier`/`pad` = ingresso attivo in questo momento.

---

### 🔒 `GET /cellsPair`
Apre o chiude l'abbinamento delle Cell RF. Con l'abbinamento aperto la Main lo segnala nel beacon radio e accetta le richieste: si abbina una Cell non abbinata, oppure una Cell già abbinata a un'altra Main che, da quando è accesa (da meno di 2 minuti), non ha mai sentito la sua Main. La nuova cella riceve la prima linea libera (non usata da ingressi locali o altre celle), lockout 200 ms e beep attivo.

| Parametro | Descrizione |
|---|---|
| `on` | `1` (default) apre, `0` chiude |
| `s` | Durata in secondi (default 60, max 600) |

**Risposta:** `Pairing open` / `Pairing closed`, `503` se il modulo radio non risponde.

---

### 🔒 `GET /cellConfig`
Configura una Cell RF abbinata. La configurazione è salvata nella Main (`/rf_cells.json`) e arriva alla cella al sync successivo (entro ~1 s).

| Parametro | Descrizione |
|---|---|
| `id` | Id della cella (come in `/cells`) |
| `line` | (opz.) Linea 1–4, `0` = nessuna |
| `lockoutMs` | (opz.) **Ignorato** da MR1.3.0: il lockout di una Cell RF è il Ritardo (`d`) della sua linea, vedi `/checkPointFields` |
| `buzzer` | (opz.) `1`/`0`, beep a ogni passaggio |

**Risposta:** `OK`, `400` (valore non valido), `404` (cella RF sconosciuta).

---

### 🔒 `GET /cellCmd`
Comando a una Cell RF, consegnato al sync successivo.

| Parametro | Descrizione |
|---|---|
| `id` | Id della cella |
| `cmd` | `beep` = la cella lampeggia e suona per 3 s (per trovarla), `test` = passaggio di prova come se il sensore fosse scattato ora, `batcal` = taratura della batteria della cella |
| `mv` | (solo `batcal`) tensione della batteria della cella misurata al tester, 2500–5000 mV |

**Risposta:** `OK`, `400`, `404`.

---

### `GET /batteryCurve`
Curve di scarica tensione → carica usate dalla Main: la tipica e quelle apprese (una per la Main, una comune alle Cell RF), più le scariche in registrazione. Vedi `battery_curve.cpp`.

```json
{
  "grid": [3100, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 4000, 4100],
  "default": [0, 3, 8, 17, 30, 48, 64, 78, 90, 100],
  "main": { "n": 2, "pct": [0, 2.5, 7.1, 15.8, 31.2, 50.4, 66, 80.3, 91.2, 100] },
  "cell": { "n": 0, "pct": null },
  "logging": [ { "id": "1a2b3c4d", "minutes": 184, "startMv": 4096, "lastMv": 3712 } ]
}
```

- `pct` è la carica sulla scala intera (100 % = inizio della scarica sotto i 4100 mV) per ogni tensione di `grid`; `null` se la curva è quella tipica. `n` = scariche complete da cui è appresa (media delle ultime 4). La carica mostrata (`batPct`) è riportata a 100 % da 3900 mV.
- Una scarica si registra (un campione ogni 2 minuti) da quando, dopo una carica piena, la tensione filtrata scende sotto i 4100 mV, fino allo spegnimento per batteria scarica; vale se dura almeno un'ora e finisce sotto i 3200 mV. Una ricarica o una cella spenta prima della fine la scartano.

### 🔒 `GET /batteryCurveReset`
Torna alla curva tipica. Parametro `kind` = `main`, `cell` o `all`.

---

### 🔒 `GET /batteryCal`
Taratura della batteria della Main. `mv` = tensione misurata al tester (2500–5000, meglio con il caricatore scollegato). La Main calcola il fattore del partitore e lo salva in NVS (`bat_factor`).

**Risposta:** il nuovo fattore (millesimi) o `400`.

---

### 🔒 `GET /cellRemove`
Rimuove l'abbinamento di una Cell RF. Al sync successivo la Main risponde alla cella che non la conosce e la cella dimentica l'abbinamento (si può abbinare di nuovo).

**Parametri:** `id`. **Risposta:** `OK`, `400`, `404`.

---

### 🔒 `GET /localInputsSave`
Ingressi locali della Main (scheda `Chronofit_BLE`): fotocellula su GPIO17 e pedana su GPIO36. Ogni parametro è opzionale; salvati in NVS e applicati subito. Il lockout è quello della linea (`d1`–`d4`).

| Parametro | Descrizione |
|---|---|
| `barrierLine` | Linea della fotocellula 1–4, `0` = disattivata (default 1) |
| `padLine` | Linea della pedana 1–4, `0` = disattivata (default 0) |
| `padEdge` | `0` = passaggio al contatto, `1` = al rilascio (default 1, partenza da pedana) |

**Risposta:** `OK` o `400`.

---

### 🔒 `GET /remoteCheckpoint`
Registra un passaggio proveniente da una fotocellula wireless (`Chronofit_Cell`) con timestamp già espresso nel clock `esp_timer` del base. Il passaggio entra nella stessa pipeline di un sensore cablato (sync su linea, avvio elapsed, buzzer, WebSocket).

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
| `d` | int | — | Delay linea in millisecondi. È anche il lockout degli ingressi locali e delle Cell RF della linea (alle celle al massimo 60000); salvato in NVS, default 200 |
| `e` | int | — | Abilitato: `1` / `0` (con `0` i passaggi restano in sessione come righe disabilitate, senza beep né start del tempo) |

**Esempio:** `GET /checkPointFields?l=2&c=7&e=1`

---

### `GET /lineDisableAfterPass`
Disattivazione automatica delle linee dopo il primo passaggio. Con il valore `1`, al primo passaggio una linea abilitata viene disattivata (`e = 0`, notificato con `TYPE_LINE_UPDATED`) e resta così finché non viene riabilitata con `/checkPointFields` (`e=1`). I passaggi successivi restano in sessione come righe disabilitate, senza beep e senza far partire il tempo trascorso. Salvato in NVS (`line_once`), default `0`.

| Parametro | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `v` | int | — | `1` attiva, `0` disattiva. Senza parametro restituisce solo lo stato |

**Risposta:** `{ "v": 0 }`

---

### `GET /license`
Stato della licenza a numero di accensioni (vedi `license.h`).

**Risposta:** `{ "device": "f43aece0f908", "left": 49, "unlimited": false, "active": true, "seq": 3, "boot": 2716393851, "contact": "" }`

- `device`: codice dispositivo da comunicare al produttore (seriale della scheda, eFuse MAC in 12 cifre esadecimali, come `sn` in `/systemSettings`). `left`: accensioni residue dopo quella in corso (`-1` = illimitata). Un'accensione vera si conta solo dopo 90 s di funzionamento o al primo passaggio registrato (`LICENSE_COMMIT_MS`): programmazione, pressione di EN e monitor seriale non consumano utilizzi. `active`: `false` = licenza esaurita, i passaggi non vengono registrati. `boot` cambia a ogni avvio (la console mostra il popup una volta per avvio).

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
| `d` | Delay linea in millisecondi. È anche il lockout degli ingressi locali e delle Cell RF della linea (alle celle al massimo 60000); salvato in NVS, default 200 |
| `e` | Abilitato: `1` / `0` |

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

Turno del cavaliere, campana, penalità e classifica, calcolati dalla Main (`equestrian.cpp`). È la **gara assistita**, spenta di default (`GET /eqEnable`): da spenta la Main non usa i passaggi per i turni, i comandi rispondono `off` e la linea di start del tempo trascorso è quella scelta con `/elapsedStartLine`, cioè il cronometraggio standard. Le pagine (`data/equestrian.js`, console e view equitazione) mostrano lo stato e inviano i comandi. Funziona sopra il cronometraggio elapsed normale: i passaggi restano registrati nella sessione come sempre.

**Turno** (`st`): `ready` (cavaliere selezionato, linee riarmate) → `countdown` (campana suonata, conto alla rovescia) → `running` (partito: passaggio sulla linea di partenza, fine del conto alla rovescia con partenza automatica, o comando) ⇄ `paused` (campana durante il percorso: interruzione) → `finished` (passaggio sulla linea di arrivo, tempo limite superato, eliminazione o ritiro) → `confirmed`. Un turno può diventare `cancelled`. Selezionando il cavaliere successivo il turno `finished` diventa `confirmed`, uno non ancora partito `cancelled`. Se la linea di partenza coincide con quella di arrivo, l'arrivo vale solo dopo 2 s dalla partenza.

**Calcolo** (per turno):
- penalità percorso = Σ errori × punti; gli errori con secondi (es. rifiuto con abbattimento) li aggiungono al tempo;
- eliminazione: errore con `elim`, errori di un gruppo arrivati a `elimAt` (es. 2° rifiuto), tempo limite superato, o manuale;
- tempo = cronometrato (senza le interruzioni) + correzioni in secondi, troncato al centesimo; oppure il tempo corretto dal giudice (`time`);
- penalità tempo = intervalli di `every` s oltre il tempo concesso (iniziati se `commenced`, altrimenti completi) × `amount`, in punti (`mode` 1) o in secondi aggiunti al tempo (`mode` 2);
- tempo concesso = `ta` se impostato, altrimenti lunghezza / velocità arrotondato al secondo superiore; tempo limite = concesso × `tl`. La 2ª fase o il barrage usano `ta2` / `length2`, se impostati;
- linea intermedia (`course.mid`): con una variante a due fasi consecutive (`final` 2, `consec`) è l'arrivo della 1ª fase. Se il cavaliere è netto (0 penalità, non eliminato né ritirato) la 1ª fase si chiude confermata e parte subito, da quell'istante, un nuovo turno della 2ª fase; altrimenti il turno finisce lì. Con le altre varianti registra solo il tempo intermedio del turno (`mid`). La Main arma con il cavaliere anche la linea intermedia.

Messaggi WebSocket: `{ "t": 20, "rev": 12, "cur": {…turno…} }` (`TYPE_EQ_UPDATE`) a ogni cambiamento e ogni secondo durante conto alla rovescia e percorso; `{ "t": 21 }` (`TYPE_EQ_CONFIG`) quando cambia il regolamento. Quando `rev` cambia le pagine ricaricano `GET /eq`.

### `GET /eqEnable`
Accende (`on=1`) o spegne (`on=0`) la gara assistita, salvata in NVS (`eq_on`, default spenta). Senza parametri restituisce lo stato. Spegnendola il turno attivo viene chiuso (arrivato → confermato, altrimenti annullato) e la linea di start del tempo trascorso torna a quella di `/elapsedStartLine`. Invia `{ "t": 21 }`.

**Risposta:** `{ "on": true }`

### `GET /eq`
Stato completo: `on` (gara assistita accesa), regolamento (come `GET /eqConfig`), `rev`, `cur` (id del turno attivo, `0` = nessuno), `taMs` e `taMs2` (tempo concesso della 1ª e della 2ª fase/barrage) e `rounds`, tutti i turni (al massimo 400, salvati in `/eq_rounds.json`; vengono cancellati con la sessione).

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
| `sm` | Modalità di sync (sempre `3` = elapsed) |
| `utc` | Offset UTC |
| `sn` | Nome stazione |
| `bz` | Buzzer abilitato (0/1) |

---

### 🔒 `GET /setAttribute`
Aggiorna attributi del dispositivo.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
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
| `files` | Lista file nel filesystem |
| `batteryMv` | Batteria della Main (mV, mediana) |
| `batteryPct` | Carica della batteria della Main in % (stessa scala di `batPct` in `GET /cells`) |
| `batteryMin` | Tempo residuo stimato della batteria della Main in minuti (come `batMin` in `GET /cells`) |
| `charging` / `charged` | Caricatore attivo / carica completa |
| `radioOk` / `radioId` | Modulo NRF24 presente / id della Main (kit) |

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

## Note generali

- Tutte le risposte sono in `text/plain` o `application/json` a seconda della route.
- Il server non implementa CORS — le richieste cross-origin vanno gestite lato client.
- Le route GET usano parametri query string (`?param=value&...`).
- Le route POST usano body JSON (`Content-Type: application/json`) salvo dove indicato diversamente (multipart).
- Il WebSocket è l'unico canale bidirezionale; tutte le altre route sono unidirezionali (request/response).
