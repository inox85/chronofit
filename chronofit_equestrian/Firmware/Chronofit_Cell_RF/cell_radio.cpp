#include "cell_radio.h"
#include "cell_config.h"
#include "rf_protocol.h"
#include "settings.h"
#include "power.h"
#include "cell_sensor.h"
#include <SPI.h>
#include <RF24.h>
#include "esp_timer.h"

static RF24 radio(PIN_RF_CE, PIN_RF_CSN);

static uint32_t          s_id = 0;
static volatile uint32_t s_kit = 0;          // id della Main abbinata, 0 = non abbinata
static uint8_t           s_mainAddr[5];
static SemaphoreHandle_t s_mutex = nullptr;
static TaskHandle_t      s_task = nullptr;

// ── Configurazione (decisa dalla Main, persistita in NVS) ───────────────────
static volatile uint8_t  s_line = CELL_DEFAULT_LINE;
static volatile uint16_t s_lockoutMs = CELL_DEFAULT_LOCKOUT_MS;
static volatile bool     s_buzzer = true;

// ── Coda eventi ─────────────────────────────────────────────────────────────
struct CellEvent {
  uint64_t localUs;
  uint32_t seq;
  uint32_t nextTryMs;
};
static CellEvent s_queue[CELL_QUEUE_SIZE];
static int       s_qCount = 0;
static uint32_t  s_seq = 0;

// ── Statistiche ─────────────────────────────────────────────────────────────
static uint32_t s_sent = 0, s_dups = 0, s_rejected = 0, s_dropped = 0;
static uint32_t s_lastErrorMs = 0;
static bool     s_hasError = false;
static volatile uint32_t s_lastAckMs = 0;

// ── Link ────────────────────────────────────────────────────────────────────
static uint32_t s_linkBits = 0;              // 1 = scambio riuscito (ultimi CELL_LINK_WINDOW)
static uint32_t s_noAckBits = 0;             // 1 = fallito per mancanza di ACK
static uint32_t s_noRespBits = 0;            // 1 = fallito per mancanza di risposta
static int      s_linkCount = 0;
static volatile uint8_t s_lossNoAck = 0, s_lossNoResp = 0;

enum LinkResult { LINK_OK, LINK_NO_ACK, LINK_NO_RESP };
static volatile uint8_t  s_linkPct = 0;
static volatile uint32_t s_lastMainRxMs = 0; // 0 = mai
static bool     s_mainHeardSinceBoot = false;
static bool     s_lastRpd = false;
static volatile uint32_t s_pairCandidate = 0;

// Potenza di trasmissione verso la Main (regolata dal task radio, vedi RfPowerCtl).
static RfPowerCtl s_power;
static uint8_t    s_pairTry = 0;

// ── Stima offset di clock ───────────────────────────────────────────────────
struct SyncSample { int64_t offsetUs; uint32_t delayUs; uint32_t atMs; };
static SyncSample        s_win[CELL_SYNC_SAMPLES];
static int               s_winCount = 0;
static int               s_winNext = 0;
static volatile int64_t  s_offsetUs = 0;
static volatile uint32_t s_bestDelayUs = 0;
static volatile uint32_t s_lastOkMs = 0;
static volatile bool     s_haveOffset = false;
static SyncSample        s_cand;             // primo campione con salto di offset, in attesa di conferma
static bool              s_hasCand = false;
static uint16_t          s_syncId = 0;

// Errori che il LED3 deve mostrare: passaggi rifiutati o persi. Gli scambi
// falliti e poi ritentati con successo sono normali e vanno solo sulla seriale
// (linkRecord), altrimenti il LED lampeggerebbe quasi sempre.
static void markErrorLocked(const char *msg) {   // con s_mutex già preso
  Serial.printf("[radio] %s\n", msg);
  s_lastErrorMs = millis();
  s_hasError = true;
}

static void setLastError(const char *msg) {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  markErrorLocked(msg);
  xSemaphoreGive(s_mutex);
}

static void powerResult(bool ok, int8_t strong) {
  if (s_power.onResult(ok, strong)) Serial.printf("[radio] potenza verso la Main: livello %u\n", s_power.level);
}

static bool syncIsValid() {
  return s_haveOffset && (uint32_t)(millis() - s_lastOkMs) <= CELL_SYNC_VALID_MS;
}

static void resetSync() {
  s_winCount = 0;
  s_winNext = 0;
  s_hasCand = false;
  s_haveOffset = false;
}

