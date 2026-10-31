#include "equestrian.h"
#include "globals.h"
#include "routes.h"
#include "params.h"
#include "settings.h"
#include "buzzer.h"
#include "time_utils.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <esp_timer.h>
#include <math.h>
#include <memory>
#include <new>

constexpr int      EQ_MAX_VARIANTS   = 8;
constexpr int      EQ_MAX_FAULTS     = 8;
constexpr int      EQ_MAX_ROUNDS     = 400;
constexpr uint32_t EQ_PERIODIC_MS    = 1000;    // aggiornamento alle console durante conto alla rovescia/percorso
constexpr uint32_t EQ_SAVE_DELAY_MS  = 1500;    // i turni si salvano poco dopo l'ultima modifica
constexpr uint32_t EQ_MIN_RUN_MS     = 2000;    // con partenza = arrivo: il secondo passaggio vale come arrivo dopo 2 s
static const char *EQ_ROUNDS_FILE    = "/eq_rounds.json";
static const char *EQ_CFG_KEY        = "eq_cfg";
static const char *EQ_ON_KEY         = "eq_on";

enum EqState : uint8_t { EQ_READY = 0, EQ_COUNTDOWN, EQ_RUNNING, EQ_PAUSED, EQ_FINISHED, EQ_CONFIRMED, EQ_CANCELLED };
static const char *STATE_NAMES[] = {"ready", "countdown", "running", "paused", "finished", "confirmed", "cancelled"};

enum : uint8_t { F_AUTO = 1, F_ELIM = 2, F_RET = 4, F_TL = 8 };   // flag del turno

// Tipo di errore: punti e/o secondi aggiunti al tempo; eliminazione diretta o
// al raggiungimento di `elimAt` errori dello stesso gruppo (es. 2 rifiuti).
struct EqFault {
  char    label[32];
  int16_t pointsX100;   // punti × 100 (ammessi i decimali)
  int16_t secX10;       // secondi × 10 aggiunti al tempo
  uint8_t group;        // 0 = nessun gruppo
  uint8_t elimAt;       // errori del gruppo che eliminano (0 = mai)
  bool    elim;         // elimina subito
};

struct EqVariant {
  char     name[40];
  uint16_t countdownS;   // conto alla rovescia dopo la campana (0 = nessuno)
  bool     autoStart;    // allo scadere il tempo parte da solo
  bool     warnBeeps;    // beep negli ultimi 5 s del conto alla rovescia
  uint8_t  tpMode;       // penalità di tempo: 0 nessuna, 1 punti, 2 secondi aggiunti
  uint16_t tpEveryS;     // ogni N secondi oltre il tempo concesso...
  int16_t  tpAmountX100; // ...questa penalità (× 100)
  bool     tpCommenced;  // conta anche l'intervallo iniziato
  int16_t  tlFactorX100; // tempo limite = tempo concesso × fattore (0 = nessuno)
  uint8_t  rank;         // classifica: 0 punti poi tempo, 1 tempo totale, 2 solo punti
  uint8_t  finalMode;    // 0 una fase, 1 con barrage, 2 due fasi
  bool     consecutive;  // due fasi consecutive: all'intermedio, se netto, parte subito la 2ª fase
  uint8_t  nFaults;
  EqFault  f[EQ_MAX_FAULTS];
};

struct EqCourse {
  uint8_t  variant;
  uint8_t  startLine, finishLine;
  uint16_t lengthM, speedMpm;
  uint32_t taOverrideMs;   // 0 = calcolato da lunghezza e velocità
  uint8_t  phase;          // fase proposta per il prossimo turno
  uint8_t  midLine;        // linea intermedia / arrivo della 1ª fase (0 = nessuna)
  uint16_t length2M;       // 2ª fase o barrage: lunghezza (0 = come la 1ª fase)
  uint32_t ta2OverrideMs;  // 2ª fase o barrage: tempo concesso fisso (0 = calcolato)
};

struct EqRound {
  uint16_t id;
  int32_t  comp;
  uint8_t  phase, variant, state, flags;
  uint8_t  faults[EQ_MAX_FAULTS];
  uint32_t taMs, tlMs;
  uint64_t tCdEnd, tStart, tPause;   // istanti esp_timer (µs), validi solo in questa accensione
  uint32_t pauseMs, rawMs;
  int32_t  overrideMs;               // tempo corretto a mano (-1 = no)
  uint32_t midMs;                    // tempo al passaggio sulla linea intermedia (0 = non passato)
};

static EqVariant  s_var[EQ_MAX_VARIANTS];
static int        s_nVar = 0;
static EqCourse   s_course;
static EqRound   *s_rounds = nullptr;   // ~29 KB, allocati solo con le Gare accese (vedi ensureRounds)
static int        s_nRounds = 0;
static int        s_cur = -1;          // turno attivo (pronto/conto/in corso/interrotto/arrivato)
static uint16_t   s_lastId = 0;
static uint32_t   s_rev = 1;
static bool       s_broadcast = false, s_cfgBroadcast = false, s_cfgSave = false;
static bool       s_dirty = false;
static uint32_t   s_lastChangeMs = 0, s_lastPeriodicMs = 0;
static int        s_lastWarnS = -1;
static SemaphoreHandle_t s_mtx = nullptr;

