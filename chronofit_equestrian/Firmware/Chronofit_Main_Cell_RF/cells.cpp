#include "cells.h"
#include "globals.h"
#include "params.h"
#include "local_inputs.h"
#include "main_radio.h"
#include "power.h"
#include "battery_runtime.h"
#include "battery_curve.h"
#include <ArduinoJson.h>
#include <IPAddress.h>
#include <LittleFS.h>

static const char *RF_CELLS_FILE = "/rf_cells.json";

struct CellSlot {
  bool     used;
  bool     rf;             // Cell RF abbinata (altrimenti Cell WiFi)
  bool     seen;           // sentita almeno una volta da quando la Main è accesa
  bool     connected;
  bool     conflict;
  bool     hasEvent;
  bool     inputActive;    // solo RF: fascio interrotto all'ultimo battito
  uint8_t  line;
  uint8_t  rssiBucket;
  int8_t   rssi;           // 0 = sconosciuto (per le Cell RF è ricavato dalla qualità del link)
  uint8_t  linkPct;        // solo RF
  uint8_t  lossNoAck;      // solo RF: scambi persi senza ACK (ultimi 20)
  uint8_t  lossNoResp;     // solo RF: scambi persi senza risposta (ultimi 20)
  uint8_t  pending;        // solo RF: eventi in coda sulla cella
  uint8_t  txMain1;        // solo RF: potenza della Main verso la cella, livello + 1 (0 = non nota)
  uint8_t  txCell1;        // solo RF: potenza della cella verso la Main, livello + 1 (0 = non nota)
  uint8_t  pendingCmd;     // solo RF: comando da consegnare al prossimo sync
  uint16_t pendingArg;     // solo RF: argomento del comando
  uint8_t  buzzer;         // solo RF
  uint16_t lockoutMs;      // solo RF: non più usato (il lockout è il Ritardo della linea), resta nel file per compatibilità
  uint16_t batteryMv;      // solo RF
  uint32_t rfId;           // solo RF
  uint32_t lastSeq;        // solo RF: deduplica dei passaggi
  uint32_t rttUs;
  uint32_t ip;
  uint32_t lastSeenMs;
  uint32_t lastEventMs;
  uint32_t events;
  char     id[17];
  char     fw[9];
};

static CellSlot s_cells[CELLS_MAX];
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;
static bool s_dirty = false;
static volatile bool s_saveNeeded = false;

// Livello segnale 0..4 (0 = sconosciuto): le stesse soglie delle barre
// mostrate dalla UI (cellSignalLevel() in script.js), così il push WebSocket
// parte esattamente quando cambia il numero di barre piene.
static uint8_t bucketOf(int rssi) {
  if (rssi == 0) return 0;
  if (rssi >= -55) return 4;
  if (rssi >= -65) return 3;
  if (rssi >= -75) return 2;
  return 1;
}

// L'NRF24 non misura l'RSSI: la cella riporta la percentuale di scambi riusciti
// sugli ultimi 20 (sync + passaggi), che si traduce in un valore "tipo dBm" per
// riusare le barre di segnale della UI (soglie di bucketOf):
//   >= 60 % → 4 tacche, >= 35 % → 3, >= 15 % → 2, sotto → 1.
// Scala volutamente tollerante: i passaggi vengono ritentati finché la Main non
// li conferma e i sync servono solo a stimare l'offset (si usa il migliore degli
// ultimi 8), quindi anche con molti scambi persi la cella funziona bene. Il bit
// RPD (> -64 dBm) non conta: a pochi metri è quasi sempre 0 anche con un link perfetto.
static int8_t rfPseudoRssi(uint8_t linkPct, bool rpd) {
  (void)rpd;
  if (linkPct == 0) return 0;
  if (linkPct >= 60) return -50;
  if (linkPct >= 35) return -60;
  if (linkPct >= 15) return -70;
  return -80;
}

static void rfIdToStr(uint32_t id, char out[17]) {
  snprintf(out, 17, "%08lx", (unsigned long)id);
}

// Da chiamare con s_mux preso.
static CellSlot *findRf(uint32_t id) {
  for (int i = 0; i < CELLS_MAX; i++)
    if (s_cells[i].used && s_cells[i].rf && s_cells[i].rfId == id) return &s_cells[i];
  return nullptr;
}