static void linkRecord(LinkResult r) {
  s_linkBits   = (s_linkBits << 1)   | (r == LINK_OK ? 1 : 0);
  s_noAckBits  = (s_noAckBits << 1)  | (r == LINK_NO_ACK ? 1 : 0);
  s_noRespBits = (s_noRespBits << 1) | (r == LINK_NO_RESP ? 1 : 0);
  if (s_linkCount < CELL_LINK_WINDOW) s_linkCount++;
  uint32_t mask = (CELL_LINK_WINDOW >= 32) ? 0xFFFFFFFFu : ((1u << s_linkCount) - 1u);
  s_linkPct = (uint8_t)(__builtin_popcount(s_linkBits & mask) * 100 / s_linkCount);
  s_lossNoAck = (uint8_t)__builtin_popcount(s_noAckBits & mask);
  s_lossNoResp = (uint8_t)__builtin_popcount(s_noRespBits & mask);
  if (r != LINK_OK) {
    Serial.printf("[radio] scambio fallito: %s (link %u%%, ultimi %d: %u senza ACK, %u senza risposta)\n",
                  r == LINK_NO_ACK ? "nessun ACK" : "nessuna risposta",
                  s_linkPct, s_linkCount, s_lossNoAck, s_lossNoResp);
  }
}

static void mainHeard() {
  s_lastMainRxMs = millis() | 1;
  s_mainHeardSinceBoot = true;
}

static void fillHeader(RfHeader &h, uint8_t type, uint32_t kit) {
  h.type = type;
  h.proto = RF_PROTO_VERSION;
  h.kit = kit;
  h.from = s_id;
}

// ── Abbinamento e configurazione ────────────────────────────────────────────

static void setKit(uint32_t kit) {
  s_kit = kit;
  rfMainAddress(kit, s_mainAddr);
  writeUIntToSettings("rf_kit", kit);
  resetSync();
  s_power.reset();
  s_lastMainRxMs = 0;
}

static void applyConfig(const RfCellConfig &cfg) {
  uint8_t line = cfg.line <= 4 ? cfg.line : 0;
  uint16_t lockout = cfg.lockoutMs <= 60000 ? cfg.lockoutMs : CELL_DEFAULT_LOCKOUT_MS;
  bool buzzer = cfg.buzzer != 0;
  if (line == s_line && lockout == s_lockoutMs && buzzer == s_buzzer) return;
  s_line = line;
  s_lockoutMs = lockout;
  s_buzzer = buzzer;
  writeIntToSettings("cell_line", line);
  writeIntToSettings("lockout_ms", lockout);
  writeIntToSettings("cell_buzzer", buzzer ? 1 : 0);
  Serial.printf("[radio] configurazione: linea %u, lockout %u ms, buzzer %d\n", line, lockout, buzzer);
  onCellConfigChanged(line, lockout, buzzer);
}

static void clearQueue() {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  s_dropped += s_qCount;
  s_qCount = 0;
  xSemaphoreGive(s_mutex);
}

static void unpair() {
  Serial.println("[radio] la Main non riconosce questa cella: abbinamento rimosso");
  setKit(0);
  clearQueue();
}

// ── Radio a basso livello ───────────────────────────────────────────────────

// Invio con ACK hardware al livello di potenza `level`, poi di nuovo in ascolto
// (startListening ripristina la pipe 0 sull'indirizzo di broadcast).
// `t0` = istante subito prima della trasmissione.
static bool sendTo(const uint8_t addr[5], uint8_t level, const uint8_t *buf, uint64_t *t0 = nullptr) {
  radio.stopListening();
  radio.setPALevel(level);
  radio.openWritingPipe(addr);
  if (t0) *t0 = (uint64_t)esp_timer_get_time();
  bool ok = radio.write(buf, RF_PAYLOAD_SIZE);
  radio.startListening();
  return ok;
}

static void onBeacon(const RfBeacon &b) {
  if (s_kit != 0 && b.h.kit == s_kit) {
    mainHeard();
    return;
  }
  if (!(b.flags & RF_BEACON_PAIRING)) return;
  bool canPair = s_kit == 0 || (!s_mainHeardSinceBoot && millis() < CELL_REPAIR_WINDOW_MS);
  if (canPair) s_pairCandidate = b.h.kit;
}

