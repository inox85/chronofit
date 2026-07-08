# Chronofit GPS — API Reference (Public)

Tutte le route sono esposte dal server HTTP integrato nel dispositivo Chronofit GPS, raggiungibile:
- In modalità **Access Point**: `http://192.168.10.1`
- In modalità **STA** (collegato a un router): all'IP assegnato dal router

---

## Autenticazione

Se è configurato un token di accesso, ogni richiesta deve includere l'header:

```
X-Token: <valore>
```

Le route che richiedono autorizzazione sono marcate con 🔒.  
Se non è configurato nessun token, tutte le richieste sono autorizzate.

---

## WebSocket

### `WS /ws`
Connessione WebSocket per la ricezione in tempo reale degli eventi del dispositivo.

**Messaggi inviati dal server (JSON):**

| Campo `t` | Evento | Descrizione |
|---|---|---|
| `0` | Nuovo passaggio | Checkpoint registrato (trigger HW o manuale) |
| `1` | Aggiornamento orologio | Tick ogni secondo con orario corrente |
| `2` | Sessione cancellata | La sessione è stata azzerata |
| `3` | Parametri aggiornati | Impostazioni di sistema modificate |
| `4` | Riga aggiornata | Un passaggio è stato modificato |
| `5` | Messaggio generico | Notifica testuale |
| `6` | Email inviata | Conferma invio email |
| `11` | Linea aggiornata | Configurazione di una linea modificata |

---

## Tempo e sincronizzazione

### `GET /time`
Restituisce l'orario corrente del dispositivo.

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
| `mode` | int | `0` = manuale, `1` = sync su chiusura linea, `2` = GPS, `3` = elapsed (nessun sync) |
| `hour` | int | Ore (0–23) — usato in modalità 0 e 1 |
| `minute` | int | Minuti (0–59) |
| `second` | int | Secondi (0–59) |
| `gpsInterval` | int | Intervallo risincronizzazione GPS in minuti (solo modalità 2) |
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

## Checkpoint e sessione

### `GET /checkPoint`
Registra manualmente un passaggio su una linea.

**Parametri:**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `lineNumber` | int | 0 | Numero della linea che ha rilevato il passaggio |

**Risposta:** testo di conferma con timestamp.

---

### `GET /getCheckpoints`
Scarica la sessione corrente in formato NDJSON (newline-delimited JSON), una riga per checkpoint.

