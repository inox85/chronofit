#ifndef RF_PROTOCOL_H
#define RF_PROTOCOL_H

// Protocollo radio NRF24 tra ChronofitMainCell RF e le Chronofit Cell RF.
//
// FILE CONDIVISO: Chronofit_Main_Cell_RF/rf_protocol.h e
// Chronofit_Cell_RF/rf_protocol.h devono restare IDENTICI. Se cambia il
// formato di un pacchetto incrementa RF_PROTO_VERSION: i pacchetti con una
// versione diversa vengono scartati.
//
// Topologia: stella. La Main ascolta sul proprio indirizzo (derivato dal suo
// id); ogni Cell ascolta sul proprio indirizzo (derivato dal suo id) e
// sull'indirizzo di broadcast, dove la Main pubblica il beacon. Tutti i
// pacchetti hanno ACK hardware tranne il beacon (inviato come multicast).
//
//   Cell                          Main
//    |-- SYNC_REQ (t0) ----------->|  t1 = ricezione       (ogni ~1 s: è anche il battito di presenza)
//    |<--------- SYNC_RESP --------|  t2 = invio, porta t1 e (t2 - t1), la configurazione e un comando
//    |   t3 = ricezione
//    |-- EVENT (seq, t nel clock della Main) -->|
//    |<--------- EVENT_ACK (seq, esito) --------|
//    |<========= BEACON (broadcast) ============|  ogni RF_BEACON_PERIOD_MS, flag abbinamento aperto
//    |-- PAIR_REQ ---------------->|  solo con abbinamento aperto sulla Main
//    |<--------- PAIR_ACK ---------|
//
// Offset di clock (stile NTP, sul campione con ritardo minimo):
//   offset = ((t1 - t0) + (t2 - t3)) / 2      (clock Main - clock Cell, µs)
//   delay  = (t3 - t0) - (t2 - t1)

#include <Arduino.h>

constexpr uint8_t RF_PROTO_VERSION = 2;   // 2: cmdArg in SYNC_RESP, RF_CMD_BAT_CAL

// Canale 80 = 2,480 GHz: dentro la banda ISM 2,400–2,4835 GHz, per cui sono
// progettati moduli, filtri e antenne, e sopra i canali WiFi usati in pratica
// (1/6/11; l'AP della Main è sul 6). I canali oltre l'83 sono fuori banda
// (prima era 126, che la libreria RF24 limita a 125 = 2,525 GHz).
// Main e celle devono usare lo stesso canale: cambiarlo richiede di
// riprogrammare tutte le schede del kit.
constexpr uint8_t RF_CHANNEL = 80;

// Payload fisso (niente payload dinamici): andata e ritorno hanno lo stesso
// tempo in aria, quindi il ritardo è simmetrico e l'offset non ha errore sistematico.
constexpr uint8_t RF_PAYLOAD_SIZE = 32;

constexpr uint32_t RF_BEACON_PERIOD_MS = 1000;

// Attesa della risposta della Main dopo un SYNC_REQ / EVENT / PAIR_REQ.
// Abbondante: mentre scrive in flash (sessione, impostazioni) la Main resta
// ferma per qualche decina di ms, e risponde con fino a 15 ritentativi.
constexpr uint32_t RF_RESP_TIMEOUT_US = 60000;

// Indirizzi a 5 byte. Il primo byte distingue Main, Cell e broadcast,
// gli altri 4 sono l'id (ultimi 4 byte del MAC).
inline void rfMainAddress(uint32_t mainId, uint8_t out[5]) {
  out[0] = 0xA3;
  memcpy(out + 1, &mainId, 4);
}
inline void rfCellAddress(uint32_t cellId, uint8_t out[5]) {
  out[0] = 0xC5;
  memcpy(out + 1, &cellId, 4);
}
static const uint8_t RF_BROADCAST_ADDRESS[5] = {0xB7, 0x43, 0x46, 0x42, 0x43};

// Id del dispositivo: ultimi 4 byte del MAC (efuse). È anche il kit della Main.
inline uint32_t rfDeviceId() {
  uint64_t mac = ESP.getEfuseMac();   // byte 0 = primo byte del MAC
  uint8_t b[6];
  memcpy(b, &mac, 6);
  return ((uint32_t)b[2] << 24) | ((uint32_t)b[3] << 16) | ((uint32_t)b[4] << 8) | b[5];
}