// I turni (EQ_MAX_ROUNDS × sizeof(EqRound), ~29 KB) stanno in RAM solo con le Gare
// accese: con le Gare spente, o in un'altra disciplina, quella memoria resta libera
// per il resto del firmware. I turni salvati restano in /eq_rounds.json.
static bool ensureRounds() {
  if (s_rounds) return true;
  s_rounds = (EqRound *)malloc(sizeof(EqRound) * EQ_MAX_ROUNDS);
  if (!s_rounds) {
    Serial.println("[eq] memoria insufficiente per i turni");
    return false;
  }
  return true;
}

static void freeRounds() {
  if (!s_rounds) return;
  free(s_rounds);
  s_rounds = nullptr;
  s_nRounds = 0;
  s_cur = -1;
}
// Gara assistita (campana, turni, penalità). Spenta = cronometraggio standard,
// identico a prima del modulo: nessun passaggio usato qui, linee e linea di start
// del tempo trascorso lasciate alla console.
static bool       s_on = false;

struct Lock {
  Lock()  { xSemaphoreTakeRecursive(s_mtx, portMAX_DELAY); }
  ~Lock() { xSemaphoreGiveRecursive(s_mtx); }
};

static uint64_t nowUs() { return (uint64_t)esp_timer_get_time(); }

static void applyStartLine() {
  if (s_on) {
    elapsedStartLine = s_course.startLine;
  } else {
    int l = readIntFromSettings("el_start", 0);   // quella scelta nella console (/elapsedStartLine)
    elapsedStartLine = (l >= 0 && l <= 4) ? l : 0;
  }
}

static void changed() {          // un turno è cambiato
  s_rev++;
  s_dirty = true;
  s_broadcast = true;
  s_lastChangeMs = millis();
}

// ── Regolamento predefinito (punto di partenza, da verificare) ──────────────

static void setFault(EqFault &f, const char *label, float pts, float sec, uint8_t group, uint8_t elimAt, bool elim) {
  strlcpy(f.label, label, sizeof(f.label));
  f.pointsX100 = (int16_t)lroundf(pts * 100);
  f.secX10 = (int16_t)lroundf(sec * 10);
  f.group = group;
  f.elimAt = elimAt;
  f.elim = elim;
}

static void tableA(EqVariant &v, const char *name, uint8_t rank, uint8_t finalMode) {
  memset(&v, 0, sizeof(v));
  strlcpy(v.name, name, sizeof(v.name));
  v.countdownS = 45; v.autoStart = true; v.warnBeeps = true;
  v.tpMode = 1; v.tpEveryS = 4; v.tpAmountX100 = 100; v.tpCommenced = true;
  v.tlFactorX100 = 200; v.rank = rank; v.finalMode = finalMode;
  v.nFaults = 4;
  setFault(v.f[0], "Abbattimento", 4, 0, 0, 0, false);
  setFault(v.f[1], "Rifiuto", 4, 0, 1, 2, false);
  setFault(v.f[2], "Rifiuto con abbattimento (+6 s)", 4, 6, 1, 2, false);
  setFault(v.f[3], "Caduta", 0, 0, 0, 0, true);
}

static void loadDefaults() {
  s_nVar = 5;
  tableA(s_var[0], "Tabella A a tempo", 0, 0);
  tableA(s_var[1], "Tabella A con barrage", 0, 1);
  tableA(s_var[2], "Due fasi", 0, 2);
  s_var[2].consecutive = true;
  EqVariant &c = s_var[3];
  memset(&c, 0, sizeof(c));
  strlcpy(c.name, "Tabella C (errori in secondi)", sizeof(c.name));
  c.countdownS = 45; c.autoStart = true; c.warnBeeps = true;
  c.tpMode = 0; c.tpEveryS = 4; c.tpAmountX100 = 100; c.tpCommenced = true;
  c.tlFactorX100 = 0; c.rank = 1; c.finalMode = 0; c.nFaults = 4;
  setFault(c.f[0], "Abbattimento (+4 s)", 0, 4, 0, 0, false);
  setFault(c.f[1], "Rifiuto", 0, 0, 1, 2, false);
  setFault(c.f[2], "Rifiuto con abbattimento (+6 s)", 0, 6, 1, 2, false);
  setFault(c.f[3], "Caduta", 0, 0, 0, 0, true);
  tableA(s_var[4], "Tabella A senza cronometro", 2, 0);
  s_course = {0, 1, 2, 0, 350, 0, 1, 0, 0, 0};
}

// ── Regolamento ↔ JSON ──────────────────────────────────────────────────────

