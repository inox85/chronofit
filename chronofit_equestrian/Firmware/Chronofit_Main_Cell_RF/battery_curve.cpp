#include "battery_curve.h"
#include "cells.h"
#include <ArduinoJson.h>
#include <LittleFS.h>

static const char *CURVE_FILE    = "/bat_curve.json";
static const char *MAIN_LOG_FILE = "/bat_log_main.bin";

// Griglia della curva e curva tipica di una cella al litio a potenza costante:
// la tensione resta a lungo sul plateau 3,6–3,9 V e scende in fretta sotto i
// 3,5 V, quindi una scala lineare darebbe valori troppo bassi a metà scarica e
// troppo alti verso la fine.
constexpr int      GRID = 10;
static const uint16_t GRID_MV[GRID]     = { 3100, 3300, 3400, 3500, 3600, 3700, 3800, 3900, 4000, 4100 };
static const float    DEFAULT_PCT[GRID] = {    0,    3,    8,   17,   30,   48,   64,   78,   90,  100 };

constexpr uint16_t FULL_DISPLAY_MV = 3900;     // carica mostrata = 100 % da qui in su

constexpr float    LOG_ARM_MV      = 4100;     // carica piena: si arma la registrazione...
constexpr float    LOG_START_MV    = 4100;     // ...che parte quando la tensione scende sotto
constexpr float    LOG_END_MV      = 3200;     // ultimo campione sotto questa tensione = scarica completa
constexpr float    LOG_RISE_MV     = 60;       // risalita durante la scarica: ricarica non vista
constexpr uint32_t LOG_SAMPLE_MS   = 120000;   // un campione ogni 2 minuti
constexpr int      LOG_MAX         = 720;      // 24 ore
constexpr int      LOG_MIN         = 30;       // almeno un'ora di scarica
constexpr uint32_t LOG_LOST_MS     = 60000;    // cella non più sentita: scarica finita
constexpr int      CURVE_AVG_MAX   = 4;        // la curva è la media delle ultime scariche

struct Curve {
  float pct[GRID];
  int   n;          // scariche apprese, 0 = curva tipica
};

struct DischargeLog {
  uint32_t id = 0;
  bool     used = false;
  bool     armed = false;
  bool     active = false;
  BatteryCurveKind kind = BAT_CURVE_CELL;
  uint16_t mv[LOG_MAX];
  int      n = 0;
  uint32_t lastSampleMs = 0;
  uint32_t lastSeenMs = 0;
};

static Curve        s_curves[2];
static portMUX_TYPE s_mux = portMUX_INITIALIZER_UNLOCKED;   // le curve si leggono anche dal task radio
static DischargeLog s_logs[CELLS_MAX + 1];

// ── Curve ───────────────────────────────────────────────────────────────────

static void setDefault(Curve &c) {
  memcpy(c.pct, DEFAULT_PCT, sizeof(c.pct));
  c.n = 0;
}

static void saveCurves() {
  Curve copy[2];
  portENTER_CRITICAL(&s_mux);
  memcpy(copy, s_curves, sizeof(copy));
  portEXIT_CRITICAL(&s_mux);

  JsonDocument doc;
  const char *names[2] = {"main", "cell"};
  for (int k = 0; k < 2; k++) {
    if (copy[k].n == 0) continue;
    JsonObject o = doc[names[k]].to<JsonObject>();
    o["n"] = copy[k].n;
    JsonArray a = o["pct"].to<JsonArray>();
    for (int i = 0; i < GRID; i++) a.add(roundf(copy[k].pct[i] * 10) / 10);
  }
  File f = LittleFS.open(CURVE_FILE, "w");
  if (!f) return;
  serializeJson(doc, f);
  f.close();
}

static void loadCurves() {
  setDefault(s_curves[0]);
  setDefault(s_curves[1]);
  File f = LittleFS.open(CURVE_FILE, "r");
  if (!f) return;
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) return;
  const char *names[2] = {"main", "cell"};
  for (int k = 0; k < 2; k++) {
    JsonArray a = doc[names[k]]["pct"];
    if (a.size() != GRID) continue;
    for (int i = 0; i < GRID; i++) s_curves[k].pct[i] = a[i].as<float>();
    s_curves[k].n = doc[names[k]]["n"] | 1;
  }
}

