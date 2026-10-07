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
| `d` | int | — | Delay linea in millisecondi |
| `e` | int | — | Abilitato: `1` / `0` |

**Esempio:** `GET /checkPointFields?l=2&c=7&e=1`

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
| `d` | Delay linea in millisecondi |
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
Restituisce informazioni complete sull'hardware e sul sistema.

**Risposta JSON (campi principali):**

| Campo | Descrizione |
|---|---|
| `cpuTemp` | Temperatura CPU |
| `freeRam` | RAM libera (byte) |
| `minFreeRam` | Minimo RAM libera raggiunto |
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

---

## Note generali

- Tutte le risposte sono in `text/plain` o `application/json` a seconda della route.
- Il server non implementa CORS — le richieste cross-origin vanno gestite lato client.
- Le route GET usano parametri query string (`?param=value&...`).
- Le route POST usano body JSON (`Content-Type: application/json`) salvo dove indicato diversamente (multipart).
- Il WebSocket è l'unico canale bidirezionale; tutte le altre route sono unidirezionali (request/response).