// Legge un pacchetto se presente. I beacon vengono gestiti qui e non restituiti.
static bool readPacket(uint8_t *buf, uint64_t &tRx) {
  while (radio.available()) {
    tRx = (uint64_t)esp_timer_get_time();
    radio.read(buf, RF_PAYLOAD_SIZE);
    const RfHeader *h = (const RfHeader *)buf;
    if (h->proto != RF_PROTO_VERSION) continue;
    if (h->type == RF_BEACON) { onBeacon(*(const RfBeacon *)buf); continue; }
    return true;
  }
  return false;
}

// Attende (polling stretto, per non sporcare t3) un pacchetto `type` dalla
// Main `from` che soddisfa `match`. Gli altri vengono scartati.
template <typename Match>
static bool waitFor(uint8_t type, uint32_t from, uint8_t *out, uint64_t &tRx, Match match) {
  uint64_t start = (uint64_t)esp_timer_get_time();
  while ((uint64_t)esp_timer_get_time() - start < RF_RESP_TIMEOUT_US) {
    if (readPacket(out, tRx)) {
      const RfHeader *h = (const RfHeader *)out;
      if (h->type == type && h->from == from && h->kit == from && match(out)) return true;
    } else {
      delayMicroseconds(20);
    }
  }
  return false;
}

static void drainIncoming() {
  uint8_t buf[RF_PAYLOAD_SIZE];
  uint64_t t;
  while (readPacket(buf, t)) { /* risposte arrivate in ritardo: scartate */ }
}

// ── Abbinamento ─────────────────────────────────────────────────────────────

static void doPair(uint32_t mainId) {
  uint8_t addr[5];
  rfMainAddress(mainId, addr);
  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfPairReq *req = (RfPairReq *)buf;
  fillHeader(req->h, RF_PAIR_REQ, mainId);
  strncpy(req->fw, CELL_FW_VERSION, sizeof(req->fw));
  // Non si sa ancora quanto è lontana la Main: un livello diverso a ogni tentativo.
  if (!sendTo(addr, s_pairTry++ % RF_PWR_LEVELS, buf)) return;

  uint8_t resp[RF_PAYLOAD_SIZE];
  uint64_t t;
  if (!waitFor(RF_PAIR_ACK, mainId, resp, t,
               [](const uint8_t *p) { return ((const RfPairAck *)p)->cellId == s_id; })) {
    return;
  }
  const RfPairAck *ack = (const RfPairAck *)resp;
  Serial.printf("[radio] abbinata alla Main %08lx\n", (unsigned long)mainId);
  setKit(mainId);
  mainHeard();
  applyConfig(ack->cfg);
  s_pairCandidate = 0;
  onCellCommand(RF_CMD_BEEP);   // conferma in campo: beep e lampeggio
}

// ── Sync del clock ──────────────────────────────────────────────────────────