static CellSlot *findById(const char *id) {
  for (int i = 0; i < CELLS_MAX; i++)
    if (s_cells[i].used && strncmp(s_cells[i].id, id, sizeof(s_cells[i].id) - 1) == 0) return &s_cells[i];
  return nullptr;
}

// Slot libero, altrimenti quello della Cell WiFi persa da più tempo (le Cell
// RF abbinate non vengono mai sostituite). nullptr se non ce ne sono.
static CellSlot *allocSlot() {
  for (int i = 0; i < CELLS_MAX; i++)
    if (!s_cells[i].used) return &s_cells[i];
  CellSlot *slot = nullptr;
  for (int i = 0; i < CELLS_MAX; i++) {
    if (s_cells[i].rf || s_cells[i].connected) continue;
    if (!slot || (int32_t)(slot->lastSeenMs - s_cells[i].lastSeenMs) > 0) slot = &s_cells[i];
  }
  return slot;
}

// Slot della Cell WiFi `id`; se manca ne crea uno.
static CellSlot *findOrCreateWifi(const char *id, bool &created) {
  created = false;
  CellSlot *slot = findById(id);
  if (slot) return slot->rf ? nullptr : slot;
  slot = allocSlot();
  if (!slot) return nullptr;
  memset(slot, 0, sizeof(CellSlot));
  slot->used = true;
  strlcpy(slot->id, id, sizeof(slot->id));
  created = true;
  return slot;
}

// Prima linea 1..4 non usata da ingressi locali o da altre celle abbinate.
static uint8_t firstFreeLine() {
  bool used[5] = {false, false, false, false, false};
  int bl = localBarrierLine(), pl = localPadLine();
  if (bl >= 1 && bl <= 4) used[bl] = true;
  if (pl >= 1 && pl <= 4) used[pl] = true;
  for (int i = 0; i < CELLS_MAX; i++)
    if (s_cells[i].used && s_cells[i].line >= 1 && s_cells[i].line <= 4) used[s_cells[i].line] = true;
  for (uint8_t l = 1; l <= 4; l++) if (!used[l]) return l;
  return 1;
}

// Lockout di una Cell RF = Ritardo della linea a cui è assegnata (lo stesso
// degli ingressi locali). La cella accetta al massimo 60 s; senza linea non
// invia passaggi e il valore non conta.
static uint16_t lineLockoutMs(uint8_t line) {
  if (line < 1 || line > 4) return RF_CELL_DEFAULT_LOCKOUT_MS;
  return (uint16_t)min(delays[line - 1], 60000UL);
}

static void fillConfig(const CellSlot &c, RfCellConfig &cfg) {
  cfg.line = c.line;
  cfg.lockoutMs = lineLockoutMs(c.line);
  cfg.buzzer = c.buzzer;
}

// ── Persistenza ─────────────────────────────────────────────────────────────

void cellsBegin() {
  File f = LittleFS.open(RF_CELLS_FILE, "r");
  if (!f) return;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.printf("[cells] %s non valido: %s\n", RF_CELLS_FILE, err.c_str());
    return;
  }
  portENTER_CRITICAL(&s_mux);
  for (JsonObject o : doc["cells"].as<JsonArray>()) {
    uint32_t id = (uint32_t)strtoul(o["id"] | "0", nullptr, 16);
    if (id == 0 || findRf(id)) continue;
    CellSlot *c = allocSlot();
    if (!c) break;
    memset(c, 0, sizeof(CellSlot));
    c->used = true;
    c->rf = true;
    c->rfId = id;
    rfIdToStr(id, c->id);
    c->line = (uint8_t)constrain((int)(o["line"] | 1), 0, 4);
    c->lockoutMs = (uint16_t)constrain((int)(o["lockoutMs"] | (int)RF_CELL_DEFAULT_LOCKOUT_MS), 0, 60000);
    c->buzzer = (o["buzzer"] | 1) ? 1 : 0;
    strlcpy(c->fw, o["fw"] | "", sizeof(c->fw));
  }
  s_dirty = true;
  portEXIT_CRITICAL(&s_mux);
}