static float percentOn(const float *pct, float mv) {
  if (mv <= GRID_MV[0]) return pct[0];
  if (mv >= GRID_MV[GRID - 1]) return pct[GRID - 1];
  for (int i = 1; i < GRID; i++) {
    if (mv <= GRID_MV[i]) {
      return pct[i - 1] + (mv - GRID_MV[i - 1]) * (pct[i] - pct[i - 1]) / (GRID_MV[i] - GRID_MV[i - 1]);
    }
  }
  return pct[GRID - 1];
}

float batteryPercentF(float mv, BatteryCurveKind kind) {
  if (mv <= 0) return -1;
  float pct[GRID];
  portENTER_CRITICAL(&s_mux);
  memcpy(pct, s_curves[kind].pct, sizeof(pct));
  portEXIT_CRITICAL(&s_mux);
  return percentOn(pct, mv);
}

int batteryPercent(uint16_t mv, BatteryCurveKind kind) {
  if (mv == 0) return -1;
  float pct[GRID];
  portENTER_CRITICAL(&s_mux);
  memcpy(pct, s_curves[kind].pct, sizeof(pct));
  portEXIT_CRITICAL(&s_mux);
  float full = percentOn(pct, FULL_DISPLAY_MV);
  if (full <= 0) return 0;
  float p = percentOn(pct, mv) * 100.0f / full;
  return p >= 100.0f ? 100 : (p <= 0 ? 0 : (int)(p + 0.5f));
}

// Curva di una scarica completa, mediata con quelle precedenti
static void learn(BatteryCurveKind kind, const uint16_t *mv, int n) {
  float np[GRID];
  for (int g = 0; g < GRID; g++) {
    if (GRID_MV[g] >= mv[0]) { np[g] = 100; continue; }
    int i = 0;
    while (i < n && mv[i] > GRID_MV[g]) i++;
    np[g] = i >= n ? 0 : 100.0f * (n - 1 - i) / (n - 1);
  }
  portENTER_CRITICAL(&s_mux);
  Curve &c = s_curves[kind];
  if (c.n == 0) {
    memcpy(c.pct, np, sizeof(np));
  } else {
    int w = c.n < CURVE_AVG_MAX - 1 ? c.n : CURVE_AVG_MAX - 1;
    for (int g = 0; g < GRID; g++) c.pct[g] = (c.pct[g] * w + np[g]) / (w + 1);
  }
  if (c.n < 99) c.n++;
  portEXIT_CRITICAL(&s_mux);
  saveCurves();
  Serial.printf("[batteria] curva %s appresa da una scarica di %d min (3,5 V = %.0f %%, 3,7 V = %.0f %%)\n",
                kind == BAT_CURVE_MAIN ? "Main" : "celle", (n - 1) * (int)(LOG_SAMPLE_MS / 60000),
                np[3], np[5]);
}

void batteryCurveReset(BatteryCurveKind kind) {
  portENTER_CRITICAL(&s_mux);
  setDefault(s_curves[kind]);
  portEXIT_CRITICAL(&s_mux);
  saveCurves();
}

// ── Registrazione delle scariche ────────────────────────────────────────────

static void finish(DischargeLog &l) {
  if (l.active && l.n >= LOG_MIN && l.mv[l.n - 1] <= LOG_END_MV) learn(l.kind, l.mv, l.n);
  l.active = false;
  l.armed = false;
  l.n = 0;
  if (l.id == 0) LittleFS.remove(MAIN_LOG_FILE);
}

static DischargeLog *logFor(uint32_t id, BatteryCurveKind kind) {
  for (auto &l : s_logs) if (l.used && l.id == id) return &l;
  for (auto &l : s_logs) {
    if (!l.used) {
      l.used = true;
      l.id = id;
      l.kind = kind;
      l.armed = l.active = false;
      l.n = 0;
      l.lastSeenMs = millis();
      return &l;
    }
  }
  return nullptr;
}

