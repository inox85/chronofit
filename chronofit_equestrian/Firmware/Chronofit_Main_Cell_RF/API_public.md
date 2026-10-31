# Chronofit Main Cell RF — API Reference (Public)

Tutte le route sono esposte dal server HTTP integrato nel dispositivo Chronofit Main Cell RF, raggiungibile:
- In modalità **Access Point** (rete `ChronofitMainCellRF_<id>`): `http://192.168.10.1`
- In modalità **STA** (collegato a un router): all'IP assegnato dal router

Il dispositivo è l'unità centrale del sistema a fotocellule wireless: registra i passaggi delle linee e li rende disponibili qui e nella console web. L'orario è il tempo trascorso (non c'è un orologio GPS).

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
| `20` | `TYPE_EQ_UPDATE` | Equitazione: turno in pista cambiato o in corso (`cur`, come un turno di `GET /eq`) |
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

## Checkpoint e sessione

### `GET /checkPoint`
Registra manualmente un passaggio (normalmente generato dall'hardware IR). Conta come su una linea abilitata anche se la linea è disabilitata: riga abilitata, beep e, sulla linea di start in attesa, avvio del tempo trascorso (il passaggio della barriera di una linea disabilitata invece no).

**Parametri:**

| Parametro | Tipo | Default | Descrizione |
|---|---|---|---|
| `lineNumber` | int | 0 | Indice **0-based** della linea (0 = linea 1) che ha rilevato il passaggio |

**Risposta:** testo di conferma con timestamp. Il base timbra l'istante di *arrivo* della richiesta: latenza e jitter di rete finiscono nel tempo (per le fotocellule wireless usare `/remoteCheckpoint`).

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
Cancella l'intera sessione corrente. Notifica tutti i client WebSocket.

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
| `d` | int | — | Delay linea in millisecondi. È anche il lockout delle fotocellule della linea; resta salvato, default 200 |
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
| `d` | Delay linea in millisecondi. È anche il lockout delle fotocellule della linea; resta salvato, default 200 |
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

## Equitazione

Con la **gara assistita** accesa (⚙️ → Dispositivo) la Main gestisce turni, penalità e classifica del salto ostacoli. Queste route servono per esempio a un tabellone esterno; i comandi del turno si danno dalla console.

### `GET /eqEnable`
Stato della gara assistita: `{ "on": true }`.

### `GET /eq`
Stato completo: `on`, tipi di gara (`variants`), dati della gara (`course`: linee di partenza, arrivo e intermedia, lunghezze, velocità), `cur` (id del turno in pista, `0` = nessuno), `taMs` / `taMs2` (tempo concesso della 1ª e 2ª fase) e `rounds`, tutti i turni.

Turno: `{ "id", "comp" (numero del cavaliere), "phase" (1 o 2), "st" ("ready" | "countdown" | "running" | "paused" | "finished" | "confirmed" | "cancelled"), "t" (tempo ms), "mid" (tempo intermedio ms), "fp" (penalità percorso), "tp" (penalità tempo), "pts" (totale), "elim", "ret", "reason", "faults" [conteggi per tipo di errore], "cd" (ms alla fine del conto alla rovescia) }`. La classifica si ricava dai turni conclusi (`finished` / `confirmed`).

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

## Note generali

- Tutte le risposte sono in `text/plain` o `application/json` a seconda della route.
- Il server non implementa CORS — le richieste cross-origin vanno gestite lato client.
- Le route GET usano parametri query string (`?param=value&...`).
- Le route POST usano body JSON (`Content-Type: application/json`) salvo dove indicato diversamente (multipart).
- Il WebSocket è l'unico canale bidirezionale; tutte le altre route sono unidirezionali (request/response).