void cellsSaveIfNeeded() {
  if (!s_saveNeeded) return;
  s_saveNeeded = false;

  CellSlot snap[CELLS_MAX];
  portENTER_CRITICAL(&s_mux);
  memcpy(snap, s_cells, sizeof(snap));
  portEXIT_CRITICAL(&s_mux);

  JsonDocument doc;
  JsonArray arr = doc["cells"].to<JsonArray>();
  for (const CellSlot &c : snap) {
    if (!c.used || !c.rf) continue;
    JsonObject o = arr.add<JsonObject>();
    o["id"] = c.id;
    o["line"] = c.line;
    o["lockoutMs"] = c.lockoutMs;
    o["buzzer"] = c.buzzer;
    o["fw"] = c.fw;
  }
  File f = LittleFS.open(RF_CELLS_FILE, "w");
  if (!f) {
    Serial.println("[cells] impossibile salvare gli abbinamenti");
    return;
  }
  serializeJson(doc, f);
  f.close();
}

// ── Cell WiFi ───────────────────────────────────────────────────────────────

void cellsTouch(const char *id, int line, int rssi, uint32_t rttUs, const char *fw, uint32_t ip) {
  if (!id || !id[0] || line < 1 || line > 4) return;
  portENTER_CRITICAL(&s_mux);
  bool created;
  CellSlot *c = findOrCreateWifi(id, created);
  if (c) {
    uint8_t bucket = bucketOf(rssi);
    if (created || !c->connected || c->line != line || c->rssiBucket != bucket) s_dirty = true;
    c->line = (uint8_t)line;
    c->rssi = (int8_t)constrain(rssi, -127, 0);
    c->rssiBucket = bucket;
    c->rttUs = rttUs;
    c->ip = ip;
    if (fw) strlcpy(c->fw, fw, sizeof(c->fw));
    c->lastSeenMs = millis();
    c->seen = true;
    c->connected = true;
  }
  portEXIT_CRITICAL(&s_mux);
}

void cellsEvent(const char *id, int line, uint32_t ip) {
  if (!id || !id[0] || line < 1 || line > 4) return;
  portENTER_CRITICAL(&s_mux);
  bool created;
  CellSlot *c = findOrCreateWifi(id, created);
  if (c) {
    if (created || !c->connected || c->line != line) s_dirty = true;
    c->line = (uint8_t)line;
    c->ip = ip;
    c->lastSeenMs = millis();
    c->seen = true;
    c->connected = true;
    c->lastEventMs = c->lastSeenMs;
    c->hasEvent = true;
    c->events++;
  }
  portEXIT_CRITICAL(&s_mux);
}

// ── Cell RF ─────────────────────────────────────────────────────────────────

bool cellsRfSync(const RfSyncReq &req, RfCellConfig &cfg, uint8_t &cmd, uint16_t &cmdArg) {
  bool ok = false;
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findRf(req.h.from);
  if (c) {
    int8_t rssi = rfPseudoRssi(req.linkPct, req.flags & RF_SYNC_RPD);
    uint8_t bucket = bucketOf(rssi);
    if (!c->connected || c->rssiBucket != bucket) s_dirty = true;
    c->rssi = rssi;
    c->rssiBucket = bucket;
    c->linkPct = req.linkPct;
    c->lossNoAck = req.lossNoAck;
    c->lossNoResp = req.lossNoResp;
    c->rttUs = req.delayUs;
    bool input = req.flags & RF_SYNC_INPUT_ACTIVE;
    if (input != c->inputActive) s_dirty = true;   // stato del fascio in console (riquadro delle linee)
    c->inputActive = input;
    c->pending = req.pending;
    c->batteryMv = req.batteryMv;
    char fw[9];
    memcpy(fw, req.fw, 8);
    fw[8] = 0;
    if (strcmp(fw, c->fw) != 0) { strlcpy(c->fw, fw, sizeof(c->fw)); s_saveNeeded = true; }
    c->lastSeenMs = millis();
    c->seen = true;
    c->connected = true;
    fillConfig(*c, cfg);
    cmd = c->pendingCmd;
    cmdArg = c->pendingArg;
    c->pendingCmd = RF_CMD_NONE;
    c->pendingArg = 0;
    ok = true;
  }
  portEXIT_CRITICAL(&s_mux);
  return ok;
}

void cellsRfSetPower(uint32_t id, uint8_t mainLevel, uint8_t cellLevel) {
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findRf(id);
  if (c) {
    c->txMain1 = mainLevel + 1;
    c->txCell1 = cellLevel + 1;
  }
  portEXIT_CRITICAL(&s_mux);
}

