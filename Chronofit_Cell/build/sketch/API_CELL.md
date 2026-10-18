#line 1 "C:\\src\\chronofit\\Chronofit_Cell\\API_CELL.md"
# Chronofit Cell — API

Fotocellula wireless per il base `Chronofit_GPS`. Stessa scheda del base.
Ha una AP propria per la configurazione e, in parallelo, è collegata in STA
alla AP del base.

| | Valore |
|---|---|
| AP di configurazione | SSID `ChronofitCell_<chipId>`, password di default = `<chipId>` (min. 8 caratteri) |
| IP della cella (AP) | `192.168.11.1` (subnet diversa da quella del base, `192.168.10.x`) |
| Canale AP | 6 (in AP+STA la radio segue comunque il canale del base) |
| UI | `http://192.168.11.1/` |

## Autenticazione

Come sul base: se in NVS non è configurato nessun token, tutte le richieste
sono autorizzate; altrimenti le route 🔒 richiedono l'header `X-Token: <valore>`
(o `?token=`).

## Funzionamento

1. Fronte HIGH→LOW sull'ingresso scelto → timestamp `esp_timer` locale (µs),
   con lockout configurabile.
2. In background (ogni ~3 s, raffica di 8 all'aggancio) la cella chiama
   `GET /clockSync` sul base e stima l'offset di clock (campione a RTT minimo
   fra gli ultimi 8). La stessa richiesta è il **battito di presenza**: porta
   `cell` (id), `line`, `rssi`, `rtt` e `fw`, così il base mostra quali celle
   sono connesse e a che linea sono associate (`GET /cells` sul base); dopo
   10 s senza battiti la cella risulta "persa".
3. L'evento viene convertito nel clock del base e inviato con
   `GET /remoteCheckpoint?lineNumber=<L>&t=<µs>&seq=<n>` (vedi `API.md` del
   base). Se il base non è raggiungibile l'evento resta in coda (max 32,
   scade dopo ~5 min) e viene ritentato; il `seq` evita duplicati.

Precisione attesa: circa ±1–2 ms (asimmetria WiFi), contro ±5–30 ms di un
semplice `GET /checkPoint`. Vedi `rttUs`/`offsetUs` in `/cellStatus`.

## LED di stato

I 4 LED WS2812 della scheda (numerati da 1 nell'ordine della striscia) danno
lo stato in campo, senza bisogno di aprire la UI. Il buzzer fa un beep breve a
ogni passaggio (disattivabile).

| LED | Significato | Colori |
|---|---|---|
| 1 | Collegamento al base / sync clock | viola lampeggiante = SSID del base non configurato · rosso = non collegata · giallo = collegata, clock non ancora sincronizzato · verde = collegata e sincronizzata · arancione = sincronizzata ma RTT > 20 ms (precisione ridotta) |
| 2 | Segnale WiFi verso il base | verde ≥ −60 dBm · giallo ≥ −75 dBm · rosso sotto · spento se non collegata |
| 3 | Sensore | bianco = ingresso attivo (utile per allineare la fotocellula) · lampo blu 150 ms = passaggio rilevato |
| 4 | Consegna al base | rosso = errore negli ultimi 10 s · arancione = eventi in coda non ancora consegnati · lampo verde 300 ms = consegna confermata dal base · ciano fioco = un client è connesso alla AP di configurazione · spento = nulla da segnalare |

## Route

### `GET /cellStatus`
Stato live (usato dalla UI ogni secondo).

```json
{
  "fw": "C1.0.0", "chipId": "...", "apSsid": "ChronofitCell_...", "apClients": 1,
  "uptimeS": 123, "line": 1,
  "sta":  { "connected": true, "ssid": "Chronofit_...", "ip": "192.168.10.2", "rssi": -55 },
  "sync": { "valid": true, "offsetUs": 123456789, "rttUs": 2800, "ageMs": 1200, "samples": 8 },
  "inputActive": false, "lockedOut": 0,
  "events": { "sent": 4, "duplicates": 0, "rejected": 0, "dropped": 0, "pending": 0 },
  "lastError": ""
}
```

### `GET /cellSettings`
Configurazione corrente. Le password e i token **non** vengono restituiti
(solo `hasBasePass`/`hasBaseToken`/`authRequired`).

### 🔒 `GET /cellSave`
Salva e riavvia. Tutti i parametri sono opzionali.

| Parametro | Descrizione |
|---|---|
| `baseSsid`, `basePass`, `baseHost`, `baseToken` | Collegamento al base (`basePass`/`baseToken` vuoti = invariati) |
| `clearBasePass=1`, `clearBaseToken=1` | Cancella password / token del base |
| `line` | Linea del base simulata, 1–4 |
| `input` | Ingresso fisico IN1–IN4 (1–4) |
| `lockoutMs` | Lockout dopo un passaggio, 0–60000 |
| `buzzer` | 1/0, beep a ogni passaggio |
| `apPassword` | Nuova password della AP (≥ 8 caratteri) |
| `apiToken`, `clearApiToken=1` | Imposta / rimuove il token API di questa cella |

### `GET /wifiScan`
Scansione asincrona: `{"scanning":true}` finché in corso, poi
`{"scanning":false,"networks":[{"ssid","rssi","channel"}]}`.

### 🔒 `GET /cellTest`
Accoda un evento come se il sensore fosse scattato ora.

### 🔒 `GET /reboot`
Riavvia.

### 🔒 `POST /update`, `POST /updatefs`
OTA firmware / filesystem (`multipart/form-data`), come sul base.
