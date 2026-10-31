#include "battery_runtime.h"
#include "cells.h"
#include "battery_curve.h"
#include "power.h"
#include "settings.h"

constexpr uint32_t BR_FEED_MS          = 1000;     // una lettura al secondo
constexpr float    BR_EMA_TAU_S        = 60.0f;    // costante del filtro sulla tensione
constexpr uint32_t BR_SETTLE_MS        = 60000;    // il filtro va a regime prima di stimare
constexpr uint32_t BR_SAMPLE_MS        = 60000;    // un campione di carica al minuto
constexpr int      BR_SAMPLES          = 40;       // finestra della regressione (minuti)
constexpr int      BR_MIN_SAMPLES      = 10;       // minuti minimi per usare la pendenza misurata
constexpr float    BR_FULL_WEIGHT_MIN  = 30.0f;    // da qui la pendenza misurata pesa del tutto
constexpr float    BR_MIN_RATE         = 0.5f;     // %/h: sotto è rumore dell'ADC
constexpr float    BR_MAX_SOC          = 99.5f;    // carica satura (inizio della curva): campione inutile
constexpr float    BR_RISE_MV          = 40.0f;    // risalita che indica una Cell RF in carica
constexpr float    BR_FALL_MV          = 15.0f;    // discesa dal massimo: carica finita
constexpr uint32_t BR_GAP_RESET_MS     = 300000;   // cella non sentita per 5 min: si riparte
constexpr uint32_t BR_LEARN_MS         = 600000;   // aggiornamento del consumo medio salvato
constexpr int      BR_MAX_MINUTES      = 99 * 60;
constexpr uint32_t BR_NOTIFY_MS        = 60000;    // al massimo un push alla console al minuto

// Stima per una batteria
class Estimator {
public:
  void setKind(BatteryCurveKind kind) { _kind = kind; }
  float ema() const { return _ema; }
  bool charging() const { return _charging; }

  void reset() {
    _count = _head = 0;
    _ema = 0;
    _minEma = 1e9f;
    _peakEma = 0;
    _lastFeedMs = _startMs = _lastSampleMs = 0;
    _charging = false;
  }

  void feed(uint32_t now, uint16_t mv, bool charging) {
    if (mv == 0) return;
    if (_lastFeedMs && (uint32_t)(now - _lastFeedMs) > BR_GAP_RESET_MS) reset();
    if (charging) { reset(); _charging = true; _lastFeedMs = now; return; }

    if (_ema <= 0) {
      _ema = mv;
      _startMs = _lastSampleMs = now;
      _charging = false;
    } else {
      float dt = (uint32_t)(now - _lastFeedMs) / 1000.0f;
      _ema += (mv - _ema) * dt / (BR_EMA_TAU_S + dt);
    }
    _lastFeedMs = now;

    // Tensione che risale: batteria in carica (le Cell RF non lo comunicano).
    // Resta "in carica" finché la tensione non riprende a scendere.
    if (_charging) {
      if (_ema > _peakEma) _peakEma = _ema;
      if (_ema > _peakEma - BR_FALL_MV) return;
      float ema = _ema;
      reset();
      _ema = ema;
      _minEma = ema;
      _startMs = _lastSampleMs = _lastFeedMs = now;
      return;
    }
    if (_ema > _minEma + BR_RISE_MV) {
      float ema = _ema;
      reset();
      _ema = _minEma = _peakEma = ema;
      _startMs = _lastSampleMs = _lastFeedMs = now;
      _charging = true;
      return;
    }
    if (_ema < _minEma) _minEma = _ema;

    if ((uint32_t)(now - _lastSampleMs) < BR_SAMPLE_MS) return;
    _lastSampleMs = now;
    float soc = batteryPercentF(_ema, _kind);
    if (soc >= BR_MAX_SOC) return;
    _soc[_head] = soc;
    _t[_head] = now;
    _head = (_head + 1) % BR_SAMPLES;
    if (_count < BR_SAMPLES) _count++;
  }

  // Consumo misurato in %/h (regressione lineare), -1 se non affidabile.
  // `spanMin` = minuti coperti dai campioni.
  float measuredRate(float &spanMin) const {
    spanMin = 0;
    if (_count < BR_MIN_SAMPLES) return -1;
    int first = (_head - _count + BR_SAMPLES) % BR_SAMPLES;
    uint32_t t0 = _t[first];
    float sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (int k = 0; k < _count; k++) {
      int i = (first + k) % BR_SAMPLES;
      float x = (uint32_t)(_t[i] - t0) / 60000.0f;
      sx += x; sy += _soc[i]; sxx += x * x; sxy += x * _soc[i];
      spanMin = x;
    }
    float den = _count * sxx - sx * sx;
    if (den <= 0) return -1;
    float slope = (_count * sxy - sx * sy) / den;   // %/min
    float rate = -slope * 60.0f;
    return rate >= BR_MIN_RATE ? rate : -1;
  }

  int minutes(float priorRate) const {
    if (_ema <= 0 || _charging) return BATTERY_MIN_UNKNOWN;
    if ((uint32_t)(_lastFeedMs - _startMs) < BR_SETTLE_MS) return BATTERY_MIN_ESTIMATING;
    float span;
    float rate = measuredRate(span);
    if (rate > 0 && priorRate > 0) {
      float w = min(1.0f, span / BR_FULL_WEIGHT_MIN);
      rate = w * rate + (1 - w) * priorRate;
    } else if (rate <= 0) {
      rate = priorRate;
    }
    if (rate <= 0) return BATTERY_MIN_ESTIMATING;
    float m = batteryPercentF(_ema, _kind) / rate * 60.0f;
    return m > BR_MAX_MINUTES ? BR_MAX_MINUTES : (int)(m + 0.5f);
  }

private:
  float    _soc[BR_SAMPLES];
  uint32_t _t[BR_SAMPLES];
  int      _count = 0, _head = 0;
  float    _ema = 0, _minEma = 1e9f, _peakEma = 0;
  uint32_t _lastFeedMs = 0, _startMs = 0, _lastSampleMs = 0;
  bool     _charging = false;
  BatteryCurveKind _kind = BAT_CURVE_CELL;
};