bool cellsRfPair(uint32_t id, const char *fw, RfCellConfig &cfg) {
  bool ok = false;
  bool created = false;
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findRf(id);
  if (!c) {
    c = allocSlot();
    if (c) {
      // prima azzera lo slot: se era di una Cell WiFi persa, la sua linea non conta più
      memset(c, 0, sizeof(CellSlot));
      uint8_t line = firstFreeLine();
      c->used = true;
      c->rf = true;
      c->rfId = id;
      rfIdToStr(id, c->id);
      c->line = line;
      c->lockoutMs = RF_CELL_DEFAULT_LOCKOUT_MS;
      c->buzzer = 1;
      created = true;
    }
  }
  if (c) {
    if (fw) { memcpy(c->fw, fw, 8); c->fw[8] = 0; }
    c->lastSeenMs = millis();
    c->seen = true;
    c->connected = true;
    fillConfig(*c, cfg);
    s_dirty = true;
    ok = true;
  }
  portEXIT_CRITICAL(&s_mux);
  if (created) s_saveNeeded = true;
  return ok;
}

uint8_t cellsRfEvent(uint32_t id, uint32_t seq, int line) {
  uint8_t status;
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findRf(id);
  if (!c) {
    status = RF_EV_NOT_PAIRED;
  } else if (seq != 0 && seq == c->lastSeq) {
    status = RF_EV_DUP;
  } else {
    c->lastSeq = seq;
    c->lastSeenMs = millis();
    c->seen = true;
    if (!c->connected) s_dirty = true;
    c->connected = true;
    c->lastEventMs = c->lastSeenMs;
    c->hasEvent = true;
    c->events++;
    status = RF_EV_OK;
  }
  portEXIT_CRITICAL(&s_mux);
  (void)line;
  return status;
}

bool cellsRfConfigure(const char *id, int line, int lockoutMs, int buzzer) {
  bool ok = false;
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findById(id);
  if (c && c->rf) {
    if (line >= 0 && line <= 4) c->line = (uint8_t)line;
    (void)lockoutMs;   // ignorato: il lockout è il Ritardo della linea
    if (buzzer >= 0) c->buzzer = buzzer ? 1 : 0;
    s_dirty = true;
    ok = true;
  }
  portEXIT_CRITICAL(&s_mux);
  if (ok) s_saveNeeded = true;
  return ok;
}

bool cellsRfCommand(const char *id, uint8_t cmd, uint16_t arg) {
  bool ok = false;
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findById(id);
  if (c && c->rf) {
    c->pendingCmd = cmd;
    c->pendingArg = arg;
    ok = true;
  }
  portEXIT_CRITICAL(&s_mux);
  return ok;
}

bool cellsRfRemove(const char *id) {
  bool ok = false;
  portENTER_CRITICAL(&s_mux);
  CellSlot *c = findById(id);
  if (c && c->rf) {
    // La cella non riceve più risposte valide: al prossimo sync riceve
    // RF_CMD_UNPAIR (cella sconosciuta) e dimentica l'abbinamento.
    memset(c, 0, sizeof(CellSlot));
    s_dirty = true;
    ok = true;
  }
  portEXIT_CRITICAL(&s_mux);
  if (ok) s_saveNeeded = true;
  return ok;
}

// ── Stato ───────────────────────────────────────────────────────────────────

bool cellsPoll() {
  uint32_t now = millis();
  int bl = localBarrierLine(), pl = localPadLine();
  bool changed;
  portENTER_CRITICAL(&s_mux);
  for (int i = 0; i < CELLS_MAX; i++) {
    CellSlot &c = s_cells[i];
    if (c.used && c.connected && (uint32_t)(now - c.lastSeenMs) > CELL_LOST_AFTER_MS) {
      c.connected = false;
      s_dirty = true;
    }
  }
  // Conflitto = una cella connessa con la stessa linea di un'altra cella
  // connessa o di un ingresso locale della Main.
  for (int i = 0; i < CELLS_MAX; i++) {
    CellSlot &c = s_cells[i];
    bool conflict = false;
    if (c.used && c.connected && c.line >= 1) {
      if (c.line == bl || c.line == pl) conflict = true;
      for (int j = 0; j < CELLS_MAX; j++)
        if (j != i && s_cells[j].used && s_cells[j].connected && s_cells[j].line == c.line) conflict = true;
    }
    if (conflict != c.conflict) { c.conflict = conflict; s_dirty = true; }
  }
  changed = s_dirty;
  s_dirty = false;
  portEXIT_CRITICAL(&s_mux);
  return changed;
}