enum RfType : uint8_t {
  RF_BEACON    = 1,   // Main → broadcast
  RF_PAIR_REQ  = 2,   // Cell → Main
  RF_PAIR_ACK  = 3,   // Main → Cell
  RF_SYNC_REQ  = 4,   // Cell → Main
  RF_SYNC_RESP = 5,   // Main → Cell
  RF_EVENT     = 6,   // Cell → Main
  RF_EVENT_ACK = 7,   // Main → Cell
};

// Comandi della Main verso una Cell (campo cmd di SYNC_RESP, consegnati una volta).
enum RfCmd : uint8_t {
  RF_CMD_NONE   = 0,
  RF_CMD_BEEP   = 1,   // "trova la cella": beep + lampeggio LED
  RF_CMD_TEST   = 2,   // passaggio di prova, come se il sensore fosse scattato ora
  RF_CMD_UNPAIR = 3,   // la Cell non è (più) abbinata a questa Main: dimentica il kit
  RF_CMD_BAT_CAL = 4,  // taratura batteria: cmdArg = tensione reale misurata al tester (mV)
};

// Esito di un EVENT.
enum RfEventStatus : uint8_t {
  RF_EV_OK         = 0,
  RF_EV_DUP        = 1,   // già ricevuto (ACK precedente perso): consegnato
  RF_EV_BAD_TIME   = 2,   // timestamp nel futuro o più vecchio di 5 min: riprovare non serve
  RF_EV_BAD_LINE   = 3,   // linea non valida
  RF_EV_NOT_PAIRED = 4,   // la Main non conosce questa Cell
};

struct __attribute__((packed)) RfHeader {
  uint8_t  type;
  uint8_t  proto;   // RF_PROTO_VERSION
  uint32_t kit;     // id della Main a cui appartiene il pacchetto
  uint32_t from;    // id del mittente
};

// Configurazione di una Cell, decisa dalla Main.
struct __attribute__((packed)) RfCellConfig {
  uint8_t  line;        // 1..4, 0 = nessuna linea (i passaggi non vengono inviati)
  uint16_t lockoutMs;   // lockout dopo un passaggio
  uint8_t  buzzer;      // 1 = beep a ogni passaggio
};

constexpr uint8_t RF_BEACON_PAIRING = 0x01;

struct __attribute__((packed)) RfBeacon {
  RfHeader h;
  uint8_t  flags;
};

struct __attribute__((packed)) RfPairReq {
  RfHeader h;
  char     fw[8];
};

struct __attribute__((packed)) RfPairAck {
  RfHeader     h;
  uint32_t     cellId;
  RfCellConfig cfg;
};

constexpr uint8_t RF_SYNC_INPUT_ACTIVE = 0x01;   // fascio interrotto in questo momento
constexpr uint8_t RF_SYNC_RPD          = 0x02;   // segnale ricevuto dalla Main > -64 dBm
constexpr uint8_t RF_SYNC_PWR_SHIFT    = 2;      // bit 2-3: livello di trasmissione della Cell (0..3)
constexpr uint8_t RF_SYNC_PWR_MASK     = 0x0C;

constexpr uint8_t RF_RESP_RPD          = 0x01;   // RfSyncResp.flags: SYNC_REQ ricevuto dalla Main > -64 dBm
// RfSyncResp.flags bit 1-7: carica della batteria della Cell + 1 (1..101), calcolata
// dalla Main con la sua curva di scarica dai mV del SYNC_REQ; 0 = non nota (anche
// da una Main che non la invia). Nei bit liberi perché RfSyncResp occupa già i 32
// byte del payload: compatibile senza cambiare RF_PROTO_VERSION.
constexpr uint8_t RF_RESP_BAT_SHIFT    = 1;
constexpr uint8_t RF_RESP_BAT_MASK     = 0xFE;

struct __attribute__((packed)) RfSyncReq {
  RfHeader h;
  uint16_t syncId;
  uint8_t  line;        // linea in uso dalla Cell
  uint8_t  linkPct;     // scambi riusciti sugli ultimi tentativi, 0..100
  uint8_t  flags;
  uint8_t  pending;     // eventi in coda
  uint16_t batteryMv;
  uint32_t delayUs;     // ritardo del campione migliore (0 = non sincronizzata)
  char     fw[8];
  // Diagnostica: scambi falliti sugli ultimi 20, per causa. Aggiunti in coda:
  // una Main o una Cell più vecchia li ignora / li manda a zero.
  uint8_t  lossNoAck;   // il pacchetto della Cell non ha ricevuto l'ACK hardware della Main
  uint8_t  lossNoResp;  // ACK ricevuto, ma la risposta della Main non è arrivata in tempo
};