void batteryCurveFeed(uint32_t id, BatteryCurveKind kind, uint32_t now,
                      float emaMv, bool charging, bool present) {
  DischargeLog *l = logFor(id, kind);
  if (!l) return;
  if (!present) {
    // Cella spenta (batteria scarica) o persa: se era a fine scarica la si impara
    if (l->active && (uint32_t)(now - l->lastSeenMs) > LOG_LOST_MS) finish(*l);
    return;
  }
  l->lastSeenMs = now;
  if (emaMv <= 0) return;
  if (charging) {
    if (l->active) finish(*l);
    l->armed = false;
    return;
  }

  if (!l->active) {
    if (emaMv >= LOG_ARM_MV) {
      l->armed = true;
    } else if (l->armed && emaMv < LOG_START_MV) {
      l->active = true;
      l->n = 0;
      l->lastSampleMs = now - LOG_SAMPLE_MS;
      if (id == 0) LittleFS.remove(MAIN_LOG_FILE);
    }
    if (!l->active) return;
  }

  if ((uint32_t)(now - l->lastSampleMs) < LOG_SAMPLE_MS) return;
  l->lastSampleMs = now;
  if (l->n > 0 && emaMv > l->mv[l->n - 1] + LOG_RISE_MV) { finish(*l); return; }
  if (l->n >= LOG_MAX) { l->active = false; l->n = 0; return; }   // troppo lunga: potenza non costante
  uint16_t v = (uint16_t)(emaMv + 0.5f);
  l->mv[l->n++] = v;
  if (id == 0) {
    File f = LittleFS.open(MAIN_LOG_FILE, "a");
    if (f) { f.write((const uint8_t *)&v, sizeof(v)); f.close(); }
  }
}

void batteryCurveForget(uint32_t id) {
  for (auto &l : s_logs) if (l.used && l.id == id) { l.used = false; l.active = false; l.n = 0; }
}

void batteryCurveBegin() {
  loadCurves();
  // Scarica della Main registrata prima dello spegnimento
  File f = LittleFS.open(MAIN_LOG_FILE, "r");
  if (f) {
    static uint16_t mv[LOG_MAX];
    int n = 0;
    while (n < LOG_MAX && f.read((uint8_t *)&mv[n], sizeof(uint16_t)) == sizeof(uint16_t)) n++;
    f.close();
    if (n >= LOG_MIN && mv[n - 1] <= LOG_END_MV) learn(BAT_CURVE_MAIN, mv, n);
    LittleFS.remove(MAIN_LOG_FILE);
  }
}

String batteryCurveJson() {
  Curve copy[2];
  portENTER_CRITICAL(&s_mux);
  memcpy(copy, s_curves, sizeof(copy));
  portEXIT_CRITICAL(&s_mux);

  JsonDocument doc;
  JsonArray grid = doc["grid"].to<JsonArray>();
  JsonArray def = doc["default"].to<JsonArray>();
  for (int i = 0; i < GRID; i++) { grid.add(GRID_MV[i]); def.add(DEFAULT_PCT[i]); }
  const char *names[2] = {"main", "cell"};
  for (int k = 0; k < 2; k++) {
    JsonObject o = doc[names[k]].to<JsonObject>();
    o["n"] = copy[k].n;
    if (copy[k].n == 0) { o["pct"] = nullptr; continue; }
    JsonArray a = o["pct"].to<JsonArray>();
    for (int i = 0; i < GRID; i++) a.add(roundf(copy[k].pct[i] * 10) / 10);
  }
  JsonArray logs = doc["logging"].to<JsonArray>();
  for (const auto &l : s_logs) {
    if (!l.used || !l.active || l.n == 0) continue;
    JsonObject o = logs.add<JsonObject>();
    char id[17];
    if (l.id == 0) strcpy(id, "Main");
    else snprintf(id, sizeof(id), "%08lx", (unsigned long)l.id);
    o["id"] = id;
    o["minutes"] = (l.n - 1) * (int)(LOG_SAMPLE_MS / 60000);
    o["startMv"] = l.mv[0];
    o["lastMv"] = l.mv[l.n - 1];
  }
  String out;
  serializeJson(doc, out);
  return out;
}
