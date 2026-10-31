#include "main_radio.h"
#include "rf_protocol.h"
#include "constants.h"
#include "globals.h"
#include "cells.h"
#include "battery_curve.h"
#include "params.h"
#include <SPI.h>
#include <RF24.h>
#include "esp_timer.h"

static RF24 radio(PIN_RF_CE, PIN_RF_CSN);

static bool     s_ok = false;
static uint32_t s_id = 0;
static uint8_t  s_addr[5];
static volatile uint32_t s_pairingUntilMs = 0;   // 0 = abbinamento chiuso
static volatile uint32_t s_lastRxMs = 0;
static TaskHandle_t s_task = nullptr;

// Potenza di trasmissione verso ogni Cell RF (regolata dal task radio).
struct CellPower { uint32_t id; RfPowerCtl ctl; };
static CellPower s_power[CELLS_MAX];
static uint8_t   s_beaconSeq = 0;

// Primo contatto: segnale forte = cella vicina, si parte bassi.
static uint8_t initialLevel(bool rpd) { return rpd ? 1 : 3; }

static RfPowerCtl &powerFor(uint32_t id, bool rpd) {
  int freeSlot = -1;
  for (int i = 0; i < CELLS_MAX; i++) {
    if (s_power[i].id == id) return s_power[i].ctl;
    if (freeSlot < 0 && s_power[i].id == 0) freeSlot = i;
  }
  // Tabella piena (celle rimosse e riabbinate): si riusa il primo posto.
  int i = freeSlot >= 0 ? freeSlot : 0;
  s_power[i].id = id;
  s_power[i].ctl.reset(initialLevel(rpd));
  return s_power[i].ctl;
}

// Finestra di validità di un passaggio, come /remoteCheckpoint.
constexpr uint64_t EVENT_MAX_FUTURE_US = 50000ULL;
constexpr uint64_t EVENT_MAX_AGE_US    = 300000000ULL;

static bool pairingOpen() {
  uint32_t until = s_pairingUntilMs;
  return until != 0 && (int32_t)(until - millis()) > 0;
}

static void fillHeader(RfHeader &h, uint8_t type) {
  h.type = type;
  h.proto = RF_PROTO_VERSION;
  h.kit = s_id;
  h.from = s_id;
}

// Invio con ACK a una Cell al livello di potenza `level`, poi di nuovo in
// ascolto. `stampT2` (opzionale) viene chiamata subito prima della
// trasmissione per scrivere t2 nel pacchetto.
static bool sendToCell(uint32_t cellId, uint8_t level, uint8_t *buf,
                       void (*stampT2)(uint8_t *, uint64_t) = nullptr, uint64_t t1 = 0) {
  uint8_t addr[5];
  rfCellAddress(cellId, addr);
  radio.stopListening();
  radio.setPALevel(level);
  radio.openWritingPipe(addr);
  if (stampT2) stampT2(buf, t1);
  bool ok = radio.write(buf, RF_PAYLOAD_SIZE);
  radio.startListening();
  return ok;
}

static void stampSyncResp(uint8_t *buf, uint64_t t1) {
  RfSyncResp *r = (RfSyncResp *)buf;
  r->t21 = (uint32_t)((uint64_t)esp_timer_get_time() - t1);
}

static void sendBeacon() {
  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfBeacon *b = (RfBeacon *)buf;
  fillHeader(b->h, RF_BEACON);
  b->flags = pairingOpen() ? RF_BEACON_PAIRING : 0;
  radio.stopListening();
  // Il beacon è per tutte le celle, vicine e lontane: un livello diverso a ogni
  // invio, così ogni cella ne riceve bene almeno uno ogni RF_PWR_LEVELS secondi.
  radio.setPALevel(s_beaconSeq++ % RF_PWR_LEVELS);
  radio.openWritingPipe(RF_BROADCAST_ADDRESS);
  radio.write(buf, RF_PAYLOAD_SIZE, true);   // multicast: nessun ACK
  radio.startListening();
}

static void handleSyncReq(const RfSyncReq &req, uint64_t t1, bool rpd) {
  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfSyncResp *r = (RfSyncResp *)buf;
  fillHeader(r->h, RF_SYNC_RESP);
  r->syncId = req.syncId;
  r->t1 = t1;
  uint8_t cmd = RF_CMD_NONE;
  uint16_t cmdArg = 0;
  if (!cellsRfSync(req, r->cfg, cmd, cmdArg)) {
    // Cella non abbinata (o rimossa dalla console): glielo si dice, così
    // dimentica l'abbinamento e può essere abbinata di nuovo.
    cmd = RF_CMD_UNPAIR;
  }
  r->cmd = cmd;
  r->cmdArg = cmdArg;
  r->flags = rpd ? RF_RESP_RPD : 0;   // la Cell regola la sua potenza anche con questo
  // Carica della cella sulla curva della Main: avviso di batteria bassa e barra sui LED
  int pct = batteryPercent(req.batteryMv, BAT_CURVE_CELL);
  r->flags |= (uint8_t)((pct + 1) << RF_RESP_BAT_SHIFT) & RF_RESP_BAT_MASK;

  // `RF_SYNC_RPD` dice come la Cell ha ricevuto la risposta precedente.
  RfPowerCtl &pwr = powerFor(req.h.from, rpd);
  bool ok = sendToCell(req.h.from, pwr.level, buf, stampSyncResp, t1);
  if (pwr.onResult(ok, (req.flags & RF_SYNC_RPD) ? 1 : 0)) {
    Serial.printf("[radio] potenza verso %08lx: livello %u\n", (unsigned long)req.h.from, pwr.level);
  }
  cellsRfSetPower(req.h.from, pwr.level, (req.flags & RF_SYNC_PWR_MASK) >> RF_SYNC_PWR_SHIFT);
}