static bool doSync() {
  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfSyncReq *req = (RfSyncReq *)buf;
  fillHeader(req->h, RF_SYNC_REQ, s_kit);
  req->syncId = ++s_syncId;
  req->line = s_line;
  req->linkPct = s_linkPct;
  req->flags = (cellSensorActive() ? RF_SYNC_INPUT_ACTIVE : 0) | (s_lastRpd ? RF_SYNC_RPD : 0) |
               ((s_power.level << RF_SYNC_PWR_SHIFT) & RF_SYNC_PWR_MASK);
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  req->pending = (uint8_t)min(s_qCount, 255);
  xSemaphoreGive(s_mutex);
  req->batteryMv = (uint16_t)constrain(powerBatteryMv(), 0, 65535);
  req->delayUs = s_haveOffset ? s_bestDelayUs : 0;
  strncpy(req->fw, CELL_FW_VERSION, sizeof(req->fw));
  req->lossNoAck = s_lossNoAck;
  req->lossNoResp = s_lossNoResp;

  drainIncoming();
  uint64_t t0;
  if (!sendTo(s_mainAddr, s_power.level, buf, &t0)) {
    linkRecord(LINK_NO_ACK);
    powerResult(false, -1);
    return false;
  }

  uint8_t resp[RF_PAYLOAD_SIZE];
  uint64_t t3;
  uint16_t id = req->syncId;
  if (!waitFor(RF_SYNC_RESP, s_kit, resp, t3,
               [id](const uint8_t *p) { return ((const RfSyncResp *)p)->syncId == id; })) {
    linkRecord(LINK_NO_RESP);
    powerResult(true, -1);   // la Main ha ricevuto (ACK): il problema è la risposta
    return false;
  }
  linkRecord(LINK_OK);
  mainHeard();
  s_lastRpd = radio.testRPD();

  const RfSyncResp *r = (const RfSyncResp *)resp;
  powerResult(true, (r->flags & RF_RESP_RPD) ? 1 : 0);
  // Carica calcolata dalla Main con la sua curva (0 = non nota)
  int bat1 = (r->flags & RF_RESP_BAT_MASK) >> RF_RESP_BAT_SHIFT;
  powerSetBatteryPercent(bat1 ? bat1 - 1 : -1);
  if (r->cmd == RF_CMD_UNPAIR) {
    unpair();
    return false;
  }
  applyConfig(r->cfg);
  if (r->cmd == RF_CMD_TEST) {
    cellRadioEnqueue((uint64_t)esp_timer_get_time());
    onCellCommand(RF_CMD_TEST);
  } else if (r->cmd == RF_CMD_BEEP) {
    onCellCommand(RF_CMD_BEEP);
  } else if (r->cmd == RF_CMD_BAT_CAL) {
    // la nuova tensione arriva alla Main già nel prossimo SYNC_REQ
    if (powerBatteryCalibrate(r->cmdArg) > 0) onCellCommand(RF_CMD_BAT_CAL);
  }

  // offset = ((t1 - t0) + (t2 - t3)) / 2,  delay = (t3 - t0) - (t2 - t1)
  int64_t t1 = (int64_t)r->t1;
  int64_t t2 = t1 + (int64_t)r->t21;
  int64_t delay = ((int64_t)t3 - (int64_t)t0) - (int64_t)r->t21;
  if (delay < 0) delay = 0;

  SyncSample smp;
  smp.offsetUs = ((t1 - (int64_t)t0) + (t2 - (int64_t)t3)) / 2;
  smp.delayUs = (uint32_t)delay;
  smp.atMs = millis();

  // Se la Main si riavvia il suo esp_timer riparte da zero e l'offset salta di
  // colpo: con la finestra vecchia il campione "migliore" resterebbe quello
  // pre-riavvio e i passaggi partirebbero con un offset sbagliato.
  if (s_winCount > 0) {
    int64_t jump = smp.offsetUs - s_offsetUs;
    if (jump < 0) jump = -jump;
    if (jump > CELL_SYNC_JUMP_US) {
      int64_t d = smp.offsetUs - s_cand.offsetUs;
      if (d < 0) d = -d;
      if (s_hasCand && d < CELL_SYNC_JUMP_US / 5) {
        Serial.printf("[sync] offset saltato di %lld us: Main riavviata? finestra azzerata\n", (long long)jump);
        s_winCount = 0; s_winNext = 0; s_hasCand = false;
      } else {
        // primo campione anomalo: non si usa subito (potrebbe essere un outlier) ma
        // l'offset attuale è sospetto, quindi si ferma l'invio finché non è confermato
        s_cand = smp; s_hasCand = true;
        s_haveOffset = false;
        return false;
      }
    } else {
      s_hasCand = false;
    }
  }

  s_win[s_winNext] = smp;
  s_winNext = (s_winNext + 1) % CELL_SYNC_SAMPLES;
  if (s_winCount < CELL_SYNC_SAMPLES) s_winCount++;

  int best = 0;
  for (int i = 1; i < s_winCount; i++) if (s_win[i].delayUs < s_win[best].delayUs) best = i;
  s_offsetUs = s_win[best].offsetUs;
  s_bestDelayUs = s_win[best].delayUs;
  s_lastOkMs = smp.atMs;
  s_haveOffset = true;
  return true;
}

// ── Coda eventi ─────────────────────────────────────────────────────────────

// Primo evento "dovuto" in coda (senza rimuoverlo). Scarta quelli scaduti.
static bool peekDue(CellEvent &out) {
  bool found = false;
  uint32_t nowMs = millis();
  uint64_t nowUs = (uint64_t)esp_timer_get_time();
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  while (s_qCount > 0 && (nowUs - s_queue[0].localUs) > (CELL_EVENT_MAX_AGE_US - 10000000ULL)) {
    memmove(&s_queue[0], &s_queue[1], sizeof(CellEvent) * (s_qCount - 1));
    s_qCount--;
    s_dropped++;
    markErrorLocked("passaggio perso: non consegnato entro 5 minuti");
  }
  if (s_qCount > 0 && (int32_t)(nowMs - s_queue[0].nextTryMs) >= 0) {
    out = s_queue[0];
    found = true;
  }
  xSemaphoreGive(s_mutex);
  return found;
}

