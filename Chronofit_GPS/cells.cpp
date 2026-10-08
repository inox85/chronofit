#include "cells.h"
#include "params.h"
#include <ArduinoJson.h>
#include <IPAddress.h>
#include <WiFiUdp.h>

struct CellSlot {
  bool     used;
  bool     connected;
  bool     conflict;
  bool     hasEvent;
  uint8_t  line;
  uint8_t  rssiBucket;
  int8_t   rssi;           // 0 = sconosciuto
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

// Slot della cella `id`; se manca ne crea uno (libero, altrimenti sostituisce
// la cella persa da più tempo). Ritorna nullptr se sono tutte connesse.
// Da chiamare con s_mux preso.
static CellSlot *findOrCreate(const char *id, bool &created) {
  created = false;
  for (int i = 0; i < CELLS_MAX; i++)
    if (s_cells[i].used && strncmp(s_cells[i].id, id, sizeof(s_cells[i].id) - 1) == 0) return &s_cells[i];

  CellSlot *slot = nullptr;
  for (int i = 0; i < CELLS_MAX; i++)
    if (!s_cells[i].used) { slot = &s_cells[i]; break; }
  if (!slot) {
    for (int i = 0; i < CELLS_MAX; i++) {
      if (s_cells[i].connected) continue;
      if (!slot || (int32_t)(slot->lastSeenMs - s_cells[i].lastSeenMs) > 0) slot = &s_cells[i];
    }
  }
  if (!slot) return nullptr;
  memset(slot, 0, sizeof(CellSlot));
  slot->used = true;
  strlcpy(slot->id, id, sizeof(slot->id));
  created = true;
  return slot;
}

void cellsTouch(const char *id, int line, int rssi, uint32_t rttUs, const char *fw, uint32_t ip) {
  if (!id || !id[0] || line < 1 || line > 4) return;
  portENTER_CRITICAL(&s_mux);
  bool created;
  CellSlot *c = findOrCreate(id, created);
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
    c->connected = true;
  }
  portEXIT_CRITICAL(&s_mux);
}

void cellsBeepLine(int line) {
  if (line < 1 || line > 4) return;
  uint32_t ips[CELLS_MAX];
  int n = 0;
  portENTER_CRITICAL(&s_mux);
  for (int i = 0; i < CELLS_MAX; i++)
    if (s_cells[i].used && s_cells[i].connected && s_cells[i].line == line && s_cells[i].ip) ips[n++] = s_cells[i].ip;
  portEXIT_CRITICAL(&s_mux);

  Serial.printf("[beep] linea %d: %d celle connesse\n", line, n);
  static WiFiUDP udp;
  for (int i = 0; i < n; i++) {
    udp.beginPacket(IPAddress(ips[i]), CELL_BEEP_PORT);
    udp.write((const uint8_t *)"CFBEEP", 6);
    udp.endPacket();
  }
}

void cellsEvent(const char *id, int line, uint32_t ip) {
  if (!id || !id[0] || line < 1 || line > 4) return;
  portENTER_CRITICAL(&s_mux);
  bool created;
  CellSlot *c = findOrCreate(id, created);
  if (c) {
    if (created || !c->connected || c->line != line) s_dirty = true;
    c->line = (uint8_t)line;
    c->ip = ip;
    c->lastSeenMs = millis();
    c->connected = true;
    c->lastEventMs = c->lastSeenMs;
    c->hasEvent = true;
    c->events++;
  }
  portEXIT_CRITICAL(&s_mux);
}

bool cellsPoll() {
  uint32_t now = millis();
  bool changed;
  portENTER_CRITICAL(&s_mux);
  for (int i = 0; i < CELLS_MAX; i++) {
    CellSlot &c = s_cells[i];
    if (c.used && c.connected && (uint32_t)(now - c.lastSeenMs) > CELL_LOST_AFTER_MS) {
      c.connected = false;
      s_dirty = true;
    }
  }
  // Conflitto = due celle connesse che dichiarano la stessa linea.
  for (int i = 0; i < CELLS_MAX; i++) {
    CellSlot &c = s_cells[i];
    bool conflict = false;
    if (c.used && c.connected) {
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
    o["ip"] = IPAddress(c.ip).toString();
    o["connected"] = c.connected;
    o["conflict"] = c.conflict;
    o["ageMs"] = (uint32_t)(now - c.lastSeenMs);
    o["lastEventAgeMs"] = c.hasEvent ? (int64_t)(uint32_t)(now - c.lastEventMs) : (int64_t)-1;
    o["events"] = c.events;
  }
  doc["n"] = connected;
  doc["total"] = total;
  String out;
  serializeJson(doc, out);
  return out;
}