**Risposta:** stream di righe JSON.

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
| `h`, `m`, `s`, `ms` | Orario dell'evento |
| `x` | Penalità (secondi) |
| `e` | Abilitato: `1` / disabilitato: `0` |
| `p` | Tipo prova/sensore (testo libero impostato dall'utente, es. "FPC 102") |
| `r` | Modalità trigger (`0` = automatico, `1` = manuale) |

---

### `GET /downloadSession`
Scarica la sessione come file allegato (forza il download nel browser).

Stesso formato di `/getCheckpoints`, con header `Content-Disposition: attachment`.

---

### 🔒 `GET /clearSession`
Cancella l'intera sessione corrente. Notifica tutti i client WebSocket connessi.

**Risposta:** testo di conferma.

---

### `GET /checkPointFields`
Aggiorna la configurazione di una linea via query string. Solo `l` è obbligatorio.

**Parametri:**

| Parametro | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `l` | int | ✅ | Numero linea (1–4) |
| `ld` | string | — | ID linea |
| `c` | int | — | Numero competitor assegnato |
| `d` | int | — | Delay di rilevamento in millisecondi |
| `e` | int | — | Abilitato: `1` / disabilitato: `0` |

**Esempio:** `GET /checkPointFields?l=2&c=7&e=1`

---

### `POST /checkPointFields`
Aggiorna la configurazione di una linea con body JSON.

**Body JSON:**
```json
{ "l": 1, "ld": "A1", "c": 42, "d": 500, "e": 1 }
```

| Campo | Descrizione |
|---|---|
| `l` | Numero linea (1–4) |
| `ld` | ID linea |
| `c` | Numero competitor assegnato |
| `d` | Delay in millisecondi |
| `e` | Abilitato: `1` / `0` |

---

### `POST /sendCheckPointRow`
Invia (o re-invia) un passaggio alla stampante termica e al broker MQTT.

**Body JSON:**
```json
{
  "lineNumber": 1,
  "index": 5,
  "lineId": "A1",
  "competitor": 42,
  "hour": 10,
  "minute": 23,
  "second": 45,
  "millis": 678
}
```

---

### `POST /updateCheckPointRow`
Modifica un passaggio esistente nella sessione.

**Body JSON:**
```json
{
  "index": 5,
  "lineNumber": 1,
  "lineId": "A1",
  "competitor": 42,
  "hour": 10,
  "minute": 23,
  "second": 45,
  "millis": 678,
  "penality": 0
}
```

Il campo `index` identifica il record da modificare. Se non esiste viene creato.

---

## Impostazioni di sistema

### `GET /allSettings`
Restituisce la configurazione completa del dispositivo.

**Risposta JSON (campi principali):**

| Campo | Descrizione |
|---|---|
| `c1`–`c4` | Competitor assegnati alle linee 1–4 |
| `l1`–`l4` | ID delle linee 1–4 |
| `d1`–`d4` | Delay delle linee 1–4 (ms) |
| `e1`–`e4` | Stato abilitazione linee (1/0) |
| `sm` | Modalità di sincronizzazione corrente |
| `si` | Intervallo sync GPS (minuti) |
| `utc` | Offset UTC |
| `sn` | Nome stazione |
| `print` | Stampa abilitata (0/1) |
| `bz` | Buzzer abilitato (0/1) |
| `mqttAcquireRow` | Acquisizione riga MQTT (0/1) |
| `mqttImmediateMode` | Modalità immediata MQTT (0/1) |
| `mqttShowPopup` | Mostra popup alla ricezione MQTT (0/1) |

---

### 🔒 `GET /setAttribute`
Aggiorna attributi generali del dispositivo.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `printEnabled` | int | `1` = stampa abilitata, `0` = disabilitata |
| `buzzerEnable` | int | `1` = buzzer abilitato |
| `stationName` | string | Nome della stazione di cronometraggio |

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
Avvia la connessione a una rete WiFi.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `ssid` | string | SSID della rete |
| `pw` | string | Password della rete |

**Risposta:** testo di conferma (la connessione avviene in background).

---

### `GET /wifiStop`
Interrompe i tentativi di connessione WiFi STA.

**Risposta:** testo di conferma.

---

### 🔒 `GET /setApPassword`
Cambia la password dell'Access Point WiFi.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `current` | string | Password AP attuale |
| `newpwd` | string | Nuova password (minimo 8 caratteri) |

**Risposta:** testo di conferma o messaggio di errore.

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

Il topic di pubblicazione dei checkpoint è:
```
{prefix}/{eventName}/{stationName}/{chipId}/checkpoint
```

---

### `GET /mqttSave`
Salva le impostazioni MQTT generali.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `subTopic` | string | Subtopic (es. nome gara) |
| `eventName` | string | Nome evento |
| `prefix` | string | Prefisso del topic (default: `chronofit`) |
| `showPopup` | int | Mostra popup UI alla ricezione di un messaggio MQTT (0/1) |
| `acquireRow` | int | Acquisisce il competitor ricevuto nella lista atleti (0/1) |
| `immediateMode` | int | Registra la riga ricevuta immediatamente senza conferma (0/1) |

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
Conferma un messaggio MQTT in attesa di approvazione utente.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID del messaggio pending |

---

### `GET /mqttDiscardPending`
Scarta un messaggio MQTT in attesa di approvazione utente.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `id` | string | ID del messaggio pending |

---

## Email

### `GET /email`
Invia la sessione corrente via email (richiede connessione internet STA attiva).

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `address` | string | Indirizzo email del destinatario |

**Risposta:** testo di conferma (l'invio avviene in modo asincrono).

---

## Stampa

### `GET /print`
Invia una riga di testo alla stampante termica seriale.

**Parametri:**

| Parametro | Tipo | Descrizione |
|---|---|---|
| `text` | string | Testo da stampare (URL-encoded) |
| `cr` | int | `1` = aggiunge carriage return a fine riga, `0` = no |

**Utilizzo tipico:** inviare le righe una alla volta con almeno 500 ms di intervallo tra una chiamata e la successiva, per evitare overflow del buffer della stampante.

---

## Note generali

- Le risposte sono in `text/plain` o `application/json` a seconda della route.
- Le route GET usano parametri query string: `?param=value&param2=value2`
- Le route POST usano body JSON (`Content-Type: application/json`) salvo dove indicato diversamente.
- Il WebSocket (`/ws`) è l'unico canale push; tutte le altre route sono request/response.
- Il dispositivo non implementa CORS — in caso di accesso cross-origin gestire le politiche lato client.