static void cfgToJson(JsonDocument &doc) {
  doc["v"] = 1;
  JsonArray va = doc["variants"].to<JsonArray>();
  for (int i = 0; i < s_nVar; i++) {
    const EqVariant &v = s_var[i];
    JsonObject o = va.add<JsonObject>();
    o["name"] = v.name;
    o["cd"] = v.countdownS;
    o["auto"] = v.autoStart;
    o["warn"] = v.warnBeeps;
    JsonObject tp = o["tp"].to<JsonObject>();
    tp["mode"] = v.tpMode;
    tp["every"] = v.tpEveryS;
    tp["amount"] = v.tpAmountX100 / 100.0;
    tp["commenced"] = v.tpCommenced;
    o["tl"] = v.tlFactorX100 / 100.0;
    o["rank"] = v.rank;
    o["final"] = v.finalMode;
    o["consec"] = v.consecutive;
    JsonArray fa = o["faults"].to<JsonArray>();
    for (int k = 0; k < v.nFaults; k++) {
      const EqFault &f = v.f[k];
      JsonObject fo = fa.add<JsonObject>();
      fo["label"] = f.label;
      fo["pts"] = f.pointsX100 / 100.0;
      fo["sec"] = f.secX10 / 10.0;
      fo["group"] = f.group;
      fo["elimAt"] = f.elimAt;
      fo["elim"] = f.elim;
    }
  }
  JsonObject c = doc["course"].to<JsonObject>();
  c["variant"] = s_course.variant;
  c["start"] = s_course.startLine;
  c["finish"] = s_course.finishLine;
  c["length"] = s_course.lengthM;
  c["speed"] = s_course.speedMpm;
  c["ta"] = s_course.taOverrideMs;
  c["phase"] = s_course.phase;
  c["mid"] = s_course.midLine;
  c["length2"] = s_course.length2M;
  c["ta2"] = s_course.ta2OverrideMs;
}

// Ritorna false se il JSON non è valido (il regolamento resta quello di prima)
static bool cfgFromJson(JsonVariantConst doc) {
  JsonArrayConst va = doc["variants"];
  if (va.isNull() || va.size() == 0 || va.size() > EQ_MAX_VARIANTS) return false;
  // ~3 KB: sullo heap solo per la durata della chiamata (né statico né sullo stack del task del server web)
  std::unique_ptr<EqVariant[]> tmpOwner(new (std::nothrow) EqVariant[EQ_MAX_VARIANTS]);
  if (!tmpOwner) return false;
  EqVariant *tmp = tmpOwner.get();
  int n = 0;
  for (JsonObjectConst o : va) {
    EqVariant &v = tmp[n++];
    memset(&v, 0, sizeof(v));
    strlcpy(v.name, o["name"] | "Variante", sizeof(v.name));
    v.countdownS = constrain((int)(o["cd"] | 0), 0, 600);
    v.autoStart = o["auto"] | false;
    v.warnBeeps = o["warn"] | false;
    v.tpMode = constrain((int)(o["tp"]["mode"] | 0), 0, 2);
    v.tpEveryS = constrain((int)(o["tp"]["every"] | 4), 1, 600);
    v.tpAmountX100 = (int16_t)lroundf(constrain((float)(o["tp"]["amount"] | 1.0f), 0.0f, 100.0f) * 100);
    v.tpCommenced = o["tp"]["commenced"] | true;
    v.tlFactorX100 = (int16_t)lroundf(constrain((float)(o["tl"] | 0.0f), 0.0f, 10.0f) * 100);
    v.rank = constrain((int)(o["rank"] | 0), 0, 2);
    v.finalMode = constrain((int)(o["final"] | 0), 0, 2);
    v.consecutive = o["consec"] | false;
    JsonArrayConst fa = o["faults"];
    for (JsonObjectConst fo : fa) {
      if (v.nFaults >= EQ_MAX_FAULTS) break;
      setFault(v.f[v.nFaults++], fo["label"] | "Errore",
               constrain((float)(fo["pts"] | 0.0f), -100.0f, 100.0f), constrain((float)(fo["sec"] | 0.0f), -600.0f, 600.0f),
               constrain((int)(fo["group"] | 0), 0, 9), constrain((int)(fo["elimAt"] | 0), 0, 20), fo["elim"] | false);
    }
  }
  JsonObjectConst c = doc["course"];
  EqCourse course = s_course;
  if (!c.isNull()) {
    course.variant = constrain((int)(c["variant"] | 0), 0, n - 1);
    course.startLine = constrain((int)(c["start"] | 1), 1, 4);
    course.finishLine = constrain((int)(c["finish"] | 2), 1, 4);
    course.lengthM = constrain((int)(c["length"] | 0), 0, 5000);
    course.speedMpm = constrain((int)(c["speed"] | 350), 0, 1000);
    course.taOverrideMs = constrain((uint32_t)(c["ta"] | 0), (uint32_t)0, (uint32_t)3600000);
    course.phase = constrain((int)(c["phase"] | 1), 1, 2);
    course.midLine = constrain((int)(c["mid"] | 0), 0, 4);
    if (course.midLine == course.startLine || course.midLine == course.finishLine) course.midLine = 0;
    course.length2M = constrain((int)(c["length2"] | 0), 0, 5000);
    course.ta2OverrideMs = constrain((uint32_t)(c["ta2"] | 0), (uint32_t)0, (uint32_t)3600000);
  }
  memcpy(s_var, tmp, sizeof(EqVariant) * EQ_MAX_VARIANTS);
  s_nVar = n;
  s_course = course;
  if (s_course.variant >= s_nVar) s_course.variant = 0;
  return true;
}

static void cfgSave() {
  JsonDocument doc;
  cfgToJson(doc);
  String out;
  serializeJson(doc, out);
  settingsBegin();
  settings.putBytes(EQ_CFG_KEY, out.c_str(), out.length());
  settingsEnd();
}

