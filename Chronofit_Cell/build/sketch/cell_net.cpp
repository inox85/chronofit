#line 1 "C:\\src\\chronofit\\Chronofit_Cell\\cell_net.cpp"
#include "cell_net.h"
#include "cell_config.h"
#include "settings.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "esp_wifi.h"
#include "esp_timer.h"

String chipIdStr = "";

// ── Configurazione letta all'avvio (la modifica da UI riavvia il device) ────
static String s_baseSsid, s_basePass, s_baseHost, s_baseToken;
static int    s_line = 1;

// ── Coda eventi ─────────────────────────────────────────────────────────────
struct CellEvent {
  uint64_t localUs;
  uint32_t seq;
  uint32_t nextTryMs;
};
static CellEvent s_queue[CELL_QUEUE_SIZE];
static int       s_qCount = 0;
static uint32_t  s_seq = 0;
static SemaphoreHandle_t s_mutex = nullptr;
static TaskHandle_t      s_task = nullptr;

// ── Statistiche ─────────────────────────────────────────────────────────────
static uint32_t s_sent = 0, s_dups = 0, s_rejected = 0, s_dropped = 0;
static char     s_lastError[96] = "";
static uint32_t s_lastErrorMs = 0;
static bool     s_hasError = false;

// ── Stima offset di clock ───────────────────────────────────────────────────
struct SyncSample { int64_t offsetUs; uint32_t rttUs; uint32_t atMs; };
static SyncSample s_win[CELL_SYNC_SAMPLES];
static int        s_winCount = 0;
static int        s_winNext = 0;
static volatile int64_t  s_offsetUs = 0;
static volatile uint32_t s_bestRttUs = 0;
static volatile uint32_t s_bestAtMs = 0;
static volatile uint32_t s_lastOkMs = 0;
static volatile bool     s_haveOffset = false;

String cellApSsid() { return "ChronofitCell_" + chipIdStr; }

static void setLastError(const char *msg) {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  strlcpy(s_lastError, msg, sizeof(s_lastError));
  s_lastErrorMs = millis();
  s_hasError = true;
  xSemaphoreGive(s_mutex);
}

static bool syncIsValid() {
  return s_haveOffset && (uint32_t)(millis() - s_lastOkMs) <= CELL_SYNC_VALID_MS;
}

// Una richiesta /clockSync: aggiorna la finestra e sceglie il campione a RTT minimo.
static bool doSync(HTTPClient &http) {
  // Oltre a misurare il clock, la richiesta è il "battito" con cui il base sa
  // che questa cella esiste, a che linea è associata e quanto è buono il link.
  char path[160];
  snprintf(path, sizeof(path), "/clockSync?cell=%s&line=%d&rssi=%d&rtt=%lu&fw=%s",
           chipIdStr.c_str(), s_line, WiFi.RSSI(), (unsigned long)s_bestRttUs, CELL_FW_VERSION);
  http.begin(s_baseHost, 80, path);
  uint64_t t0 = (uint64_t)esp_timer_get_time();
  int code = http.GET();
  uint64_t t2 = (uint64_t)esp_timer_get_time();
  if (code != 200) {
    char msg[64];
    snprintf(msg, sizeof(msg), "clockSync: %s", code > 0 ? String(code).c_str() : HTTPClient::errorToString(code).c_str());
    setLastError(msg);
    http.end();
    return false;
  }
  String body = http.getString();
  http.end();
  uint64_t baseUs = strtoull(body.c_str(), nullptr, 10);
  if (baseUs == 0) return false;

  SyncSample smp;
  smp.rttUs = (uint32_t)(t2 - t0);
  smp.offsetUs = (int64_t)baseUs - (int64_t)((t0 + t2) / 2);
  smp.atMs = millis();

  s_win[s_winNext] = smp;
  s_winNext = (s_winNext + 1) % CELL_SYNC_SAMPLES;
  if (s_winCount < CELL_SYNC_SAMPLES) s_winCount++;

  int best = 0;
  for (int i = 1; i < s_winCount; i++) if (s_win[i].rttUs < s_win[best].rttUs) best = i;
  s_offsetUs = s_win[best].offsetUs;
  s_bestRttUs = s_win[best].rttUs;
  s_bestAtMs = s_win[best].atMs;
  s_lastOkMs = smp.atMs;
  s_haveOffset = true;
  return true;
}

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
  }
  if (s_qCount > 0 && (int32_t)(nowMs - s_queue[0].nextTryMs) >= 0) {
    out = s_queue[0];
    found = true;
  }
  xSemaphoreGive(s_mutex);
  return found;
}

