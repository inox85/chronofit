#line 1 "C:\\src\\chronofit\\Chronofit_Cell\\cell_routes.cpp"
#include "cell_routes.h"
#include "cell_net.h"
#include "cell_sensor.h"
#include "cell_feedback.h"
#include "cell_config.h"
#include "settings.h"
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <Update.h>
#include <WiFi.h>
#include "esp_timer.h"

AsyncWebServer server(80);
volatile bool shouldRestart = false;

// Come sul base: se in NVS non c'è nessun token tutto passa; altrimenti serve
// ?token= oppure l'header X-Token. Invia lui il 401.
static bool isAuthorized(AsyncWebServerRequest *request) {
  String token = readStringFromSettings("api_token", "");
  if (token.isEmpty()) return true;
  if (request->hasParam("token") && request->getParam("token")->value() == token) return true;
  if (request->hasHeader("X-Token") && request->header("X-Token") == token) return true;
  request->send(401, "text/plain", "Unauthorized");
  return false;
}

static String paramOr(AsyncWebServerRequest *request, const char *name, const String &def) {
  return request->hasParam(name) ? request->getParam(name)->value() : def;
}

void cellRoutesBegin() {

  // ── Stato live ────────────────────────────────────────────────────────────
  server.on("/cellStatus", HTTP_GET, [](AsyncWebServerRequest *request) {
    CellNetStatus st = cellNetStatus();
    JsonDocument doc;
    doc["fw"]       = CELL_FW_VERSION;
    doc["chipId"]   = chipIdStr;
    doc["apSsid"]   = cellApSsid();
    doc["apClients"] = WiFi.softAPgetStationNum();
    doc["uptimeS"]  = (uint32_t)(millis() / 1000);
    doc["line"]     = readIntFromSettings("cell_line", 1);

    JsonObject sta = doc["sta"].to<JsonObject>();
    sta["connected"] = st.staConnected;
    sta["ssid"]      = readStringFromSettings("base_ssid", "");
    sta["ip"]        = st.staIp;
    sta["rssi"]      = st.rssi;

    JsonObject sync = doc["sync"].to<JsonObject>();
    sync["valid"]   = st.syncValid;
    sync["offsetUs"] = (int64_t)st.offsetUs;
    sync["rttUs"]   = st.rttUs;
    sync["ageMs"]   = st.syncAgeMs;
    sync["samples"] = st.syncSamples;

    doc["inputActive"] = cellSensorActive();
    doc["lockedOut"]   = cellSensorLockedOutCount();

    JsonObject ev = doc["events"].to<JsonObject>();
    ev["sent"] = st.sent; ev["duplicates"] = st.duplicates;
    ev["rejected"] = st.rejected; ev["dropped"] = st.dropped; ev["pending"] = st.pending;
    doc["lastError"] = st.lastError;

    String json;
    serializeJson(doc, json);
    request->send(200, "application/json", json);
  });

  // ── Configurazione (le password non vengono mai restituite) ───────────────
  server.on("/cellSettings", HTTP_GET, [](AsyncWebServerRequest *request) {
    JsonDocument doc;
    doc["baseSsid"]     = readStringFromSettings("base_ssid", "");
    doc["baseHost"]     = readStringFromSettings("base_host", CELL_DEFAULT_BASE_HOST);
    doc["hasBasePass"]  = !readStringFromSettings("base_pass", "").isEmpty();
    doc["hasBaseToken"] = !readStringFromSettings("base_token", "").isEmpty();
    doc["line"]         = readIntFromSettings("cell_line", 1);
    doc["input"]        = readIntFromSettings("cell_pin", 1);
    doc["lockoutMs"]    = readIntFromSettings("lockout_ms", 200);
    doc["buzzer"]       = readIntFromSettings("cell_buzzer", 1);
    doc["apSsid"]       = cellApSsid();
    doc["authRequired"] = !readStringFromSettings("api_token", "").isEmpty();
    String json;
    serializeJson(doc, json);
    request->send(200, "application/json", json);
  });

  // 🔒 Salva e riavvia. Ogni parametro è opzionale; password/token vuoti
  // vengono ignorati (per cancellarli: clearBasePass=1 / clearBaseToken=1).
  server.on("/cellSave", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;

    if (request->hasParam("baseSsid")) writeStringToSettings("base_ssid", paramOr(request, "baseSsid", ""));
    String pass = paramOr(request, "basePass", "");
    if (!pass.isEmpty()) writeStringToSettings("base_pass", pass);
    if (paramOr(request, "clearBasePass", "0") == "1") writeStringToSettings("base_pass", "");

    String host = paramOr(request, "baseHost", "");
    if (request->hasParam("baseHost")) writeStringToSettings("base_host", host.isEmpty() ? String(CELL_DEFAULT_BASE_HOST) : host);

    String btok = paramOr(request, "baseToken", "");
    if (!btok.isEmpty()) writeStringToSettings("base_token", btok);
    if (paramOr(request, "clearBaseToken", "0") == "1") writeStringToSettings("base_token", "");

    if (request->hasParam("line")) {
      int v = paramOr(request, "line", "1").toInt();
      if (v >= 1 && v <= 4) writeIntToSettings("cell_line", v);
    }
    if (request->hasParam("input")) {
      int v = paramOr(request, "input", "1").toInt();
      if (v >= 1 && v <= 4) writeIntToSettings("cell_pin", v);
    }
    if (request->hasParam("lockoutMs")) {
      int v = paramOr(request, "lockoutMs", "200").toInt();
      if (v >= 0 && v <= 60000) writeIntToSettings("lockout_ms", v);
    }
    if (request->hasParam("buzzer")) {
      writeIntToSettings("cell_buzzer", paramOr(request, "buzzer", "1").toInt() ? 1 : 0);
    }

    String apPwd = paramOr(request, "apPassword", "");
    if (apPwd.length() >= 8) writeStringToSettings("ap_password", apPwd);

    // Token API di questa cella: impostarlo protegge subito tutte le route 🔒.
    String apiTok = paramOr(request, "apiToken", "");
    if (!apiTok.isEmpty()) writeStringToSettings("api_token", apiTok);
    if (paramOr(request, "clearApiToken", "0") == "1") writeStringToSettings("api_token", "");

    request->send(200, "text/plain", "OK - Riavvio...");
    shouldRestart = true;
  });

  // ── Scansione reti (asincrona: richiamare finché scanning=false) ──────────
  server.on("/wifiScan", HTTP_GET, [](AsyncWebServerRequest *request) {
    int n = WiFi.scanComplete();
    JsonDocument doc;
    if (n == WIFI_SCAN_FAILED) {
      WiFi.scanNetworks(true);
      doc["scanning"] = true;
    } else if (n == WIFI_SCAN_RUNNING) {
      doc["scanning"] = true;
    } else {
      doc["scanning"] = false;
      JsonArray arr = doc["networks"].to<JsonArray>();
      for (int i = 0; i < n; i++) {
        JsonObject o = arr.add<JsonObject>();
        o["ssid"] = WiFi.SSID(i);
        o["rssi"] = WiFi.RSSI(i);
        o["channel"] = WiFi.channel(i);
      }
      WiFi.scanDelete();
    }
    String json;
    serializeJson(doc, json);
    request->send(200, "application/json", json);
  });

  // 🔒 Inietta un fronte di test come se il sensore fosse scattato ora.
  server.on("/cellTest", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    cellEnqueueEvent((uint64_t)esp_timer_get_time());
    cellFeedbackTrigger();
    request->send(200, "text/plain", "OK");
  });

  server.on("/reboot", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    request->send(200, "text/plain", "OK - Riavvio...");
    shouldRestart = true;
  });

  // ── OTA firmware / filesystem (stessi percorsi del base) ──────────────────
  server.on("/updatefs", HTTP_POST,
    [](AsyncWebServerRequest *request) {
      bool ok = !Update.hasError();
      AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", ok ? "OK - Riavvio..." : "ERRORE");
      response->addHeader("Connection", "close");
      request->send(response);
      if (ok) shouldRestart = true;
    },
    [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
      if (!index) {
        if (!isAuthorized(request)) return;
        Update.begin(UPDATE_SIZE_UNKNOWN, U_SPIFFS);
      }
      Update.write(data, len);
      if (final) Update.end(true);
    });

  server.on("/update", HTTP_POST,
    [](AsyncWebServerRequest *request) {
      bool ok = !Update.hasError();
      AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", ok ? "OK - Riavvio..." : "ERRORE");
      response->addHeader("Connection", "close");
      request->send(response);
      if (ok) shouldRestart = true;
    },
    [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final) {
      if (!index) {
        if (!isAuthorized(request)) return;
        Update.begin();
      }
      Update.write(data, len);
      if (final) Update.end(true);
    });

  // UI statica da LittleFS. no-cache: dopo un aggiornamento del filesystem il
  // browser non deve restare agganciato a una versione vecchia della UI.
  server.serveStatic("/", LittleFS, "/").setDefaultFile("index.html").setCacheControl("no-cache");

  server.onNotFound([](AsyncWebServerRequest *request) {
    request->send(404, "text/plain", "Not found");
  });

  server.begin();
}