static void cfgLoad() {
  loadDefaults();
  settingsBegin();
  size_t len = settings.getBytesLength(EQ_CFG_KEY);
  String json;
  if (len > 0 && len < 16384) {
    char *buf = (char *)malloc(len + 1);
    if (buf) {
      settings.getBytes(EQ_CFG_KEY, buf, len);
      buf[len] = 0;
      json = buf;
      free(buf);
    }
  }
  settingsEnd();
  if (json.length()) {
    JsonDocument doc;
    if (!deserializeJson(doc, json)) cfgFromJson(doc.as<JsonVariantConst>());
  }
}

// ── Tempi e risultati ───────────────────────────────────────────────────────

// Tempo concesso della fase (la 2ª fase o il barrage hanno i propri dati, se impostati)
static uint32_t courseTaMs(int phase = 1) {
  uint32_t fixed = s_course.taOverrideMs;
  uint16_t len = s_course.lengthM;
  if (phase == 2 && (s_course.ta2OverrideMs || s_course.length2M)) {
    fixed = s_course.ta2OverrideMs;
    len = s_course.length2M;
  }
  if (fixed) return fixed;
  if (!len || !s_course.speedMpm) return 0;
  // tempo concesso = lunghezza / velocità, arrotondato al secondo superiore
  uint32_t ms = (uint32_t)(((uint64_t)len * 60000ULL + s_course.speedMpm - 1) / s_course.speedMpm);
  return ((ms + 999) / 1000) * 1000;
}

// Millisecondi da `from` a `to` senza segno: se `to` precede `from` è 0, non un
// numero enorme (la sottrazione di due uint64 andrebbe in overflow)
static int64_t usToMs(uint64_t from, uint64_t to) {
  return to > from ? (int64_t)((to - from) / 1000) : 0;
}

static uint32_t rawElapsedMs(const EqRound &r, uint64_t now) {
  switch (r.state) {
    case EQ_RUNNING: { int64_t ms = usToMs(r.tStart, now) - r.pauseMs; return ms > 0 ? (uint32_t)ms : 0; }
    case EQ_PAUSED:  { int64_t ms = usToMs(r.tStart, r.tPause) - r.pauseMs; return ms > 0 ? (uint32_t)ms : 0; }
    case EQ_FINISHED:
    case EQ_CONFIRMED: return r.rawMs;
    default: return 0;
  }
}

struct EqResult {
  uint32_t timeMs;      // tempo del percorso (con le correzioni in secondi), al centesimo
  int32_t  faultX100;   // penalità di percorso
  int32_t  timePenX100; // penalità di tempo (punti, o secondi × 100 se tpMode = 2)
  int32_t  totalX100;   // punti totali
  uint32_t totalTimeMs; // tempo per la classifica a tempo (con i secondi di penalità)
  bool     elim, retired;
  const char *reason;
};

static EqResult computeResult(const EqRound &r, uint64_t now) {
  EqResult res = {0, 0, 0, 0, 0, false, false, ""};
  const EqVariant &v = s_var[r.variant < s_nVar ? r.variant : 0];
  int32_t corrMs = 0;
  int groupCount[10] = {0};
  int groupElimAt[10] = {0};
  for (int k = 0; k < v.nFaults; k++) {
    int n = r.faults[k];
    res.faultX100 += n * v.f[k].pointsX100;
    corrMs += n * v.f[k].secX10 * 100;
    if (v.f[k].elim && n > 0 && !res.elim) { res.elim = true; res.reason = v.f[k].label; }
    if (v.f[k].group) {
      groupCount[v.f[k].group] += n;
      if (v.f[k].elimAt) groupElimAt[v.f[k].group] = v.f[k].elimAt;
    }
  }
  for (int g = 1; g < 10; g++) {
    if (groupElimAt[g] && groupCount[g] >= groupElimAt[g] && !res.elim) {
      res.elim = true;
      res.reason = "refusals";
    }
  }
  int64_t t = r.overrideMs >= 0 ? r.overrideMs : (int64_t)rawElapsedMs(r, now) + corrMs;
  if (t < 0) t = 0;
  res.timeMs = (uint32_t)(t / 10) * 10;   // al centesimo, per difetto
  if (v.tpMode && r.taMs && res.timeMs > r.taMs) {
    uint32_t over = res.timeMs - r.taMs, every = (uint32_t)v.tpEveryS * 1000;
    uint32_t n = v.tpCommenced ? (over + every - 1) / every : over / every;
    res.timePenX100 = (int32_t)n * v.tpAmountX100;
  }
  res.totalX100 = res.faultX100 + (v.tpMode == 1 ? res.timePenX100 : 0);
  res.totalTimeMs = res.timeMs + (v.tpMode == 2 ? (uint32_t)res.timePenX100 * 10 : 0);
  if ((r.flags & F_TL) && !res.elim) { res.elim = true; res.reason = "time_limit"; }
  if ((r.flags & F_ELIM) && !res.elim) { res.elim = true; res.reason = "manual"; }
  res.retired = r.flags & F_RET;
  return res;
}