static void popHead() {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  if (s_qCount > 0) {
    memmove(&s_queue[0], &s_queue[1], sizeof(CellEvent) * (s_qCount - 1));
    s_qCount--;
  }
  xSemaphoreGive(s_mutex);
}

static void delayHead(uint32_t ms) {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  if (s_qCount > 0) s_queue[0].nextTryMs = millis() + ms;
  xSemaphoreGive(s_mutex);
}

static void sendEvent(HTTPClient &http, const CellEvent &ev) {
  // Conversione nel clock del base col miglior offset disponibile ADESSO.
  uint64_t tBase = (uint64_t)((int64_t)ev.localUs + s_offsetUs);
  char path[160];
  snprintf(path, sizeof(path), "/remoteCheckpoint?lineNumber=%d&t=%llu&seq=%lu&cell=%s",
           s_line, (unsigned long long)tBase, (unsigned long)ev.seq, chipIdStr.c_str());

  http.begin(s_baseHost, 80, path);
  if (s_baseToken.length()) http.addHeader("X-Token", s_baseToken);
  int code = http.GET();
  String body = (code > 0) ? http.getString() : String();
  http.end();

  if (code == 200) {
    popHead();
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    if (body.startsWith("DUP")) s_dups++; else s_sent++;
    xSemaphoreGive(s_mutex);
  } else if (code == 400) {
    // Evento rifiutato dal base (timestamp fuori finestra / linea non valida):
    // riprovare non serve.
    popHead();
    char msg[96];
    snprintf(msg, sizeof(msg), "base 400: %s", body.c_str());
    setLastError(msg);
    xSemaphoreTake(s_mutex, portMAX_DELAY);
    s_rejected++;
    xSemaphoreGive(s_mutex);
    s_lastOkMs = 0;  // forza un nuovo sync
  } else if (code == 401) {
    setLastError("base 401: token non valido");
    delayHead(3000);
  } else {
    char msg[96];
    snprintf(msg, sizeof(msg), "invio: %s", code > 0 ? String(code).c_str() : HTTPClient::errorToString(code).c_str());
    setLastError(msg);
    delayHead(300);
    s_lastOkMs = 0;  // la connessione potrebbe essere caduta: risincronizza
  }
}

static void netTask(void *) {
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(800);
  http.setTimeout(1000);

  bool wasConnected = false;
  uint32_t lastWifiTry = 0;
  uint32_t lastSyncMs = 0;
  int burst = 0;

  for (;;) {
    if (WiFi.status() != WL_CONNECTED) {
      wasConnected = false;
      if (s_baseSsid.length() && (uint32_t)(millis() - lastWifiTry) > 5000) {
        lastWifiTry = millis();
        WiFi.disconnect(false, false);
        WiFi.begin(s_baseSsid.c_str(), s_basePass.c_str());
      }
      vTaskDelay(pdMS_TO_TICKS(200));
      continue;
    }
    if (!wasConnected) {
      wasConnected = true;
      burst = CELL_SYNC_SAMPLES;   // raffica iniziale per stimare subito l'offset
      s_winCount = 0; s_winNext = 0; s_haveOffset = false;
    }

    CellEvent ev;
    if (peekDue(ev)) {
      if (!syncIsValid()) {
        doSync(http);
        if (!syncIsValid()) { vTaskDelay(pdMS_TO_TICKS(50)); continue; }
      }
      sendEvent(http, ev);
      continue;
    }

    uint32_t nowMs = millis();
    if (burst > 0 || (uint32_t)(nowMs - lastSyncMs) >= CELL_SYNC_PERIOD_MS) {
      doSync(http);
      lastSyncMs = millis();
      if (burst > 0) burst--;
      vTaskDelay(pdMS_TO_TICKS(burst > 0 ? 30 : 1));
    } else {
      // Dorme finché non arriva un evento (notifica) o scade il timeout.
      ulTaskNotifyTake(pdTRUE, pdMS_TO_TICKS(20));
    }
  }
}