// Consumo medio salvato (%/h ×100 in NVS), 0 = non ancora noto
struct Prior {
  const char *key;
  float rate = 0;
  void load() { rate = readIntFromSettings(key, 0) / 100.0f; }
  // Media mobile con i consumi misurati su almeno BR_FULL_WEIGHT_MIN minuti
  void learn(const Estimator &e) {
    float span;
    float r = e.measuredRate(span);
    if (r <= 0 || span < BR_FULL_WEIGHT_MIN) return;
    float next = rate > 0 ? 0.7f * rate + 0.3f * r : r;
    if (rate > 0 && fabsf(next - rate) < rate * 0.05f) return;   // risparmia scritture in flash
    rate = next;
    writeIntToSettings(key, (int)(rate * 100 + 0.5f));
  }
};

struct CellRuntime {
  uint32_t  id = 0;
  bool      used = false;
  Estimator est;
  volatile int minutes = BATTERY_MIN_UNKNOWN;
  int       lastPct = -1;
};

static Estimator    s_main;
static volatile int s_mainMinutes = BATTERY_MIN_UNKNOWN;
static int          s_mainLastPct = -1;
static Prior        s_mainPrior{"bat_rate"};
static Prior        s_cellPrior{"cbat_rate"};
static CellRuntime  s_cells[CELLS_MAX];
static uint32_t     s_lastFeedMs = 0;
static uint32_t     s_lastLearnMs = 0;
static uint32_t     s_lastNotifyMs = 0;

void batteryRuntimeBegin() {
  s_main.setKind(BAT_CURVE_MAIN);
  s_main.reset();
  for (auto &c : s_cells) c.est.reset();
  s_mainPrior.load();
  s_cellPrior.load();
}

static CellRuntime *cellFor(uint32_t id) {
  for (auto &c : s_cells) if (c.used && c.id == id) return &c;
  for (auto &c : s_cells) {
    if (!c.used) {
      c.used = true;
      c.id = id;
      c.est.setKind(BAT_CURVE_CELL);
      c.est.reset();
      c.minutes = BATTERY_MIN_UNKNOWN;
      c.lastPct = -1;
      return &c;
    }
  }
  return nullptr;
}

// Valore mostrato in console: cambia a passi, così il push non parte per ogni minuto
static int displayStep(int minutes) {
  if (minutes < 0) return minutes;
  if (minutes < 60) return minutes / 5;
  return 100 + minutes / 15;
}

void batteryRuntimeUpdate() {
  uint32_t now = millis();
  if ((uint32_t)(now - s_lastFeedMs) < BR_FEED_MS) return;
  s_lastFeedMs = now;
  bool changed = false;

  // Main
  uint16_t mv = powerBatteryMv();
  bool external = powerExternal();
  s_main.feed(now, mv, external);
  batteryCurveFeed(0, BAT_CURVE_MAIN, now, s_main.ema(), external || s_main.charging(), true);
  int m = s_main.minutes(s_mainPrior.rate);
  if (displayStep(m) != displayStep(s_mainMinutes)) changed = true;
  s_mainMinutes = m;
  int pct = batteryPercent(mv, BAT_CURVE_MAIN);
  powerSetBatteryPercent(pct);   // avviso di batteria bassa e barra sui LED della Main
  if (pct != s_mainLastPct) { s_mainLastPct = pct; changed = true; }

  // Cell RF
  CellBatterySnap snap[CELLS_MAX];
  int n = cellsRfBatterySnapshot(snap, CELLS_MAX);
  for (auto &c : s_cells) {
    if (!c.used) continue;
    bool present = false;
    for (int i = 0; i < n; i++) if (snap[i].rfId == c.id) present = true;
    if (!present) { c.used = false; batteryCurveForget(c.id); }   // cella rimossa
  }
  for (int i = 0; i < n; i++) {
    if (!snap[i].connected || snap[i].mv == 0) {
      batteryCurveFeed(snap[i].rfId, BAT_CURVE_CELL, now, 0, false, false);
      continue;
    }
    CellRuntime *c = cellFor(snap[i].rfId);
    if (!c) continue;
    c->est.feed(now, snap[i].mv, false);
    batteryCurveFeed(c->id, BAT_CURVE_CELL, now, c->est.ema(), c->est.charging(), true);
    int cm = c->est.minutes(s_cellPrior.rate);
    if (displayStep(cm) != displayStep(c->minutes)) changed = true;
    c->minutes = cm;
    int cp = batteryPercent(snap[i].mv, BAT_CURVE_CELL);
    if (cp != c->lastPct) { c->lastPct = cp; changed = true; }
  }

  if ((uint32_t)(now - s_lastLearnMs) >= BR_LEARN_MS) {
    s_lastLearnMs = now;
    if (!powerExternal()) s_mainPrior.learn(s_main);
    for (auto &c : s_cells) if (c.used) s_cellPrior.learn(c.est);
  }

  if (changed && (uint32_t)(now - s_lastNotifyMs) >= BR_NOTIFY_MS) {
    s_lastNotifyMs = now;
    cellsMarkDirty();
  }
}

int batteryRuntimeMainMinutes() { return s_mainMinutes; }

int batteryRuntimeCellMinutes(uint32_t rfId) {
  for (auto &c : s_cells) if (c.used && c.id == rfId) return c.minutes;
  return BATTERY_MIN_UNKNOWN;
}