static void roundToJson(const EqRound &r, JsonObject o, uint64_t now) {
  EqResult res = computeResult(r, now);
  o["id"] = r.id;
  o["comp"] = r.comp;
  o["phase"] = r.phase;
  o["v"] = r.variant;
  o["st"] = STATE_NAMES[r.state];
  o["auto"] = (bool)(r.flags & F_AUTO);
  o["ta"] = r.taMs;
  o["tl"] = r.tlMs;
  o["t"] = res.timeMs;
  o["fp"] = res.faultX100 / 100.0;
  o["tp"] = res.timePenX100 / 100.0;
  o["pts"] = res.totalX100 / 100.0;
  o["tt"] = res.totalTimeMs;
  o["elim"] = res.elim;
  o["ret"] = res.retired;
  o["reason"] = res.reason;
  o["ovr"] = r.overrideMs >= 0;
  o["mid"] = r.midMs;
  JsonArray fa = o["faults"].to<JsonArray>();
  const EqVariant &v = s_var[r.variant < s_nVar ? r.variant : 0];
  for (int k = 0; k < v.nFaults; k++) fa.add(r.faults[k]);
  if (r.state == EQ_COUNTDOWN) {
    o["cd"] = usToMs(now, r.tCdEnd);
  }
}

// ── Persistenza dei turni ───────────────────────────────────────────────────

static void saveRounds() {
  if (!s_rounds) return;   // Gare spente: il file resta com'è
  File f = LittleFS.open(EQ_ROUNDS_FILE, "w");
  if (!f) return;
  for (int i = 0; i < s_nRounds; i++) {
    const EqRound &r = s_rounds[i];
    JsonDocument d;
    d["id"] = r.id; d["c"] = r.comp; d["p"] = r.phase; d["v"] = r.variant; d["s"] = r.state;
    d["f"] = r.flags; d["ta"] = r.taMs; d["tl"] = r.tlMs; d["raw"] = r.rawMs; d["o"] = r.overrideMs;
    if (r.midMs) d["m"] = r.midMs;
    JsonArray fa = d["e"].to<JsonArray>();
    for (int k = 0; k < EQ_MAX_FAULTS; k++) fa.add(r.faults[k]);
    serializeJson(d, f);
    f.println();
  }
  f.close();
}

static void loadRounds() {
  s_nRounds = 0;
  if (!s_rounds) return;
  File f = LittleFS.open(EQ_ROUNDS_FILE, "r");
  if (!f) return;
  while (f.available() && s_nRounds < EQ_MAX_ROUNDS) {
    String line = f.readStringUntil('\n');
    if (line.length() < 5) continue;
    JsonDocument d;
    if (deserializeJson(d, line)) continue;
    EqRound &r = s_rounds[s_nRounds++];
    memset(&r, 0, sizeof(r));
    r.id = d["id"] | 0; r.comp = d["c"] | 0; r.phase = d["p"] | 1; r.variant = d["v"] | 0;
    r.state = d["s"] | (int)EQ_CANCELLED; r.flags = d["f"] | 0; r.taMs = d["ta"] | 0; r.tlMs = d["tl"] | 0;
    r.rawMs = d["raw"] | 0; r.overrideMs = d["o"] | -1; r.midMs = d["m"] | 0;
    JsonArray fa = d["e"];
    int k = 0;
    for (JsonVariant x : fa) { if (k < EQ_MAX_FAULTS) r.faults[k++] = x.as<int>(); }
    // Turno interrotto da un riavvio: gli istanti erano dell'accensione precedente
    if (r.state <= EQ_PAUSED) r.state = EQ_CANCELLED;
    if (r.state == EQ_FINISHED) r.state = EQ_CONFIRMED;
    if (r.id > s_lastId) s_lastId = r.id;
  }
  f.close();
}

// ── Turno ───────────────────────────────────────────────────────────────────

static EqRound *cur() { return (s_rounds && s_cur >= 0) ? &s_rounds[s_cur] : nullptr; }

static EqRound *findRound(int id) {
  for (int i = 0; i < s_nRounds; i++) if (s_rounds[i].id == id) return &s_rounds[i];
  return nullptr;
}

static void bellSound() { buzzerBeep(350, 2, 180, 2200, 160); }

static void startRound(EqRound &r, uint64_t t, bool automatic) {
  uint64_t now = nowUs();
  if (t > now) t = now;   // la partenza non può essere nel futuro
  r.tStart = t;
  r.state = EQ_RUNNING;
  if (automatic) r.flags |= F_AUTO;
  // Il tempo trascorso della console parte con il turno (come uno start)
  if (syncStatus == ELAPSED_WAITING_START) {
    temp_hh = 0; temp_mm = 0; temp_ss = 0;
    lastSyncTrigger = t;
    syncReference = t;
    handleLineSync();
  }
  changed();
}

static void finishRound(EqRound &r, uint64_t t) {
  int64_t ms = usToMs(r.tStart, t) - r.pauseMs;
  if (r.state == EQ_PAUSED) ms = usToMs(r.tStart, r.tPause) - r.pauseMs;
  r.rawMs = ms > 0 ? (uint32_t)ms : 0;
  r.state = EQ_FINISHED;
  if (r.tlMs && r.rawMs > r.tlMs) r.flags |= F_TL;
  changed();
}

// Se il turno attivo risulta eliminato mentre corre, il tempo si ferma
static void stopIfEliminated(EqRound &r) {
  if (r.state != EQ_RUNNING && r.state != EQ_PAUSED) return;
  EqResult res = computeResult(r, nowUs());
  if (res.elim || res.retired) finishRound(r, nowUs());
}