struct __attribute__((packed)) RfSyncResp {
  RfHeader     h;
  uint16_t     syncId;
  uint64_t     t1;      // esp_timer della Main alla ricezione del SYNC_REQ (µs)
  uint32_t     t21;     // t2 - t1 (µs)
  RfCellConfig cfg;
  uint8_t      cmd;
  uint16_t     cmdArg;  // argomento del comando (RF_CMD_BAT_CAL: mV)
  uint8_t      flags;   // RF_RESP_*. Aggiunto in coda: una Main più vecchia lo manda a zero
};

struct __attribute__((packed)) RfEvent {
  RfHeader h;
  uint32_t seq;
  uint64_t tMain;       // istante del passaggio nel clock della Main (µs)
  uint8_t  line;
};

struct __attribute__((packed)) RfEventAck {
  RfHeader h;
  uint32_t seq;
  uint8_t  status;
};

// ── Potenza di trasmissione automatica ──────────────────────────────────────
// I moduli NRF24+PA/LNA arrivano a circa +20 dBm: a pochi metri il ricevitore
// (che ha anche l'LNA) si satura e i pacchetti arrivano corrotti, mentre da
// lontano serve tutta la potenza. Ogni lato regola la PROPRIA trasmissione
// verso l'altro: livelli 0..3 = RF24_PA_MIN..RF24_PA_MAX (passi di 6 dB).
//
// Ingressi, a ogni scambio: `ok` = il destinatario ha ricevuto (ACK hardware)
// e `strong` = il destinatario ha misurato il segnale sopra -64 dBm (RPD;
// 1/0, -1 = non noto). Su finestre di 10 tentativi:
//  - segnale forte in almeno l'80 % delle misure → un livello in meno: c'è
//    margine, e se ci sono perdite sono da saturazione;
//  - almeno 3 perdite e segnale per lo più debole → un livello in più;
//  - 4 perdite di fila (collegamento perso) → livello successivo a rotazione,
//    così si ritrova il livello giusto sia da saturati sia da troppo deboli.
// L'isteresi (si sale solo con perdite) evita di oscillare fra due livelli.
constexpr uint8_t RF_PWR_LEVELS = 4;
constexpr uint8_t RF_PWR_START  = 2;   // RF24_PA_HIGH

struct RfPowerCtl {
  uint8_t level = RF_PWR_START;
  uint8_t attempts = 0, fails = 0, known = 0, strong = 0, failStreak = 0;

  void reset(uint8_t lvl = RF_PWR_START) {
    level = lvl < RF_PWR_LEVELS ? lvl : RF_PWR_START;
    clearWindow();
    failStreak = 0;
  }

  void clearWindow() { attempts = fails = known = strong = 0; }

  // Ritorna true se il livello è cambiato.
  bool onResult(bool ok, int8_t strongFb) {
    const uint8_t old = level;
    if (!ok) {
      fails++;
      if (++failStreak >= 4) {
        level = (uint8_t)((level + 1) % RF_PWR_LEVELS);
        failStreak = 0;
        clearWindow();
        return true;
      }
    } else {
      failStreak = 0;
      if (strongFb >= 0) {
        known++;
        if (strongFb) strong++;
      }
    }
    if (++attempts < 10) return false;
    if (known >= 5 && strong * 10 >= known * 8 && level > 0) level--;
    else if (fails >= 3 && strong * 2 < known && level < RF_PWR_LEVELS - 1) level++;
    clearWindow();
    return level != old;
  }
};

static_assert(sizeof(RfBeacon)   <= RF_PAYLOAD_SIZE, "RfBeacon troppo grande");
static_assert(sizeof(RfPairReq)  <= RF_PAYLOAD_SIZE, "RfPairReq troppo grande");
static_assert(sizeof(RfPairAck)  <= RF_PAYLOAD_SIZE, "RfPairAck troppo grande");
static_assert(sizeof(RfSyncReq)  <= RF_PAYLOAD_SIZE, "RfSyncReq troppo grande");
static_assert(sizeof(RfSyncResp) <= RF_PAYLOAD_SIZE, "RfSyncResp troppo grande");
static_assert(sizeof(RfEvent)    <= RF_PAYLOAD_SIZE, "RfEvent troppo grande");
static_assert(sizeof(RfEventAck) <= RF_PAYLOAD_SIZE, "RfEventAck troppo grande");

#endif