void cellEnqueueEvent(uint64_t localUs) {
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  if (s_qCount >= CELL_QUEUE_SIZE) {
    memmove(&s_queue[0], &s_queue[1], sizeof(CellEvent) * (CELL_QUEUE_SIZE - 1));
    s_qCount--;
    s_dropped++;
  }
  s_seq++;
  if (s_seq == 0) s_seq = 1;
  s_queue[s_qCount++] = { localUs, s_seq, 0 };
  xSemaphoreGive(s_mutex);
  if (s_task) xTaskNotifyGive(s_task);
}

void cellNetBegin() {
  s_mutex = xSemaphoreCreateMutex();

  uint64_t chipId = ESP.getEfuseMac();
  chipIdStr = String((uint32_t)(chipId >> 32), HEX) + String((uint32_t)chipId, HEX);

  s_baseSsid  = readStringFromSettings("base_ssid", "");
  s_basePass  = readStringFromSettings("base_pass", "");
  s_baseHost  = readStringFromSettings("base_host", CELL_DEFAULT_BASE_HOST);
  s_baseToken = readStringFromSettings("base_token", "");
  s_line      = readIntFromSettings("cell_line", 1);
  if (s_line < 1 || s_line > 4) s_line = 1;
  if (s_baseHost.isEmpty()) s_baseHost = CELL_DEFAULT_BASE_HOST;

  // Evita che dopo un riavvio la cella riparta da seq=1 (il base scarterebbe
  // come DUP un seq uguale all'ultimo visto): parte da un valore casuale.
  s_seq = esp_random() | 1;

  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.setHostname(("chronofit-cell-" + chipIdStr).c_str());
  WiFi.softAPConfig(IPAddress(CELL_AP_IP), IPAddress(CELL_AP_GATEWAY), IPAddress(CELL_AP_SUBNET));

  String apPwd = readStringFromSettings("ap_password", chipIdStr);
  if (apPwd.length() < 8) apPwd = chipIdStr;
  WiFi.softAP(cellApSsid().c_str(), apPwd.c_str(), CELL_AP_CHANNEL, false, 4);

  // Niente power-save: altrimenti latenza e jitter schizzano di 100+ ms.
  WiFi.setSleep(false);
  esp_wifi_set_ps(WIFI_PS_NONE);
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  WiFi.setAutoReconnect(true);

  if (s_baseSsid.length()) WiFi.begin(s_baseSsid.c_str(), s_basePass.c_str());

  xTaskCreatePinnedToCore(netTask, "cellNet", 8192, nullptr, 2, &s_task, 1);
}

CellNetStatus cellNetStatus() {
  CellNetStatus st;
  st.ssidConfigured = s_baseSsid.length() > 0;
  st.staConnected = (WiFi.status() == WL_CONNECTED);
  st.rssi = st.staConnected ? WiFi.RSSI() : 0;
  st.staIp = st.staConnected ? WiFi.localIP().toString() : String("");
  st.syncValid = syncIsValid();
  st.offsetUs = s_offsetUs;
  st.rttUs = s_bestRttUs;
  st.syncAgeMs = s_haveOffset ? (uint32_t)(millis() - s_bestAtMs) : 0;
  st.syncSamples = s_winCount;
  xSemaphoreTake(s_mutex, portMAX_DELAY);
  st.sent = s_sent; st.duplicates = s_dups; st.rejected = s_rejected; st.dropped = s_dropped;
  st.pending = s_qCount;
  st.lastError = String(s_lastError);
  st.lastErrorAgeMs = s_hasError ? (uint32_t)(millis() - s_lastErrorMs) : UINT32_MAX;
  xSemaphoreGive(s_mutex);
  return st;
}
