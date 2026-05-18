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
| `lineNumber` | int | 0 | Numero di linea che ha rilevato il passaggio |

**Risposta:** testo di conferma con timestamp.

---

### `GET /getCheckpoints`
Scarica il file di sessione corrente (`session.json`) in streaming chunked.

**Risposta:** file NDJSON (newline-delimited JSON), una riga per ogni checkpoint.

**Formato riga:**
```json
{"id":1,"ln":1,"lId":"A1","c":42,"h":10,"m":23,"s":45,"ms":678,"x":0,"e":1}
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

## WiFi

### `GET /wifiCredential`
Restituisce lo stato della connessione WiFi STA.

**Risposta JSON:**
```json
{ "ssid": "MyNetwork", "staConnected": true, "staIp": "192.168.1.42" }
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
| `showPopup` | int | Mostra popup su ricezione MQTT (0/1) |
| `acquireRow` | int | Acquisisce riga remota nella sessione (0/1) |
| `immediateMode` | int | Pubblica immediatamente senza conferma (0/1) |

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