static void popHead(uint32_t *counter) {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  if (s_qCount > 0) {
    memmove(&s_queue[0], &s_queue[1], sizeof(CellEvent) * (s_qCount - 1));
    s_qCount--;
  }
  if (counter) (*counter)++;
  xSemaphoreGive(s_mutex);
}

static void delayHead(uint32_t ms) {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  if (s_qCount > 0) s_queue[0].nextTryMs = millis() + ms;
  xSemaphoreGive(s_mutex);
}

static void sendEvent(const CellEvent &ev) {
  uint8_t line = s_line;
  if (line < 1 || line > 4) {   // linea tolta dalla Main dopo l'accodamento
    popHead(&s_dropped);
    return;
  }

  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfEvent *pkt = (RfEvent *)buf;
  fillHeader(pkt->h, RF_EVENT, s_kit);
  pkt->seq = ev.seq;
  // Conversione nel clock della Main col miglior offset disponibile ADESSO.
  pkt->tMain = (uint64_t)((int64_t)ev.localUs + s_offsetUs);
  pkt->line = line;

  drainIncoming();
  if (!sendTo(s_mainAddr, s_power.level, buf)) {
    linkRecord(LINK_NO_ACK);
    powerResult(false, -1);
    delayHead(100);
    return;
  }
  powerResult(true, -1);

  uint8_t resp[RF_PAYLOAD_SIZE];
  uint64_t t;
  uint32_t seq = ev.seq;
  if (!waitFor(RF_EVENT_ACK, s_kit, resp, t,
               [seq](const uint8_t *p) { return ((const RfEventAck *)p)->seq == seq; })) {
    linkRecord(LINK_NO_RESP);
    delayHead(100);
    return;
  }
  linkRecord(LINK_OK);
  mainHeard();

  switch (((const RfEventAck *)resp)->status) {
    case RF_EV_OK:
      popHead(&s_sent);
      s_lastAckMs = millis() | 1;
      break;
    case RF_EV_DUP:
      popHead(&s_dups);
      s_lastAckMs = millis() | 1;
      break;
    case RF_EV_BAD_TIME:
      // timestamp fuori finestra: riprovare non serve, ma l'offset è sospetto
      popHead(&s_rejected);
      setLastError("passaggio rifiutato: tempo non valido");
      s_lastOkMs = 0;   // forza un nuovo sync
      break;
    case RF_EV_BAD_LINE:
      popHead(&s_rejected);
      setLastError("passaggio rifiutato: linea non valida");
      break;
    case RF_EV_NOT_PAIRED:
    default:
      unpair();
      break;
  }
}

// ── Task ────────────────────────────────────────────────────────────────────

static void radioTask(void *) {
  uint32_t lastSyncMs = 0;
  uint32_t lastPairTryMs = 0;
  bool lastSyncOk = false;

  for (;;) {
    drainIncoming();

    uint32_t candidate = s_pairCandidate;
    if (candidate != 0 && (uint32_t)(millis() - lastPairTryMs) >= 1000) {
      lastPairTryMs = millis();
      if (candidate == s_kit) s_pairCandidate = 0;
      else doPair(candidate);
    }

    if (s_kit == 0) {
      vTaskDelay(pdMS_TO_TICKS(5));
      continue;
    }

    CellEvent ev;
    if (peekDue(ev)) {
      if (!syncIsValid()) {
        lastSyncOk = doSync();
        lastSyncMs = millis();
        if (!syncIsValid()) { vTaskDelay(pdMS_TO_TICKS(50)); continue; }
      }
      sendEvent(ev);
      continue;
    }

    // Raffica iniziale per stimare subito l'offset, poi un sync al secondo
    // (anche se la Main non risponde: è il battito con cui si fa trovare).
    uint32_t period = (lastSyncOk && s_winCount < CELL_SYNC_SAMPLES) ? CELL_SYNC_BURST_GAP_MS : CELL_SYNC_PERIOD_MS;
    if ((uint32_t)(millis() - lastSyncMs) >= period) {
      lastSyncOk = doSync();
      lastSyncMs = millis();
      continue;
    }

    // Dorme finché non arriva un passaggio (notifica) o scade il timeout,
    // abbastanza breve da non perdere i beacon (la FIFO RX tiene 3 pacchetti).
    ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(5));
  }
}