static void handleEvent(const RfEvent &ev, bool rpd) {
  uint8_t status;
  uint64_t nowUs = (uint64_t)esp_timer_get_time();
  if (ev.line < 1 || ev.line > 4) {
    status = RF_EV_BAD_LINE;
  } else if (ev.tMain > nowUs + EVENT_MAX_FUTURE_US || (nowUs > ev.tMain && (nowUs - ev.tMain) > EVENT_MAX_AGE_US)) {
    status = RF_EV_BAD_TIME;
  } else {
    status = cellsRfEvent(ev.h.from, ev.seq, ev.line);
    if (status == RF_EV_OK) {
      int idx = ev.line - 1;
      portENTER_CRITICAL(&isrMux);
      sensorTime[idx] = ev.tMain;
      sensorTriggered[idx] = true;
      portEXIT_CRITICAL(&isrMux);
    }
  }

  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfEventAck *a = (RfEventAck *)buf;
  fillHeader(a->h, RF_EVENT_ACK);
  a->seq = ev.seq;
  a->status = status;
  RfPowerCtl &pwr = powerFor(ev.h.from, rpd);
  if (pwr.onResult(sendToCell(ev.h.from, pwr.level, buf), -1)) {
    Serial.printf("[radio] potenza verso %08lx: livello %u\n", (unsigned long)ev.h.from, pwr.level);
  }
}

static void handlePairReq(const RfPairReq &req, bool rpd) {
  if (!pairingOpen()) return;
  uint8_t buf[RF_PAYLOAD_SIZE] = {0};
  RfPairAck *a = (RfPairAck *)buf;
  fillHeader(a->h, RF_PAIR_ACK);
  a->cellId = req.h.from;
  if (!cellsRfPair(req.h.from, req.fw, a->cfg)) {
    Serial.println("[radio] abbinamento rifiutato: registro celle pieno");
    return;
  }
  Serial.printf("[radio] cella %08lx abbinata (linea %u)\n", (unsigned long)req.h.from, a->cfg.line);
  RfPowerCtl &pwr = powerFor(req.h.from, rpd);
  pwr.reset(initialLevel(rpd));
  sendToCell(req.h.from, pwr.level, buf);
}

// `rpd` = il pacchetto è arrivato sopra -64 dBm (misurato appena letto).
static void handlePacket(const uint8_t *buf, uint64_t t1, bool rpd) {
  const RfHeader *h = (const RfHeader *)buf;
  if (h->proto != RF_PROTO_VERSION || h->kit != s_id) return;
  s_lastRxMs = millis();
  switch (h->type) {
    case RF_SYNC_REQ:  handleSyncReq(*(const RfSyncReq *)buf, t1, rpd); break;
    case RF_EVENT:     handleEvent(*(const RfEvent *)buf, rpd); break;
    case RF_PAIR_REQ:  handlePairReq(*(const RfPairReq *)buf, rpd); break;
    default: break;
  }
}

static void radioTask(void *) {
  uint32_t lastBeaconMs = 0;
  uint8_t buf[RF_PAYLOAD_SIZE];
  for (;;) {
    // t1 va preso appena il pacchetto è disponibile: il ritardo di polling
    // (fino a 1 tick) allunga il "delay" del campione, che la Cell scarta
    // perché tiene quello con delay minimo.
    while (radio.available()) {
      uint64_t t1 = (uint64_t)esp_timer_get_time();
      radio.read(buf, RF_PAYLOAD_SIZE);
      handlePacket(buf, t1, radio.testRPD());
    }
    if ((uint32_t)(millis() - lastBeaconMs) >= RF_BEACON_PERIOD_MS) {
      lastBeaconMs = millis();
      sendBeacon();
    }
    vTaskDelay(1);
  }
}

bool mainRadioBegin() {
  s_id = rfDeviceId();
  rfMainAddress(s_id, s_addr);

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
  radio.enableDynamicAck();          // serve per il beacon multicast (senza ACK)
  // Risposte alle Cell: fino a 15 ritentativi (1,25 ms l'uno), così una risposta
  // persa per un disturbo viene ritrasmessa entro l'attesa della Cell (RF_RESP_TIMEOUT_US).
  radio.setRetries(4, 15);
  radio.openReadingPipe(1, s_addr);
  radio.startListening();
  s_ok = true;

  Serial.printf("[radio] Main %08lx, canale %u\n", (unsigned long)s_id, RF_CHANNEL);

  // Core 1 (WiFi e lwIP stanno sul core 0). Priorità sopra loop() e sopra il
  // task async_tcp del server web (10, che può girare su entrambi i core):
  // con la console aperta il server lo faceva aspettare oltre l'attesa della
  // Cell (RF_RESP_TIMEOUT_US) e la risposta arrivava tardi. Il task dorme 1 tick
  // a ogni giro, quindi non toglie tempo agli altri.
  xTaskCreatePinnedToCore(radioTask, "mainRadio", 4096, nullptr, 12, &s_task, 1);
  return true;
}

bool mainRadioOk() { return s_ok; }
uint32_t mainRadioId() { return s_id; }

String mainRadioIdStr() {
  char buf[9];
  snprintf(buf, sizeof(buf), "%08lx", (unsigned long)s_id);
  return String(buf);
}

void mainRadioSetPairing(uint32_t ms) {
  s_pairingUntilMs = ms ? ((millis() + ms) | 1) : 0;
  cellsMarkDirty();
}

uint32_t mainRadioPairingRemainingMs() {
  uint32_t until = s_pairingUntilMs;
  if (until == 0) return 0;
  int32_t left = (int32_t)(until - millis());
  return left > 0 ? (uint32_t)left : 0;
}

uint32_t mainRadioLastRxMs() { return s_lastRxMs; }