// rearm = false: assegna il cavaliere alle linee senza cambiarne lo stato di abilitazione
static void armLines(int comp, bool rearm) {
  int lines[3] = {s_course.startLine, s_course.finishLine, s_course.midLine};
  for (int k = 0; k < 3; k++) {
    int idx = lines[k] - 1;
    if (idx < 0 || idx > 3) continue;
    competitors[idx] = comp;
    if (rearm) lineEnabled[idx] = 1;
    broadcastLineUpdate(idx);
  }
  applyStartLine();
  syncStatus = ELAPSED_WAITING_START;
  syncMode = MODE_ELAPSED_TIME;
  temp_hh = 0; temp_mm = 0; temp_ss = 0;
}

// Aggiunge un turno pronto e lo rende quello attivo (nullptr se l'elenco è pieno)
static EqRound *newRound(int comp, int phase) {
  if (s_nRounds >= EQ_MAX_ROUNDS) return nullptr;
  EqRound &r = s_rounds[s_nRounds];
  memset(&r, 0, sizeof(r));
  r.id = ++s_lastId;
  r.comp = comp;
  r.phase = phase;
  r.variant = s_course.variant;
  r.state = EQ_READY;
  r.taMs = courseTaMs(phase);
  const EqVariant &v = s_var[r.variant];
  r.tlMs = v.tlFactorX100 && r.taMs ? (uint32_t)((uint64_t)r.taMs * v.tlFactorX100 / 100) : 0;
  r.overrideMs = -1;
  s_cur = s_nRounds++;
  s_lastWarnS = -1;
  return &r;
}

static const char *cmdSelect(int comp, int phase, bool force, bool rearm) {
  EqRound *c = cur();
  if (c) {
    if ((c->state == EQ_RUNNING || c->state == EQ_PAUSED) && !force) return "running";
    if (c->state == EQ_FINISHED) c->state = EQ_CONFIRMED;   // il precedente è concluso
    else if (c->state != EQ_CONFIRMED && c->state != EQ_CANCELLED) c->state = EQ_CANCELLED;
  }
  EqRound *r = newRound(comp, phase >= 1 && phase <= 2 ? phase : s_course.phase);
  if (!r) return "full";
  armLines(comp, rearm);
  changed();
  return nullptr;
}

// Reset del tempo trascorso: il cavaliere del turno attivo riparte con un turno pronto, cosi'
// la campana torna attiva senza riselezionarlo. Il turno in corso viene annullato.
static const char *cmdReset(bool rearm) {
  EqRound *c = cur();
  if (!c) return "no_round";
  int comp = c->comp, phase = c->phase;
  if (c->state == EQ_FINISHED) c->state = EQ_CONFIRMED;
  else if (c->state != EQ_CONFIRMED && c->state != EQ_CANCELLED) c->state = EQ_CANCELLED;
  EqRound *r = newRound(comp, phase);
  if (!r) return "full";
  armLines(comp, rearm);
  changed();
  return nullptr;
}

static const char *cmdBell() {
  EqRound *r = cur();
  bellSound();
  if (!r) return nullptr;
  uint64_t now = nowUs();
  const EqVariant &v = s_var[r->variant];
  if (r->state == EQ_READY && v.countdownS) {
    r->state = EQ_COUNTDOWN;
    r->tCdEnd = now + (uint64_t)v.countdownS * 1000000ULL;
    s_lastWarnS = -1;
    changed();
  } else if (r->state == EQ_RUNNING) {
    r->tPause = now;
    r->state = EQ_PAUSED;
    changed();
  } else if (r->state == EQ_PAUSED) {
    uint64_t pauseUs = now > r->tPause ? now - r->tPause : 0;
    r->pauseMs += (uint32_t)(pauseUs / 1000);
    r->state = EQ_RUNNING;
    // il tempo trascorso della console non conta la pausa
    if (syncStatus == ELAPSED_TIME_STARTED) syncReference += pauseUs;
    changed();
  }
  return nullptr;
}

// Linea intermedia. Due fasi consecutive: è l'arrivo della 1ª fase; se il
// cavaliere è netto parte subito la 2ª fase da quell'istante, altrimenti il
// turno finisce lì. Negli altri casi registra solo il tempo intermedio.
static void onMidLine(EqRound &r, uint64_t tUs) {
  const EqVariant &v = s_var[r.variant < s_nVar ? r.variant : 0];
  if (v.finalMode == 2 && v.consecutive && r.phase == 1) {
    finishRound(r, tUs);                          // fine della 1ª fase
    EqResult res = computeResult(r, tUs);
    if (res.elim || res.retired || res.totalX100 != 0) return;   // non netto: si ferma qui
    r.state = EQ_CONFIRMED;
    EqRound *p2 = newRound(r.comp, 2);
    if (!p2) return;
    // La 2ª fase riparte da zero anche sul tempo trascorso della console e dei display:
    // startRound lo riavvia solo se è in attesa di start, ma durante la 1ª fase è già partito
    syncStatus = ELAPSED_WAITING_START;
    startRound(*p2, tUs, false);
    buzzerBeep(150, 2, 120, 2600, 160);
    return;
  }
  if (!r.midMs) {
    r.midMs = rawElapsedMs(r, tUs);
    changed();
  }
}