bool cellRadioBegin() {
  s_mutex = xSemaphoreCreateMutex();
  s_id = rfDeviceId();

  s_line      = (uint8_t)constrain(readIntFromSettings("cell_line", CELL_DEFAULT_LINE), 0, 4);
  s_lockoutMs = (uint16_t)constrain(readIntFromSettings("lockout_ms", CELL_DEFAULT_LOCKOUT_MS), 0, 60000);
  s_buzzer    = readIntFromSettings("cell_buzzer", 1) != 0;
  onCellConfigChanged(s_line, s_lockoutMs, s_buzzer);

  uint32_t kit = readUIntFromSettings("rf_kit", 0);
  s_kit = kit;
  rfMainAddress(kit, s_mainAddr);

  // Evita che dopo un riavvio la cella riparta da seq=1 (la Main scarterebbe
  // come DUP un seq uguale all'ultimo visto): parte da un valore casuale.
  s_seq = esp_random() | 1;

  uint8_t myAddr[5];
  rfCellAddress(s_id, myAddr);

  SPI.begin(PIN_RF_SCK, PIN_RF_MISO, PIN_RF_MOSI, PIN_RF_CSN);
  if (!radio.begin()) {
    Serial.println("[radio] modulo NRF24 non trovato");
    return false;
  }
  radio.setChannel(RF_CHANNEL);
  radio.setDataRate(RF24_250KBPS);
  radio.setPALevel(RF24_PA_MAX);   // poi regolata a ogni invio (RfPowerCtl)
  radio.setAddressWidth(5);
  radio.disableDynamicPayloads();
  radio.setPayloadSize(RF_PAYLOAD_SIZE);
  radio.setCRCLength(RF24_CRC_16);
  radio.setAutoAck(true);
  radio.enableDynamicAck();
  // Ritardo di ritrasmissione diverso da cella a cella: due celle che
  // trasmettono insieme non collidono di nuovo al tentativo successivo.
  radio.setRetries(4 + (s_id % 6), 15);
  radio.openReadingPipe(0, RF_BROADCAST_ADDRESS);   // beacon della Main
  radio.openReadingPipe(1, myAddr);                 // risposte della Main
  radio.startListening();

  Serial.printf("[radio] Cell %08lx, Main %08lx, canale %u\n", (unsigned long)s_id, (unsigned long)kit, RF_CHANNEL);

  xTaskCreatePinnedToCore(radioTask, "cellRadio", 4096, nullptr, 2, &s_task, 1);
  return true;
}

void cellRadioEnqueue(uint64_t localUs) {
  if (s_line < 1 || s_line > 4) return;
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  if (s_qCount >= CELL_QUEUE_SIZE) {
    memmove(&s_queue[0], &s_queue[1], sizeof(CellEvent) * (CELL_QUEUE_SIZE - 1));
    s_qCount--;
    s_dropped++;
    markErrorLocked("passaggio perso: coda piena");
  }
  s_seq++;
  if (s_seq == 0) s_seq = 1;
  s_queue[s_qCount++] = { localUs, s_seq, 0 };
  xSemaphoreGive(s_mutex);
  if (s_task) xTaskNotifyGive(s_task);
}

CellRadioStatus cellRadioStatus() {
  CellRadioStatus st;
  uint32_t now = millis();
  st.id = s_id;
  st.kit = s_kit;
  uint32_t lastRx = s_lastMainRxMs;
  st.mainHeard = lastRx != 0 && (uint32_t)(now - lastRx) < CELL_MAIN_LOST_MS;
  st.syncValid = syncIsValid();
  st.offsetUs = s_offsetUs;
  st.delayUs = s_bestDelayUs;
  st.linkPct = s_linkPct;
  st.line = s_line;
  st.lockoutMs = s_lockoutMs;
  st.buzzer = s_buzzer;
  st.lastAckMs = s_lastAckMs;
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  st.sent = s_sent; st.duplicates = s_dups; st.rejected = s_rejected; st.dropped = s_dropped;
  st.pending = s_qCount;
  st.lastErrorAgeMs = s_hasError ? (uint32_t)(now - s_lastErrorMs) : UINT32_MAX;
  xSemaphoreGive(s_mutex);
  return st;
}