void cellsMarkDirty() {
  portENTER_CRITICAL(&s_mux);
  s_dirty = true;
  portEXIT_CRITICAL(&s_mux);
}

int cellsRfBatterySnapshot(CellBatterySnap *out, int max) {
  int n = 0;
  portENTER_CRITICAL(&s_mux);
  for (int i = 0; i < CELLS_MAX && n < max; i++) {
    const CellSlot &c = s_cells[i];
    if (!c.used || !c.rf) continue;
    out[n++] = { c.rfId, c.batteryMv, c.connected };
  }
  portEXIT_CRITICAL(&s_mux);
  return n;
}

int cellsRfConnected() {
  int n = 0;
  portENTER_CRITICAL(&s_mux);
  for (int i = 0; i < CELLS_MAX; i++)
    if (s_cells[i].used && s_cells[i].rf && s_cells[i].connected) n++;
  portEXIT_CRITICAL(&s_mux);
  return n;
}

String cellsToJson() {
  CellSlot snap[CELLS_MAX];
  portENTER_CRITICAL(&s_mux);
  memcpy(snap, s_cells, sizeof(snap));
  portEXIT_CRITICAL(&s_mux);

  uint32_t now = millis();
  JsonDocument doc;
  doc["t"] = TYPE_CELLS_UPDATED;
  int connected = 0, total = 0;
  JsonArray arr = doc["cells"].to<JsonArray>();
  for (int i = 0; i < CELLS_MAX; i++) {
    const CellSlot &c = snap[i];
    if (!c.used) continue;
    total++;
    if (c.connected) connected++;
    JsonObject o = arr.add<JsonObject>();
    o["id"] = c.id;
    o["line"] = c.line;
    o["rssi"] = c.rssi;
    o["rtt"] = c.rttUs;
    o["fw"] = c.fw;
    o["ip"] = c.rf ? String("RF") : IPAddress(c.ip).toString();
    o["connected"] = c.connected;
    o["conflict"] = c.conflict;
    o["ageMs"] = c.seen ? (int64_t)(uint32_t)(now - c.lastSeenMs) : (int64_t)-1;
    o["lastEventAgeMs"] = c.hasEvent ? (int64_t)(uint32_t)(now - c.lastEventMs) : (int64_t)-1;
    o["events"] = c.events;
    o["rf"] = c.rf;
    if (c.rf) {
      o["link"] = c.linkPct;
      o["lossAck"] = c.lossNoAck;
      o["lossResp"] = c.lossNoResp;
      o["bat"] = c.batteryMv;
      o["batPct"] = batteryPercent(c.batteryMv, BAT_CURVE_CELL);
      o["batMin"] = batteryRuntimeCellMinutes(c.rfId);   // tempo residuo stimato
      o["txMain"] = (int)c.txMain1 - 1;
      o["txCell"] = (int)c.txCell1 - 1;
      o["input"] = c.inputActive;
      o["pending"] = c.pending;
      o["lockoutMs"] = lineLockoutMs(c.line);   // dal Ritardo della linea
      o["buzzer"] = c.buzzer;
    }
  }
  doc["n"] = connected;
  doc["total"] = total;

  JsonObject radio = doc["radio"].to<JsonObject>();
  radio["ok"] = mainRadioOk();
  radio["id"] = mainRadioIdStr();
  radio["channel"] = RF_CHANNEL;
  radio["pairingS"] = mainRadioPairingRemainingMs() / 1000;

  JsonObject mainObj = doc["main"].to<JsonObject>();
  const uint16_t mainMv = powerBatteryMv();
  mainObj["bat"] = mainMv;
  mainObj["batPct"] = batteryPercent(mainMv, BAT_CURVE_MAIN);
  mainObj["charging"] = powerCharging();
  mainObj["batMin"] = batteryRuntimeMainMinutes();

  JsonObject local = doc["local"].to<JsonObject>();
  local["barrierLine"] = localBarrierLine();
  local["padLine"] = localPadLine();
  local["padEdge"] = localPadEdge();
  local["barrier"] = localBarrierActive();
  local["pad"] = localPadActive();

  String out;
  serializeJson(doc, out);
  return out;
}