void equestrianOnPassage(int line, uint64_t tUs, bool enabled) {
  if (!s_mtx || !enabled || !s_on) return;
  Lock lock;
  EqRound *r = cur();
  if (!r) return;
  if (line == s_course.startLine && (r->state == EQ_READY || r->state == EQ_COUNTDOWN)) {
    startRound(*r, tUs, false);
    return;
  }
  if (s_course.midLine && line == s_course.midLine && r->state == EQ_RUNNING) {
    onMidLine(*r, tUs);
    return;
  }
  if (line == s_course.finishLine && r->state == EQ_RUNNING) {
    if (s_course.startLine == s_course.finishLine && rawElapsedMs(*r, tUs) < EQ_MIN_RUN_MS) return;
    finishRound(*r, tUs);
  }
}

void equestrianClear() {
  if (!s_mtx) return;
  Lock lock;
  s_nRounds = 0;
  s_cur = -1;
  LittleFS.remove(EQ_ROUNDS_FILE);
  changed();
  s_dirty = false;
}

void equestrianBegin() {
  s_mtx = xSemaphoreCreateRecursiveMutex();
  Lock lock;
  cfgLoad();
  s_on = readIntFromSettings(EQ_ON_KEY, 0) == 1;
  if (s_on && !ensureRounds()) s_on = false;   // senza memoria per i turni le Gare restano spente
  if (s_on) loadRounds();
  applyStartLine();
}

// Accende o spegne la gara assistita; spegnendola il turno attivo si chiude
static void setEnabled(bool on) {
  if (on == s_on) return;
  if (on) {
    if (!ensureRounds()) return;   // niente memoria: restano spente (la risposta dice on = false)
    loadRounds();                  // i turni salvati tornano in RAM
  }
  s_on = on;
  writeIntToSettings(EQ_ON_KEY, on ? 1 : 0);
  EqRound *r = cur();
  if (!on && r) {
    if (r->state == EQ_FINISHED) r->state = EQ_CONFIRMED;
    else if (r->state != EQ_CONFIRMED) r->state = EQ_CANCELLED;
    s_cur = -1;
  }
  if (!on) {
    if (r || s_dirty) saveRounds();   // salva l'ultimo stato, poi la RAM torna libera
    s_dirty = false;
    freeRounds();
  }
  applyStartLine();
  changed();
  s_cfgBroadcast = true;
}

static void broadcastState() {
  JsonDocument doc;
  doc["t"] = TYPE_EQ_UPDATE;
  doc["rev"] = s_rev;
  EqRound *r = cur();
  if (r) roundToJson(*r, doc["cur"].to<JsonObject>(), nowUs());
  else doc["cur"] = nullptr;
  String out;
  serializeJson(doc, out);
  ws.textAll(out);
}

void equestrianLoop() {
  if (!s_mtx) return;
  Lock lock;
  uint64_t now = nowUs();
  EqRound *r = cur();
  if (r && r->state == EQ_COUNTDOWN) {
    const EqVariant &v = s_var[r->variant];
    // Scaduto solo quando l'istante è davvero passato: con la divisione intera
    // 0,5 ms mancanti davano già 0 e la partenza finiva nel futuro
    bool expired = now >= r->tCdEnd;
    int64_t leftMs = usToMs(now, r->tCdEnd);
    int leftS = expired ? 0 : (int)((leftMs + 999) / 1000);
    if (v.warnBeeps && leftS >= 1 && leftS <= 5 && leftS != s_lastWarnS) {
      s_lastWarnS = leftS;
      buzzerBeep(80, 1, 0, 3000, 128);
    }
    if (expired && v.autoStart) {
      startRound(*r, r->tCdEnd, true);
      buzzerBeep(600, 1, 0, 2200, 160);
    }
  }
  if (r && r->state == EQ_RUNNING && r->tlMs && rawElapsedMs(*r, now) > r->tlMs) {
    finishRound(*r, r->tStart + ((uint64_t)r->tlMs + r->pauseMs + 1) * 1000ULL);
    graveBuzz();
  }
  if (s_cfgSave) { s_cfgSave = false; cfgSave(); }
  if (s_dirty && (uint32_t)(millis() - s_lastChangeMs) > EQ_SAVE_DELAY_MS) {
    s_dirty = false;
    saveRounds();
  }
  bool periodic = r && (r->state == EQ_COUNTDOWN || r->state == EQ_RUNNING) &&
                  (uint32_t)(millis() - s_lastPeriodicMs) >= EQ_PERIODIC_MS;
  if (s_broadcast || periodic) {
    s_broadcast = false;
    s_lastPeriodicMs = millis();
    broadcastState();
  }
  if (s_cfgBroadcast) {
    s_cfgBroadcast = false;
    ws.textAll(String("{\"t\":") + TYPE_EQ_CONFIG + "}");
  }
}

// ── Route ───────────────────────────────────────────────────────────────────

static int intParam(AsyncWebServerRequest *req, const char *name, int def) {
  return req->hasParam(name) ? req->getParam(name)->value().toInt() : def;
}

void equestrianRegisterRoutes(AsyncWebServer &server) {
  // Stato completo: regolamento, dati della gara, turno attivo e tutti i turni
  server.on("/eq", HTTP_GET, [](AsyncWebServerRequest *request) {
    AsyncResponseStream *resp = request->beginResponseStream("application/json");
    Lock lock;
    uint64_t now = nowUs();
    {
      JsonDocument cfg;
      cfgToJson(cfg);
      cfg["on"] = s_on;
    cfg["rev"] = s_rev;
      cfg["cur"] = s_cur >= 0 ? s_rounds[s_cur].id : 0;
      cfg["taMs"] = courseTaMs(1);
      cfg["taMs2"] = courseTaMs(2);
      String head;
      serializeJson(cfg, head);
      head.remove(head.length() - 1);   // via la "}" finale: segue "rounds"
      resp->print(head);
    }
    resp->print(",\"rounds\":[");
    for (int i = 0; i < s_nRounds; i++) {
      JsonDocument d;
      roundToJson(s_rounds[i], d.to<JsonObject>(), now);
      if (i) resp->print(",");
      serializeJson(d, *resp);
    }
    resp->print("]}");
    request->send(resp);
  });

  // Comandi del turno: c = select|reset|bell|start|finish|fault|status|confirm|cancel|time|phase
  server.on("/eqCmd", HTTP_GET, [](AsyncWebServerRequest *request) {
    String c = request->hasParam("c") ? request->getParam("c")->value() : "";
    const char *err = nullptr;
    {
      Lock lock;
      EqRound *r = request->hasParam("id") ? findRound(intParam(request, "id", 0)) : cur();
      uint64_t now = nowUs();
      if (!s_on) {
        err = "off";
      } else if (c == "select") {
        err = cmdSelect(intParam(request, "comp", 0), intParam(request, "phase", 0), intParam(request, "force", 0) == 1,
                        intParam(request, "rearm", 1) != 0);
      } else if (c == "reset") {
        err = cmdReset(intParam(request, "rearm", 1) != 0);
      } else if (c == "bell") {
        err = cmdBell();
      } else if (!r) {
        err = "no_round";
      } else if (c == "start") {
        if (r->state == EQ_READY || r->state == EQ_COUNTDOWN) startRound(*r, now, false); else err = "state";
      } else if (c == "finish") {
        if (r->state == EQ_RUNNING || r->state == EQ_PAUSED) finishRound(*r, now); else err = "state";
      } else if (c == "fault") {
        int k = intParam(request, "k", -1), d = intParam(request, "d", 1);
        if (k < 0 || k >= s_var[r->variant].nFaults || r->state == EQ_CANCELLED) err = "fault";
        else {
          r->faults[k] = (uint8_t)constrain((int)r->faults[k] + d, 0, 99);
          changed();
          stopIfEliminated(*r);
        }
      } else if (c == "status") {
        String s = request->hasParam("s") ? request->getParam("s")->value() : "";
        r->flags &= ~(F_ELIM | F_RET | F_TL);
        if (s == "elim") r->flags |= F_ELIM;
        else if (s == "ret") r->flags |= F_RET;
        changed();
        stopIfEliminated(*r);
      } else if (c == "confirm") {
        if (r->state == EQ_FINISHED) { r->state = EQ_CONFIRMED; changed(); } else err = "state";
      } else if (c == "cancel") {
        r->state = EQ_CANCELLED;
        if (cur() == r) s_cur = -1;
        changed();
      } else if (c == "time") {
        r->overrideMs = intParam(request, "ms", -1);
        if (r->overrideMs < -1) r->overrideMs = -1;
        changed();
      } else if (c == "phase") {
        r->phase = constrain(intParam(request, "p", 1), 1, 2);
        changed();
      } else {
        err = "cmd";
      }
    }
    if (err) request->send(400, "application/json", String("{\"ok\":false,\"error\":\"") + err + "\"}");
    else request->send(200, "application/json", "{\"ok\":true}");
    wifiRxActivity();
  });

  // Gara assistita: on=1 accende, on=0 spegne; senza parametri lo stato attuale
  server.on("/eqEnable", HTTP_GET, [](AsyncWebServerRequest *request) {
    bool on;
    {
      Lock lock;
      if (request->hasParam("on")) setEnabled(intParam(request, "on", 0) == 1);
      on = s_on;
    }
    request->send(200, "application/json", String("{\"on\":") + (on ? "true" : "false") + "}");
    wifiRxActivity();
  });

  // Regolamento e dati della gara: GET = attuali (?reset=1 = predefiniti), POST = salva
  server.on("/eqConfig", HTTP_GET, [](AsyncWebServerRequest *request) {
    Lock lock;
    if (intParam(request, "reset", 0) == 1) {
      loadDefaults();
      s_cfgSave = true;
      s_cfgBroadcast = true;
      applyStartLine();
    }
    JsonDocument doc;
    cfgToJson(doc);
    String out;
    serializeJson(doc, out);
    request->send(200, "application/json", out);
  });

  server.on("/eqConfig", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
      static String body;
      if (index == 0) body = "";
      for (size_t i = 0; i < len; i++) body += (char)data[i];
      if (index + len < total) return;
      JsonDocument doc;
      bool ok = !deserializeJson(doc, body);
      if (ok) {
        Lock lock;
        ok = cfgFromJson(doc.as<JsonVariantConst>());
        if (ok) {
          s_cfgSave = true;
          s_cfgBroadcast = true;
          applyStartLine();
        }
      }
      body = "";
      if (ok) request->send(200, "application/json", "{\"ok\":true}");
      else request->send(400, "application/json", "{\"ok\":false,\"error\":\"config\"}");
      wifiRxActivity();
    });
}
