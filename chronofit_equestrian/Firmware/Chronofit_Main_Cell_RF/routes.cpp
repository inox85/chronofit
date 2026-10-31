#include "routes.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "globals.h"
#include <TimeLib.h>  // oppure #include <Time.h> se usi quella versione
#include "params.h"
#include "time_utils.h"
#include "debug.h"
#include <Update.h>
#include "buzzer.h"
#include "settings.h"
#include "license.h"
#include "equestrian.h"
#include <esp_system.h>
#include "diagnostic.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "FS.h"
#include <WiFiClientSecure.h>
#include <NetworkClientSecure.h>
#include <base64.h>
#include "esp_wifi.h"
#include <time.h>
#include "cells.h"
#include "main_radio.h"
#include "local_inputs.h"
#include "power.h"
#include "battery_runtime.h"
#include "battery_curve.h"



AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void activateAccessPoint(){
   // Imposta un IP statico per l’AP
  IPAddress local_IP(192, 168, 10, 1);
  IPAddress gateway(192, 168, 10, 1);
  IPAddress subnet(255, 255, 255, 0);

  if (!WiFi.softAPConfig(local_IP, gateway, subnet)) {
    debug("❌ Errore nella configurazione dell'IP statico");
  }

  uint64_t chipId = ESP.getEfuseMac();
  // Converti il chipId in una stringa esadecimale
  chipIdStr = String((uint32_t)(chipId >> 32), HEX) + String((uint32_t)chipId, HEX);

  // Crea l'SSID con il chipId
  String ssid_sn = String(ssid) + "_" + chipIdStr; 

  String apPwd = readStringFromSettings("ap_password", "");
  if (apPwd.isEmpty()) apPwd = chipIdStr;
  WiFi.softAP(ssid_sn.c_str(), apPwd.c_str(), 6, false, 10);

  esp_wifi_set_ps(WIFI_PS_NONE);

  #ifdef DEBUG
    Serial.println("Access Point avviato");
    Serial.print("IP: ");
    Serial.println(WiFi.softAPIP());
  #endif

  // dnsServer.start(DNS_PORT, "*", WiFi.softAPIP()); // captive portal disabilitato

  registerRoutes(server, ws);

  server.begin();
}

void wifiRxActivity() { lastRxTime = millis(); }

void wifiTxActivity() { lastTxTime = millis(); }

void broadcastLineUpdate(int idx);

// bool postSessionJson(const char* url, const char* filePath) {

//   // Controllo esistenza file
//   if (!LittleFS.exists(filePath)) {
//     Serial.println("❌ File non trovato: " + String(filePath));
//     return false;
//   }

//   // Apro il file in lettura
//   File file = LittleFS.open(filePath, "r");
//   if (!file) {
//     Serial.println("❌ Errore apertura file");
//     return false;
//   }

//   // Creo HTTP client
//   HTTPClient http;
//   http.begin(url);
//   http.addHeader("Content-Type", "application/json"); // JSON

//   // POST leggendo il file direttamente come payload
//   int httpResponseCode = http.sendRequest("POST", &file, file.size());

//   file.close(); // chiudo file

//   if (httpResponseCode > 0) {
//     Serial.print("✅ POST OK, HTTP code: ");
//     Serial.println(httpResponseCode);
//     Serial.println(http.getString()); // risposta server
//     http.end();
//     return true;
//   } else {
//     Serial.print("❌ POST fallita: ");
//     Serial.println(http.errorToString(httpResponseCode));
//     http.end();
//     return false;
//   }
// }

// ── Connessione WiFi con retry infinito ───────────────────────
// // Dopo — con valore di default
// bool connectToWiFi(const char* ssid, const char* password, uint32_t timeoutMs) {

//   writeStringToSettings("wifi_ssid", String(ssid));
//   writeStringToSettings("wifi_pass", String(password));

//   // Registra l'evento UNA SOLA VOLTA con flag statico
//   static bool eventRegistered = false;
//   if (!eventRegistered) {
//     WiFi.onEvent([](WiFiEvent_t event) {
//       if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
//         Serial.println("Connesso! IP: " + WiFi.localIP().toString());
//         String msgJson = serializeMessage("WiFi connected with IP address");
//         ws.textAll(msgJson);
//       }
//       if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
//         Serial.println("WiFi disconnesso, riconnessione...");
//         WiFi.reconnect();
//       }
//     });
//     eventRegistered = true;
//   }

//   // Disconnetti prima di riconnetterti
//   WiFi.disconnect(true);
//   delay(100);
//   WiFi.mode(WIFI_STA);
//   WiFi.begin(ssid, password);
//   Serial.println("Connessione a " + String(ssid) + " in corso...");

//   static bool taskCreated = false;
//   if (!taskCreated) {
//     xTaskCreatePinnedToCore(
//       internetCheckTask,
//       "InternetCheck",
//       4096,
//       NULL,
//       1,
//       NULL,
//       0
//     );
//     taskCreated = true;
//   }

//   return true;
// }

static uint8_t reconnectAttempts = 0;
static const uint8_t MAX_ATTEMPTS = 5;

// ── Connessione come station ─────────────────────────────────────────────────
// Le operazioni sul WiFi (cambio modalità, begin, reconnect) girano solo nel
// loop(), in wifiLoop(): l'handler HTTP di /wifiConnect e l'evento di
// disconnessione si limitano a prenotarle. Eseguite nel task async_tcp (con
// delay) o da un timer FreeRTOS bloccavano il server web e la rete della Main
// restava inutilizzabile fino al riavvio.
static bool     s_wifiConnectPending = false;
static uint32_t s_wifiConnectAtMs = 0;    // istante in cui eseguire il begin()
static char     s_pendingSsid[64];
static char     s_pendingPw[64];
static uint32_t s_wifiRetryAtMs = 0;      // 0 = nessun nuovo tentativo in attesa
static uint32_t s_lastPsCheckMs = 0;

static void scheduleWifiRetry(uint32_t backoffMs) {
  uint32_t at = millis() + backoffMs;
  s_wifiRetryAtMs = at ? at : 1;
}

// Con la STA attiva il core Arduino rimette il risparmio energetico (modem
// sleep): la rete della Main perde pacchetti e console e WebSocket vanno in
// timeout. Va tenuto spento anche dopo scansioni e cambi di modalità.
static void wifiNoPowerSave() {
  wifi_ps_type_t ps;
  if (esp_wifi_get_ps(&ps) == ESP_OK && ps != WIFI_PS_NONE) {
    esp_wifi_set_ps(WIFI_PS_NONE);
  }
}

static void registerWifiEvents() {
  static bool eventRegistered = false;
  if (eventRegistered) return;
  eventRegistered = true;
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {

    switch (event) {

      case ARDUINO_EVENT_WIFI_STA_CONNECTED:
        Serial.println("WiFi: associato all'AP");
        break;

      case ARDUINO_EVENT_WIFI_STA_GOT_IP:
        reconnectAttempts = 0;
        wifiReconnecting = false;
        s_wifiRetryAtMs = 0;
        esp_wifi_set_ps(WIFI_PS_NONE);
        Serial.printf("WiFi: connesso, IP: %s, canale %d\n", WiFi.localIP().toString().c_str(), WiFi.channel());
        ws.textAll(serializeMessage("✅ WiFi connected with IP address"));
#if __has_include("main_radio.h")
        // La radio delle Cell usa il canale NRF24 80 (2,480 GHz): i canali WiFi
        // 12 e 13 (2,467/2,472 GHz, larghi 22 MHz) ci si sovrappongono. La rete
        // della Main segue il canale del router, quindi lo disturba.
        if (WiFi.channel() >= 12) {
          Serial.printf("⚠️ WiFi: canale %d vicino alla radio delle Cell\n", WiFi.channel());
          ws.textAll(serializeMessage("⚠️ WiFi canale " + String(WiFi.channel()) +
                                      ": può disturbare la radio delle Cell. Imposta il router su un canale da 1 a 11."));
        }
#endif
        break;

      case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
        uint8_t reason = info.wifi_sta_disconnected.reason;
        Serial.printf("❌ WiFi: disconnesso, reason=%d\n", reason);

        switch (reason) {
          case WIFI_REASON_ASSOC_LEAVE:
            // Disconnessione volontaria (WiFi.begin() su nuova rete): ignora
            break;

          case WIFI_REASON_AUTH_EXPIRE:
          case WIFI_REASON_AUTH_FAIL:
          case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
            // Credenziali sbagliate: ferma sempre
            if (!wifiReconnecting) {
              WiFi.setAutoReconnect(false);
              s_wifiRetryAtMs = 0;
              Serial.println("❌ WiFi: credenziali errate");
              StaticJsonDocument<128> errDoc;
              errDoc["t"] = TYPE_WIFI_ERROR;
              errDoc["msg"] = "Wrong credentials";
              char errJson[128];
              serializeJson(errDoc, errJson, sizeof(errJson));
              ws.textAll(errJson);
            }
            break;

          case WIFI_REASON_NO_AP_FOUND:
            if (reconnectAttempts == 0 && !wifiReconnecting) {
              // Primo tentativo: AP proprio non esiste
              WiFi.setAutoReconnect(false);
              s_wifiRetryAtMs = 0;
              Serial.println("❌ WiFi: rete non trovata");
              StaticJsonDocument<128> errDoc;
              errDoc["t"] = TYPE_WIFI_ERROR;
              errDoc["msg"] = "Network not found";
              char errJson[128];
              serializeJson(errDoc, errJson, sizeof(errJson));
              ws.textAll(errJson);
            } else {
              // Durante reconnect: AP temporaneamente assente, riprova
              goto retry;
            }
            break;

          default:
          retry:
            // Retry infiniti con backoff cappato a 30 s, eseguiti da wifiLoop()
            reconnectAttempts++;
            wifiReconnecting = true;
            startAttemptTime = millis();
            {
              uint32_t backoff = min((uint32_t)(2000 * reconnectAttempts), (uint32_t)30000);
              Serial.printf("🔄 WiFi: tentativo %d (backoff %lums)...\n", reconnectAttempts, (unsigned long)backoff);
              scheduleWifiRetry(backoff);
            }
            break;
        }
        break;
      }

      case ARDUINO_EVENT_WIFI_STA_LOST_IP:
        Serial.println("WiFi: IP perso");
        ws.textAll(serializeMessage("WiFi IP lost"));
        break;

      default:
        break;
    }
  });
}

// Prenota la connessione (eseguita da wifiLoop()) e la ricorda per l'avvio.
bool connectToWiFi(const char* ssid, const char* password, uint32_t timeoutMs) {
  strlcpy(s_pendingSsid, ssid ? ssid : "", sizeof(s_pendingSsid));
  strlcpy(s_pendingPw, password ? password : "", sizeof(s_pendingPw));
  reconnectAttempts = 0;
  wifiReconnecting = false;
  s_wifiRetryAtMs = 0;
  startAttemptTime = millis();   // la console mostra "connessione in corso"
  s_wifiConnectPending = true;
  s_wifiConnectAtMs = 0;
  writeIntToSettings("sta_auto", 1);
  return true;
}

// Disconnessione voluta dall'utente: niente nuovi tentativi né riconnessione all'avvio.
void wifiStopStation() {
  s_wifiConnectPending = false;
  s_wifiRetryAtMs = 0;
  writeIntToSettings("sta_auto", 0);
}

// All'avvio: si ricollega alla rete salvata, salvo disconnessione voluta (sta_auto = 0).
void wifiAutoConnectAtBoot() {
  if (readIntFromSettings("sta_auto", 1) != 1) return;
  String s = readStringFromSettings("ssid", "");
  if (s.isEmpty()) return;
  String p = readStringFromSettings("pw", "");
  Serial.println("WiFi: riconnessione automatica a " + s);
  connectToWiFi(s.c_str(), p.c_str());
}

void wifiLoop() {
  uint32_t now = millis();

  if (s_wifiConnectPending) {
    if (s_wifiConnectAtMs == 0) {
      // Avvisa il frontend prima che il WebSocket cada per il cambio di canale
      StaticJsonDocument<128> wifiDoc;
      wifiDoc["t"] = TYPE_WIFI_CONNECTING;
      wifiDoc["ssid"] = s_pendingSsid;
      char wifiMsg[160];
      serializeJson(wifiDoc, wifiMsg, sizeof(wifiMsg));
      ws.textAll(wifiMsg);
      s_wifiConnectAtMs = now + 150;    // tempo al browser per riceverlo
      if (s_wifiConnectAtMs == 0) s_wifiConnectAtMs = 1;
    } else if ((int32_t)(now - s_wifiConnectAtMs) >= 0) {
      s_wifiConnectPending = false;
      s_wifiConnectAtMs = 0;
      registerWifiEvents();
      WiFi.setSleep(false);              // il core non riattiva il modem sleep
      WiFi.mode(WIFI_AP_STA);
      WiFi.setAutoReconnect(true);
      startAttemptTime = millis();
      if (s_pendingPw[0] == '\0') WiFi.begin(s_pendingSsid);
      else                        WiFi.begin(s_pendingSsid, s_pendingPw);
      wifiNoPowerSave();
      Serial.printf("Connessione a %s\n", s_pendingSsid);

      static bool internetTaskStarted = false;
      if (!internetTaskStarted) {
        internetTaskStarted = true;
        xTaskCreatePinnedToCore(internetCheckTask, "InternetCheck", 4096, NULL, 1, NULL, 0);
      }
    }
  }

  if (s_wifiRetryAtMs != 0 && (int32_t)(now - s_wifiRetryAtMs) >= 0) {
    s_wifiRetryAtMs = 0;
    WiFi.reconnect();
  }

  if (now - s_lastPsCheckMs >= 1000) {
    s_lastPsCheckMs = now;
    wifiNoPowerSave();
  }
}

void internetCheckTask(void *pvParameters) {
  for (;;) {
    if (WiFi.status() == WL_CONNECTED) {
      WiFiClient client;
      client.setTimeout(2000);
      //Serial.println("Tentativo di accesso internet...");
      internetOK = client.connect("8.8.8.8", 53);
      client.stop();
    } else {
      internetOK = false;
    }

    vTaskDelay(pdMS_TO_TICKS(5000)); // ogni 30 s
  }
}


void onWsEvent(AsyncWebSocket *server, AsyncWebSocketClient *client,
               AwsEventType type, void *arg, uint8_t *data, size_t len) {
  switch (type) {
    case WS_EVT_CONNECT:
      debug("🔌 WebSocket client connected");
      break;

    case WS_EVT_DISCONNECT:
      debug("❌ WebSocket client disconnected");
      break;

    case WS_EVT_DATA:
      #ifdef DEBUG
        Serial.print("📩 Received from client: ");
        for (size_t i = 0; i < len; i++) Serial.print((char)data[i]);
        Serial.println();
        // opzionale: puoi rispondere
        //client->text("Messaggio ricevuto!");
      #endif
      break;

    default:
      break;
  }
}

// Ritorna false e invia 401 se il token non corrisponde.
// Accetta il token sia come header X-Token che come query parameter ?token=
// Se nessun token è configurato in NVS, lascia passare tutto (retrocompatibilità).
bool isAuthorized(AsyncWebServerRequest *request) {
  String token = readStringFromSettings("api_token", "");
  if (token.isEmpty()) return true;
  // Controlla prima il query parameter ?token=, poi l'header X-Token
  if (request->hasParam("token") && request->getParam("token")->value() == token) return true;
  if (request->hasHeader("X-Token") && request->header("X-Token") == token) return true;
  request->send(401, "text/plain", "Unauthorized");
  return false;
}

// Il browser rivalida a ogni richiesta (no-cache) e il device risponde 304 se il file non e' cambiato:
// dopo un aggiornamento ricarica solo cio' che e' stato modificato, senza aspettare la scadenza della cache.
static bool sendNotModified(AsyncWebServerRequest *request, const char *etag) {
  if (!request->hasHeader("If-None-Match") || request->header("If-None-Match") != etag) return false;
  AsyncWebServerResponse *r = request->beginResponse(304);
  r->addHeader("ETag", etag);
  r->addHeader("Cache-Control", "no-cache");
  request->send(r);
  return true;
}

// ETag dei file .gz: il CRC32 che li chiude (cambia solo se cambia il contenuto)
static bool gzEtag(const String &gz, char *etag) {
  File f = LittleFS.open(gz, "r");
  if (!f) return false;
  size_t n = f.size();
  uint8_t t[4];
  bool ok = n >= 18 && f.seek(n - 8) && f.read(t, 4) == 4;
  f.close();
  if (ok) snprintf(etag, 16, "\"%02x%02x%02x%02x\"", t[3], t[2], t[1], t[0]);
  return ok;
}

static void serveGzipped(AsyncWebServerRequest *request, const char* path, const char* mime) {
  String gz = String(path) + ".gz";
  if (LittleFS.exists(gz)) {
    char etag[16];
    bool tagged = gzEtag(gz, etag);
    if (tagged && sendNotModified(request, etag)) return;
    AsyncWebServerResponse *r = request->beginResponse(LittleFS, gz, mime);
    r->addHeader("Content-Encoding", "gzip");
    r->addHeader("Cache-Control", "no-cache");
    if (tagged) r->addHeader("ETag", etag);
    request->send(r);
  } else {
    request->send(LittleFS, path, mime);
  }
}

// File non compresso (immagini): ETag dalla dimensione
static void serveValidated(AsyncWebServerRequest *request, const char *path, const char *mime) {
  File f = LittleFS.open(path, "r");
  if (!f) { request->send(404); return; }
  char etag[16];
  snprintf(etag, sizeof(etag), "\"%x\"", (unsigned)f.size());
  f.close();
  if (sendNotModified(request, etag)) return;
  AsyncWebServerResponse *r = request->beginResponse(LittleFS, path, mime);
  r->addHeader("Cache-Control", "no-cache");
  r->addHeader("ETag", etag);
  request->send(r);
}

// Motivo dell'ultimo riavvio (utile per capire un reset: panic, watchdog, brownout, alimentazione…)
static const char *resetReasonText() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:   return "power-on";
    case ESP_RST_EXT:       return "pin reset";
    case ESP_RST_SW:        return "software (ESP.restart)";
    case ESP_RST_PANIC:     return "panic (eccezione o abort)";
    case ESP_RST_INT_WDT:   return "watchdog interrupt";
    case ESP_RST_TASK_WDT:  return "watchdog task";
    case ESP_RST_WDT:       return "watchdog";
    case ESP_RST_DEEPSLEEP: return "deep sleep";
    case ESP_RST_BROWNOUT:  return "brownout (tensione troppo bassa)";
    case ESP_RST_SDIO:      return "sdio";
    default:                return "sconosciuto";
  }
}

void registerRoutes(AsyncWebServer &server, AsyncWebSocket &ws) {

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  server.onNotFound([](AsyncWebServerRequest *request) {
    request->send(404);
  });

  server.on("/update.html", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/update.html", "text/html");
  });

  server.on("/updatefs", HTTP_POST,
  [](AsyncWebServerRequest *request){
    bool ok = !Update.hasError();
    AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", ok ? "OK - Riavvio..." : "ERRORE");
    response->addHeader("Connection", "close");
    request->send(response);
    if(ok) shouldRestart = true;
  },
  [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final){
    if(!index){
      if (!isAuthorized(request)) return;
      Serial.println("FS Update start");
      Update.begin(UPDATE_SIZE_UNKNOWN, U_SPIFFS);
    }
    Update.write(data, len);
    if(final){
      Update.end(true);
      Serial.println("FS Update completato");
    }
  }
);

  server.on("/update", HTTP_POST,
    [](AsyncWebServerRequest *request){
      bool ok = !Update.hasError();
      AsyncWebServerResponse *response = request->beginResponse(200, "text/plain", ok ? "OK - Riavvio..." : "ERRORE");
      response->addHeader("Connection", "close");
      request->send(response);
      if(ok) shouldRestart = true;
    },
    [](AsyncWebServerRequest *request, String filename, size_t index, uint8_t *data, size_t len, bool final){
      if(!index){
        if (!isAuthorized(request)) return;
        Serial.printf("Update start: %s\n", filename.c_str());
        Update.begin();
      }
      Update.write(data, len);
      if(final){
        Update.end(true);
        Serial.println("Update completato");
      }
    }
  );

  server.on("/", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/index.html", "text/html");
  });

  server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/script.js", "application/javascript");
  });

  server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/style.css", "text/css");
  });

  server.on("/logo.webp", HTTP_GET, [](AsyncWebServerRequest *request){
    serveValidated(request, "/logo.webp", "image/webp");
  });

  server.on("/logo-black.webp", HTTP_GET, [](AsyncWebServerRequest *request){
    serveValidated(request, "/logo-black.webp", "image/webp");
  });

  server.on("/en.png", HTTP_GET, [](AsyncWebServerRequest *request){
    serveValidated(request, "/en.png", "image/png");
  });

  server.on("/it.png", HTTP_GET, [](AsyncWebServerRequest *request){
    serveValidated(request, "/it.png", "image/png");
  });

  server.on("/disciplines.js", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/disciplines.js", "application/javascript");
  });

  server.on("/admin", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/admin.html", "text/html");
  });

  server.on("/stream", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/stream.html", "text/html");
  });

  server.on("/stream.js", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/stream.js", "application/javascript");
  });

  server.on("/broadcast", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/broadcast.html", "text/html");
  });

  server.on("/broadcast.js", HTTP_GET, [](AsyncWebServerRequest *request){
    serveGzipped(request, "/broadcast.js", "application/javascript");
  });

  server.onNotFound([](AsyncWebServerRequest *req){
    String url = req->url();
    if (url == "/index.html" || url == "/") {
      req->send(404, "text/plain", "Not found");
    } else {
      // relativo: vale sia sulla rete della Main (192.168.10.1) sia sull'IP della rete esterna
      req->redirect("/index.html");
    }
  });

  server.on("/setOffset", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (request->hasParam("offset")) {
      String val = request->getParam("offset")->value();
      utcOffset = val.toInt();
      request->send(200, "text/plain", "Time offset updated.");
    } else {
      request->send(400, "text/plain", "Missing offset parameter.");
    }
  });

  server.on("/reset", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    request->send(400, "text/plain", "Board reboot!");
    esp_restart();
  });

  // --- Reset / riarmo del tempo trascorso (elapsed) ---
  // ChronofitMainCell non ha sincronizzazione dell'orario: l'unica modalità è elapsed.
  server.on("/setTime", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;

    if (request->hasParam("mode") && request->getParam("mode")->value().toInt() != MODE_ELAPSED_TIME) {
      request->send(400, "text/plain", "Unsupported mode");
      return;
    }

    syncStatus = ELAPSED_WAITING_START;
    syncMode = MODE_ELAPSED_TIME;
    temp_hh = 0;
    temp_mm  = 0;
    temp_ss = 0;

    debug("Attesa di un segnale di start");
    request->send(200, "text/plain", "Wait start signal");
    wifiRxActivity();
  });

  server.on("/checkPoint", HTTP_GET, [](AsyncWebServerRequest *request) {
    int lineNumber = 0;
    uint64_t mowMicros = esp_timer_get_time();
    if (request->hasParam("lineNumber")) {
        lineNumber = request->getParam("lineNumber")->value().toInt();
    }
    if (request->hasParam("competitor")) {
        competitors[lineNumber] = request->getParam("competitor")->value().toInt();
    }

    if (lineNumber < 0 || lineNumber > 5) {
      request->send(400, "text/plain", "Bad lineNumber");
      return;
    }
    sensorManual[lineNumber] = true;
    sensorTriggered[lineNumber] = true;
    sensorTime[lineNumber] = mowMicros;
    request->send(200, "text/plain", "CheckPoint received!");
    wifiRxActivity();
  });

  // ── Fotocellule wireless (Chronofit_Cell) ─────────────────────────────────
  // /clockSync: orologio esp_timer del base (µs), campionato come prima
  // istruzione, per la stima dell'offset di clock lato fotocellula.
  server.on("/clockSync", HTTP_GET, [](AsyncWebServerRequest *request) {
    uint64_t nowUs = esp_timer_get_time();
    char buf[24];
    snprintf(buf, sizeof(buf), "%llu", (unsigned long long)nowUs);
    request->send(200, "text/plain", buf);

    // Battito di presenza della cella (parametri opzionali): registrato DOPO
    // la risposta, così non allunga la misura di RTT che la cella sta facendo.
    if (request->hasParam("cell") && request->hasParam("line")) {
      int line = request->getParam("line")->value().toInt();
      int rssi = request->hasParam("rssi") ? (int)request->getParam("rssi")->value().toInt() : 0;
      uint32_t rtt = request->hasParam("rtt") ? (uint32_t)request->getParam("rtt")->value().toInt() : 0;
      String fw = request->hasParam("fw") ? request->getParam("fw")->value() : String("");
      cellsTouch(request->getParam("cell")->value().c_str(), line, rssi, rtt, fw.c_str(),
                 (uint32_t)request->client()->remoteIP());
    }
  });

  // Elenco fotocellule viste dalla Main (stesso JSON del push WS tipo 12),
  // con lo stato della radio e degli ingressi locali.
  server.on("/cells", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "application/json", cellsToJson());
  });

  // ── Fotocellule RF (Chronofit_Cell_RF) ────────────────────────────────────
  // Apre (on=1, per `s` secondi, default 60, max 600) o chiude (on=0)
  // l'abbinamento delle nuove celle.
  server.on("/cellsPair", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (!mainRadioOk()) {
      request->send(503, "text/plain", "Radio not available");
      return;
    }
    bool on = !request->hasParam("on") || request->getParam("on")->value().toInt() != 0;
    uint32_t sec = request->hasParam("s") ? (uint32_t)request->getParam("s")->value().toInt() : 60;
    if (sec == 0 || sec > 600) sec = 60;
    mainRadioSetPairing(on ? sec * 1000UL : 0);
    request->send(200, "text/plain", on ? "Pairing open" : "Pairing closed");
    wifiRxActivity();
  });

  // Configurazione di una cella RF abbinata: ogni parametro è opzionale.
  // Arriva alla cella al sync successivo (entro ~1 s).
  server.on("/cellConfig", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (!request->hasParam("id")) {
      request->send(400, "text/plain", "Missed params");
      return;
    }
    int line = request->hasParam("line") ? request->getParam("line")->value().toInt() : -1;
    int lockout = request->hasParam("lockoutMs") ? request->getParam("lockoutMs")->value().toInt() : -1;
    int buzzer = request->hasParam("buzzer") ? request->getParam("buzzer")->value().toInt() : -1;
    if ((request->hasParam("line") && (line < 0 || line > 4)) ||
        (request->hasParam("lockoutMs") && (lockout < 0 || lockout > 60000))) {
      request->send(400, "text/plain", "Bad value");
      return;
    }
    if (!cellsRfConfigure(request->getParam("id")->value().c_str(), line, lockout, buzzer)) {
      request->send(404, "text/plain", "Unknown cell");
      return;
    }
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

  // Comando a una cella RF: beep (la fa suonare/lampeggiare per trovarla) o
  // test (passaggio di prova). Consegnato al sync successivo.
  server.on("/cellCmd", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (!request->hasParam("id") || !request->hasParam("cmd")) {
      request->send(400, "text/plain", "Missed params");
      return;
    }
    String cmd = request->getParam("cmd")->value();
    uint8_t code = cmd == "beep" ? RF_CMD_BEEP
                 : cmd == "test" ? RF_CMD_TEST
                 : cmd == "batcal" ? RF_CMD_BAT_CAL : RF_CMD_NONE;
    if (code == RF_CMD_NONE) {
      request->send(400, "text/plain", "Bad cmd");
      return;
    }
    uint16_t arg = 0;
    if (code == RF_CMD_BAT_CAL) {
      // mv = tensione della batteria della cella misurata al tester
      int mv = request->hasParam("mv") ? request->getParam("mv")->value().toInt() : 0;
      if (mv < 2500 || mv > 5000) {
        request->send(400, "text/plain", "Bad mv");
        return;
      }
      arg = (uint16_t)mv;
    }
    if (!cellsRfCommand(request->getParam("id")->value().c_str(), code, arg)) {
      request->send(404, "text/plain", "Unknown cell");
      return;
    }
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

  // Rimuove l'abbinamento: al sync successivo la cella lo dimentica.
  server.on("/cellRemove", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (!request->hasParam("id")) {
      request->send(400, "text/plain", "Missed params");
      return;
    }
    if (!cellsRfRemove(request->getParam("id")->value().c_str())) {
      request->send(404, "text/plain", "Unknown cell");
      return;
    }
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

  // Curve di scarica (tipica e apprese) e scariche in registrazione.
  server.on("/batteryCurve", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "application/json", batteryCurveJson());
    wifiRxActivity();
  });

  // Torna alla curva tipica: kind = main | cell | all.
  server.on("/batteryCurveReset", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    String kind = request->hasParam("kind") ? request->getParam("kind")->value() : "";
    if (kind != "main" && kind != "cell" && kind != "all") {
      request->send(400, "text/plain", "Bad kind");
      return;
    }
    if (kind != "cell") batteryCurveReset(BAT_CURVE_MAIN);
    if (kind != "main") batteryCurveReset(BAT_CURVE_CELL);
    cellsMarkDirty();
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

  // Taratura della batteria della Main: mv = tensione misurata al tester.
  server.on("/batteryCal", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    int mv = request->hasParam("mv") ? request->getParam("mv")->value().toInt() : 0;
    int factor = powerBatteryCalibrate(mv);
    if (factor < 0) {
      request->send(400, "text/plain", "Bad mv");
      return;
    }
    cellsMarkDirty();
    request->send(200, "text/plain", String(factor));
    wifiRxActivity();
  });

  // Ingressi locali della Main: linea della fotocellula e della pedana (0 =
  // disattivato) e fronte della pedana (0 = contatto, 1 = rilascio).
  server.on("/localInputsSave", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    int bl = request->hasParam("barrierLine") ? request->getParam("barrierLine")->value().toInt() : -1;
    int pl = request->hasParam("padLine") ? request->getParam("padLine")->value().toInt() : -1;
    int pe = request->hasParam("padEdge") ? request->getParam("padEdge")->value().toInt() : -1;
    if ((request->hasParam("barrierLine") && (bl < 0 || bl > 4)) ||
        (request->hasParam("padLine") && (pl < 0 || pl > 4)) ||
        (request->hasParam("padEdge") && pe != PAD_EDGE_CONTACT && pe != PAD_EDGE_RELEASE)) {
      request->send(400, "text/plain", "Bad value");
      return;
    }
    localInputsConfigure(bl, pl, pe);
    cellsMarkDirty();
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

  // /remoteCheckpoint: passaggio con timestamp già nel dominio esp_timer del
  // base (t, µs). lineNumber è 1-BASED (1..4), a differenza di /checkPoint che
  // usa l'indice 0-based. `seq` evita duplicati se la cella ritenta dopo un
  // ACK perso.
  server.on("/remoteCheckpoint", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    static uint32_t lastRemoteSeq[4] = {0, 0, 0, 0};

    if (!request->hasParam("lineNumber") || !request->hasParam("t")) {
      request->send(400, "text/plain", "Missed params");
      return;
    }
    int line = request->getParam("lineNumber")->value().toInt();
    if (line < 1 || line > 4) {
      request->send(400, "text/plain", "Bad lineNumber");
      return;
    }
    int idx = line - 1;
    uint64_t t = strtoull(request->getParam("t")->value().c_str(), nullptr, 10);
    uint64_t nowUs = esp_timer_get_time();
    // Rifiuta istanti nel futuro (> 50 ms) o più vecchi di 5 minuti.
    if (t > nowUs + 50000ULL || (nowUs > t && (nowUs - t) > 300000000ULL)) {
      request->send(400, "text/plain", "Bad timestamp");
      return;
    }

    if (request->hasParam("seq")) {
      uint32_t seq = (uint32_t)strtoul(request->getParam("seq")->value().c_str(), nullptr, 10);
      if (seq != 0 && seq == lastRemoteSeq[idx]) {
        request->send(200, "text/plain", "DUP");
        return;
      }
      lastRemoteSeq[idx] = seq;
    }

    portENTER_CRITICAL(&isrMux);
    sensorTime[idx] = t;
    sensorTriggered[idx] = true;
    portEXIT_CRITICAL(&isrMux);

    request->send(200, "text/plain", "OK");
    if (request->hasParam("cell")) {
      cellsEvent(request->getParam("cell")->value().c_str(), line, (uint32_t)request->client()->remoteIP());
    }
    wifiRxActivity();
  });

  // ── Scansione reti WiFi (asincrona: richiamare finché scanning=false) ──────
  server.on("/wifiScan", HTTP_GET, [](AsyncWebServerRequest *request) {
    int n = WiFi.scanComplete();
    JsonDocument doc;
    if (n == WIFI_SCAN_FAILED) {
      // Un tentativo di connessione in corso (o il retry con backoff) fa fallire la
      // scansione: se la STA non è connessa la fermiamo e rimandiamo il retry a fine scansione.
      if (WiFi.status() != WL_CONNECTED) {
        if (wifiReconnecting) scheduleWifiRetry(15000);
        WiFi.disconnect(false, false);
      }
      // 120 ms per canale: disturba meno i client dell'AP rispetto al default (300 ms)
      WiFi.scanNetworks(true, false, false, 120);
      doc["scanning"] = true;
    } else if (n == WIFI_SCAN_RUNNING) {
      doc["scanning"] = true;
    } else {
      doc["scanning"] = false;
      JsonArray arr = doc["networks"].to<JsonArray>();
      for (int i = 0; i < n; i++) {
        JsonObject o = arr.add<JsonObject>();
        o["ssid"]    = WiFi.SSID(i);
        o["rssi"]    = WiFi.RSSI(i);
        o["channel"] = WiFi.channel(i);
        o["secure"]  = (WiFi.encryptionType(i) != WIFI_AUTH_OPEN);
      }
      WiFi.scanDelete();
      if (wifiReconnecting && WiFi.status() != WL_CONNECTED) scheduleWifiRetry(500);
    }
    String json;
    serializeJson(doc, json);
    request->send(200, "application/json", json);
    wifiRxActivity();
  });

  server.on("/wifiConnect", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    Serial.println("Richiesta connessione wifi...");

    String ssid = request->hasParam("ssid") ? request->getParam("ssid")->value() : "";
    String pw   = request->hasParam("pw")   ? request->getParam("pw")->value()   : "";

    Serial.println("Salvo credenziali...");
    writeStringToSettings("ssid", ssid);
    writeStringToSettings("pw", pw);

    Serial.println("Richieste connessione:");
    Serial.println(ssid);
    Serial.println(pw);

    // Copia in buffer temporaneo sicuro
    char ssidBuf[64];
    char pwBuf[64];
    ssid.toCharArray(ssidBuf, sizeof(ssidBuf));
    pw.toCharArray(pwBuf, sizeof(pwBuf));

    connectToWiFi(ssidBuf, pwBuf, 10000);
  
    request->send(200, "text/plain", "Wifi connecting...");
    wifiRxActivity();
  });

  // --- Cambio password Access Point ---
  server.on("/setApPassword", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;

    String current = request->hasParam("current") ? request->getParam("current")->value() : "";
    String newpwd  = request->hasParam("newpwd")  ? request->getParam("newpwd")->value()  : "";

    String stored = readStringFromSettings("ap_password", "");
    if (stored.isEmpty()) stored = chipIdStr;

    if (current != stored) {
      request->send(401, "text/plain", "Password attuale errata");
      return;
    }
    if (newpwd.length() < 8) {
      request->send(400, "text/plain", "La password deve essere di almeno 8 caratteri");
      return;
    }

    writeStringToSettings("ap_password", newpwd);

    String ssid_sn = String(ssid) + "_" + chipIdStr;
    WiFi.softAP(ssid_sn.c_str(), newpwd.c_str(), 6, false, 10);

    request->send(200, "text/plain", "Password AP aggiornata");
    wifiRxActivity();
  });

  // --- Ripristino password AP (route di emergenza, nessuna auth) ---
  server.on("/resetApPassword", HTTP_GET, [](AsyncWebServerRequest *request) {
    writeStringToSettings("ap_password", "");

    String ssid_sn = String(ssid) + "_" + chipIdStr;
    WiFi.softAP(ssid_sn.c_str(), chipIdStr.c_str(), 6, false, 10);

    request->send(200, "text/plain", "Password AP ripristinata al chip ID");
    wifiRxActivity();
  });

    // --- JSON completo ---
  server.on("/time", HTTP_GET, [](AsyncWebServerRequest *request) {

    StaticJsonDocument<64> doc;

    PreciseTime t = getPreciseTime();

    doc["hh"] = t.hh;
    doc["mm"] = t.mm;
    doc["ss"] = t.ss;
    doc["ms"] = t.ms;

    char json[64];
    serializeJson(doc, json, sizeof(json));

    request->send(200, "application/json", json);
    wifiRxActivity();
  });

    // --- JSON completo ---
  server.on("/wifiCredential", HTTP_GET, [](AsyncWebServerRequest *request) {

    StaticJsonDocument<256> doc;
    
    doc["ssid"]        = readStringFromSettings("ssid", "");
    doc["pw"]          = readStringFromSettings("pw", "");
    doc["staConnected"] = (WiFi.status() == WL_CONNECTED);
    doc["staIp"]       = WiFi.localIP().toString();

    String json;
    serializeJson(doc, json);

    request->send(200, "application/json", json);
    wifiRxActivity();
  });


  // ── Branding e discipline (licensing dealer) ──────────────────────────────
  // discFlags: blob JSON { "<disciplineId>": 0|1 } con lo stato abilitato/
  // bloccato di ogni disciplina nella schermata di selezione. Una sola chiave
  // NVS (stringa) invece di una chiave per disciplina: il limite NVS è sulla
  // lunghezza della CHIAVE (15 caratteri), non del valore.
  server.on("/brandingSettings", HTTP_GET, [](AsyncWebServerRequest *request) {
    String flagsJson = readStringFromSettings("discFlags", "{}");
    StaticJsonDocument<512> flagsDoc;
    DeserializationError err = deserializeJson(flagsDoc, flagsJson);

    StaticJsonDocument<768> out;
    JsonObject disciplines = out["disciplines"].to<JsonObject>();
    if (!err && flagsDoc.is<JsonObject>()) {
      for (JsonPair kv : flagsDoc.as<JsonObject>()) {
        disciplines[kv.key()] = kv.value();
      }
    }
    // showSponsor: visibilità dell'immagine sponsor.png già esistente (vedi
    // sponsor.html per il suo upload) — default 1 (visibile), per non
    // cambiare comportamento sui device esistenti che la mostrano già oggi.
    out["showSponsorLogo"]   = readIntFromSettings("showSponsor", 1);
    out["sponsorLogoExists"] = LittleFS.exists("/sponsor.png");

    String json;
    serializeJson(out, json);
    request->send(200, "application/json", json);
    wifiRxActivity();
  });

  server.on("/brandingSave", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (request->hasParam("disciplines")) {
      writeStringToSettings("discFlags", request->getParam("disciplines")->value());
    }
    if (request->hasParam("showSponsorLogo")) {
      writeIntToSettings("showSponsor", request->getParam("showSponsorLogo")->value().toInt());
    }
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

  server.on("/wifiStop", HTTP_GET, [](AsyncWebServerRequest *request) {
    WiFi.setAutoReconnect(false);
    WiFi.disconnect(false);
    reconnectAttempts = MAX_ATTEMPTS;
    wifiStopStation();
    wifiReconnecting = false;
    Serial.println("🛑 WiFi: riconnessione interrotta dall'utente");
    request->send(200, "text/plain", "OK");
    wifiRxActivity();
  });

    // --- JSON completo ---
  server.on("/allSettings", HTTP_GET, [](AsyncWebServerRequest *request) {

    String message = serializeSettings();

    request->send(200, "text/plain", message);
    
    debug(message);

    wifiRxActivity();
  });



  server.on("/getCheckpoints", HTTP_GET, [](AsyncWebServerRequest *request) {
    debug("Sending data from json...");

    const char* path = "/session.json";

    if (!LittleFS.exists(path)) {
        request->send(200, "application/json", "{}"); // nessun checkpoint
        return;
    }

    File file = LittleFS.open(path, "r");
    if (!file) {
        request->send(500, "text/plain", "File open error");
        return;
    }

    Serial.println("Inizio invio file JSON...");

    // Chunked response corretta
    AsyncWebServerResponse *response = request->beginChunkedResponse("application/json",
        [file](uint8_t *buffer, size_t maxLen, size_t index) mutable -> unsigned int {
            size_t bytesRead = file.read(buffer, maxLen);
            if (bytesRead == 0) file.close(); // chiudi alla fine
            return bytesRead;
        }
    );

    request->send(response);
    wifiRxActivity();
  });



  server.on("/update", HTTP_POST,
  [](AsyncWebServerRequest* request){
      if(Update.hasError()){
          request->send(500,"text/plain","Update failed");
      } else {
          request->send(200,"text/plain","Update success, rebooting...");
          delay(1000);
          ESP.restart();
      }
  },
  [](AsyncWebServerRequest* request, String filename, size_t index,
     uint8_t *data, size_t len, bool final){
       if(!index){
           if(!filename.endsWith(".bin")) return; // controllo .bin
           Serial.printf("Updating FW: %s\n", filename.c_str());
           Update.begin(UPDATE_SIZE_UNKNOWN);
       }
       Update.write(data, len);
       if(final){
           if(Update.end(true)) Serial.println("FW update done");
           else Serial.println("FW update failed");
       }
  });

  // Elenco competitor: copia di sicurezza sull'unità (la console lo tiene nel localStorage del browser).
  // Si perde con l'aggiornamento del filesystem; /clearSession non la tocca.
  server.on("/athletes", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    if (!LittleFS.exists("/athletes.json")) { request->send(404, "application/json", "[]"); return; }
    request->send(LittleFS, "/athletes.json", "application/json");
    wifiRxActivity();
  });

  server.on("/athletes", HTTP_POST, [](AsyncWebServerRequest *request) {}, NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {
      static File f;
      static bool refused = false, wrote = true;
      if (index == 0) {
        if (f) f.close();
        refused = true; wrote = true;
        if (!isAuthorized(request)) return;   // 401 gia' inviato
        if (total == 0 || total > 65536) { request->send(413, "application/json", "{\"ok\":false,\"error\":\"size\"}"); return; }
        f = LittleFS.open("/athletes.tmp", "w");
        if (!f) { request->send(500, "application/json", "{\"ok\":false,\"error\":\"fs\"}"); return; }
        refused = false;
      }
      if (refused) return;
      if (f.write(data, len) != len) wrote = false;
      if (index + len < total) return;
      f.close();
      bool ok = wrote;
      if (ok) { LittleFS.remove("/athletes.json"); ok = LittleFS.rename("/athletes.tmp", "/athletes.json"); }
      else LittleFS.remove("/athletes.tmp");
      if (ok) request->send(200, "application/json", "{\"ok\":true}");
      else request->send(500, "application/json", "{\"ok\":false,\"error\":\"fs\"}");
      wifiRxActivity();
    });

  server.on("/clearSession", HTTP_GET, [&](AsyncWebServerRequest *request) {
    if (!isAuthorized(request)) return;
    equestrianClear();   // i turni di equitazione fanno parte della sessione
    if (LittleFS.exists("/session.json")) {
      if (LittleFS.remove("/session.json")) {
        request->send(200, "text/plain", "✅ Sessione cancellata con successo!");
        Serial.println("Sessione cancellata dal filesystem.");
        sessionRowIndex = 0;
        StaticJsonDocument<32> doc;
        doc["t"] = TYPE_SESSION_CLEARED;

        char message[32];
        serializeJson(doc, message, sizeof(message));

        ws.textAll(message);
        wifiTxActivity();
      } else {
        request->send(500, "text/plain", "❌ Errore nella cancellazione del file!");
      }
    } else {
      request->send(200, "text/plain", "⚠️ Nessuna sessione da cancellare.");
    }
  });

  server.on("/uploadFS", HTTP_POST,
    [](AsyncWebServerRequest* request){ request->send(200,"text/plain","FS upload done"); },
    [](AsyncWebServerRequest* request, String filename, size_t index,
      uint8_t *data, size_t len, bool final){
        if(!index){
            File f = LittleFS.open("/"+filename,"w"); f.close();
        }
        File f = LittleFS.open("/"+filename,"a");
        f.write(data,len);
        f.close();
        wifiRxActivity();
    });



  server.on("/setAttribute", HTTP_GET, [](AsyncWebServerRequest *request){
    if (!isAuthorized(request)) return;

    #ifdef DEBUG
      Serial.print("URL richiesta: ");
      Serial.println(request->url());
    #endif

    if (request->hasParam("buzzerEnable")) {
      buzzerActive = request->getParam("buzzerEnable")->value().toInt() ? 1 : 0;
      writeIntToSettings("buzzActive", buzzerActive);   // altrimenti al riavvio torna al default
    }

    if(request->hasParam("stationName"))
    {
      stationName = request->getParam("stationName")->value();
      writeStringToSettings("stationName", stationName);
      debug("Impostazione nome stazione!");
      debug(stationName);
      request->send(200, "text/plain", "Station name set!");
    }

    broadCastSettings();
    #ifdef DEBUG
      Serial.printf("Ricevuti: %d, %d\n", syncEnabled, utcOffset);
    #endif

    request->send(200, "text/plain", "Saved sucessfully");
    wifiRxActivity();
  });

  server.on("/checkPointFields", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL,
  [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {

    String body;
    for (size_t i = 0; i < len; i++) body += (char)data[i];
    debug("Ricevuti nuovi settings: " + body);

    StaticJsonDocument<320> doc;
    deserializeJson(doc, body);
    int line = doc["l"].as<int>();
    int idx = line - 1;
    competitors[idx] = doc["c"].as<int>();
    if (doc.containsKey("d")) lineDelaySet(idx, doc["d"].as<long>());
    if (doc.containsKey("e")) lineEnabled[idx] = doc["e"].as<int>();
    if (doc.containsKey("t1")) {
      lineDevice[idx] = doc["t1"].as<String>().substring(0, 32);
      if (idx >= 0 && idx <= 3) writeStringToSettings(("lt1_" + String(idx + 1)).c_str(), lineDevice[idx]);
    }
    if (doc.containsKey("t2")) lineMode[idx]   = doc["t2"].as<int>();

    broadcastLineUpdate(idx);

    #ifdef DEBUG
    Serial.printf("Ricevuti: %d, %d, %d, %d\n",
                    line, competitors[idx], delays[idx], lineEnabled[idx]);
    #endif
    // E qui elabori o invii via seriale, BLE, ecc.
    request->send(200, "text/plain", "Saved sucessfully");
    wifiRxActivity();
  });

  // Disattivazione automatica delle linee dopo il primo passaggio (NVS line_once).
  // Senza parametri restituisce lo stato, con v=0|1 lo imposta.
  server.on("/lineDisableAfterPass", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("v")) {
      lineDisableAfterPass = request->getParam("v")->value().toInt() ? 1 : 0;
      writeIntToSettings("line_once", lineDisableAfterPass);
    }
    request->send(200, "application/json", String("{\"v\":") + lineDisableAfterPass + "}");
    wifiRxActivity();
  });

  equestrianRegisterRoutes(server);   // /eq, /eqCmd, /eqConfig

  // Licenza a numero di accensioni (license.h): stato e applicazione di un codice.
  server.on("/license", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(200, "application/json", licenseJson());
    wifiRxActivity();
  });
  server.on("/licenseApply", HTTP_GET, [](AsyncWebServerRequest *request) {
    String code = request->hasParam("code") ? request->getParam("code")->value() : "";
    LicenseResult r = licenseApply(code.c_str());
    const char *err = r == LICENSE_ERR_FORMAT ? "format" : r == LICENSE_ERR_INVALID ? "invalid" : r == LICENSE_ERR_USED ? "used" : "";
    if (r != LICENSE_OK) {
      request->send(400, "application/json", String("{\"ok\":false,\"error\":\"") + err + "\"}");
    } else {
      request->send(200, "application/json", licenseJson());
    }
    wifiRxActivity();
  });

  // Linea di start del tempo trascorso: l = 0 (qualsiasi) | 1-4. Senza
  // parametri restituisce il valore attuale. Salvata in NVS (el_start).
  server.on("/elapsedStartLine", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("l")) {
      int l = request->getParam("l")->value().toInt();
      if (l < 0 || l > 4) {
        request->send(400, "text/plain", "Parameter l must be 0-4");
        return;
      }
      elapsedStartLine = l;
      writeIntToSettings("el_start", l);
    }
    request->send(200, "application/json", String("{\"l\":") + elapsedStartLine + "}");
    wifiRxActivity();
  });

  server.on("/checkPointFields", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (!request->hasParam("l")) {
      request->send(400, "text/plain", "Missing parameter: l (line number)");
      return;
    }
    int line = request->getParam("l")->value().toInt();
    if (line < 1 || line > 4) {
      request->send(400, "text/plain", "Parameter l must be 1–4");
      return;
    }
    int idx = line - 1;
    if (request->hasParam("c"))  competitors[idx] = request->getParam("c")->value().toInt();
    if (request->hasParam("d"))  lineDelaySet(idx, request->getParam("d")->value().toInt());
    if (request->hasParam("e"))  lineEnabled[idx] = request->getParam("e")->value().toInt();
    if (request->hasParam("t1")) {
      lineDevice[idx] = request->getParam("t1")->value().substring(0, 32);
      writeStringToSettings(("lt1_" + String(idx + 1)).c_str(), lineDevice[idx]);
    }
    if (request->hasParam("t2")) lineMode[idx]    = request->getParam("t2")->value().toInt();

    broadcastLineUpdate(idx);
    request->send(200, "text/plain", "Saved successfully");
    wifiRxActivity();
  });

  server.on("/updateCheckPointRow", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {

        // --- Parse JSON ricevuto ---
        StaticJsonDocument<384> doc;
        DeserializationError err = deserializeJson(doc, data, len);
        if (err) {
            request->send(400, "text/plain", "JSON non valido");
            return;
        }

        int entryIndex = doc["index"].as<int>();
        int lineNumber = doc["lineNumber"].as<int>();
        int competitor = doc["competitor"].as<int>();
        int hour = doc["hour"].as<int>();
        int minute = doc["minute"].as<int>();
        int second = doc["second"].as<int>();
        int millis = doc["millis"].as<int>();
        int penality = doc["penality"].as<int>();
        int cancelled = doc["cancelled"] | 0;

        #ifdef DEBUG
          Serial.printf("Aggiorno riga index=%d, lineNumber=%d, competitor=%d, %02d:%02d.%d\n",
                      entryIndex, lineNumber, competitor, hour, minute, millis);
        #endif

        // --- Apri file originale e temporaneo ---
        File inFile = LittleFS.open("/session.json", "r");
        if (!inFile) {
            request->send(500, "text/plain", "File non trovato");
            return;
        }

        File outFile = LittleFS.open("/session_tmp.json", "w");
        if (!outFile) {
            request->send(500, "text/plain", "Impossibile creare file temporaneo");
            inFile.close();
            return;
        }

        bool updated = false;

        char lineBuf[384];
        char outLineBuf[384];
        while (inFile.available()) {
            int n = inFile.readBytesUntil('\n', lineBuf, sizeof(lineBuf) - 1);
            if (n == 0) continue;
            lineBuf[n] = '\0';

            StaticJsonDocument<384> entry;
            if (deserializeJson(entry, lineBuf, n)) continue;

            int currentIndex = entry[INDEX_FIELD].as<int>();

            // --- Aggiorna se l'index corrisponde ---
            if (currentIndex == entryIndex) {
                entry[LINE_NUMBER_FIELD] = lineNumber;
                entry[COMPETITOR_FIELD] = competitor;
                entry[HOUR_FIELD] = hour;
                entry[MINUTE_FIELD] = minute;
                entry[SECOND_FIELD] = second;
                entry[MILLIS_FIELD] = millis;
                entry[PENALITY_FIELD] = penality;
                entry[CANCELLED_FIELD] = cancelled;
                entry[EDITED_FIELD] = 1;

                updated = true;
                debug("Riga aggiornata");
                broadCastRowEdited(entry);
            }

            serializeJson(entry, outLineBuf, sizeof(outLineBuf));
            outFile.println(outLineBuf);
        }
        // --- Se non trovato, aggiungi alla fine ---
        if (!updated) {
            StaticJsonDocument<384> newEntry;
            newEntry[INDEX_FIELD] = entryIndex;
            newEntry[LINE_NUMBER_FIELD] = lineNumber;
            newEntry[COMPETITOR_FIELD] = competitor;
            newEntry[HOUR_FIELD] = hour;
            newEntry[MINUTE_FIELD] = minute;
            newEntry[SECOND_FIELD] = second;
            newEntry[MILLIS_FIELD] = millis;
            newEntry[PENALITY_FIELD] = penality;
            newEntry[CANCELLED_FIELD] = cancelled;
            newEntry[EDITED_FIELD] = 1;

            serializeJson(newEntry, outLineBuf, sizeof(outLineBuf));
            outFile.println(outLineBuf);
            debug("Riga aggiunta");
        }

        inFile.close();
        outFile.close();

        // --- Sostituisci file originale ---
        LittleFS.remove("/session.json");
        LittleFS.rename("/session_tmp.json", "/session.json");
        
        request->send(200, "text/plain", "Riga aggiornata con successo");
        wifiRxActivity();
    });


  server.on("/downloadSession", HTTP_GET, [](AsyncWebServerRequest *request) {
  if (!LittleFS.exists("/session.json")) {
    request->send(404, "text/plain", "File non trovato");
    return;
  }
  request->send(LittleFS, "/session.json", "application/json");
  wifiRxActivity();
  });

  server.on("/systemSettings", HTTP_GET, [](AsyncWebServerRequest *request) {
 
    JsonDocument doc;
  
    // ── dati esistenti ──────────────────────────────────────
    doc["timeCal"]             = calibrationFactor;
    doc["sn"]                  = chipIdStr;
    doc["cpuTemp"]             = readInternalTemp();
    doc["fwVer"]               = String(FW_VERSION);
    doc["devName"]             = String(DEV_NAME);
    doc["hwName"]              = String(HW_NAME);
    doc["freeRam"]             = ESP.getFreeHeap();
    doc["minFreeRam"]          = ESP.getMinFreeHeap();
    doc["maxAllocRam"]         = ESP.getMaxAllocHeap();   // blocco libero più grande (frammentazione)
    doc["resetReason"]         = resetReasonText();       // motivo dell'ultimo riavvio
    doc["batteryMv"]           = powerBatteryMv();
    doc["batteryPct"]          = batteryPercent(powerBatteryMv(), BAT_CURVE_MAIN);
    doc["batteryMin"]          = batteryRuntimeMainMinutes();
    doc["charging"]            = powerCharging();
    doc["charged"]             = powerCharged();
    doc["radioOk"]             = mainRadioOk();
    doc["radioId"]             = mainRadioIdStr();
  
    size_t totalBytes = LittleFS.totalBytes();
    size_t usedBytes  = LittleFS.usedBytes();
    doc["fsTotalBytes"] = totalBytes;
    doc["fsUsedBytes"]  = usedBytes;
    doc["fsFreeBytes"]  = totalBytes - usedBytes;
  
    // L'elenco dei file (un oggetto per file: svariati KB di heap per richiesta) lo vuole solo
    // la pagina admin: si chiede con ?files=1.
    if (request->hasParam("files")) {
      JsonArray files = doc.createNestedArray("files");
      File root = LittleFS.open("/");
      File file = root.openNextFile();
      while (file) {
        JsonObject obj = files.createNestedObject();
        obj["name"] = file.name();
        obj["size"] = file.size();
        file = root.openNextFile();
      }
    }

    // Stack libero dei task (byte): serve a dimensionarli. Si chiede con ?tasks=1.
    if (request->hasParam("tasks")) {
      static const char *TASKS[] = {"loopTask", "async_tcp", "tiT", "wifi", "sys_evt", "Tmr Svc", "BuzzerTask",
                                    "mainRadio", "InternetCheck", "IDLE0", "IDLE1"};
      JsonObject tk = doc.createNestedObject("tasks");
      for (const char *name : TASKS) {
        TaskHandle_t h = xTaskGetHandle(name);
        if (h) tk[name] = (uint32_t)uxTaskGetStackHighWaterMark(h);
      }
    }

    String json;
    json.reserve(measureJson(doc) + 1);   // niente raddoppi successivi della stringa
    serializeJson(doc, json);
    request->send(200, "application/json", json);
    wifiTxActivity();
});

  server.on("/download", HTTP_GET, [](AsyncWebServerRequest *request) {

    if (!request->hasParam("file")) {
        request->send(400, "text/plain", "Param 'file' missing");
        return;
    }

    String filename = request->getParam("file")->value();

    // Controllo sicurezza: evitare path traversal
    if (!filename.startsWith("/")) filename = "/" + filename;
    if (!LittleFS.exists(filename)) {
        request->send(404, "text/plain", "File not found");
        return;
    }

    File file = LittleFS.open(filename, "r");
    if (!file) {
        request->send(500, "text/plain", "Cannot open file");
        return;
    }

    // Invia il file come download
    request->send(file, filename, "application/octet-stream");
    wifiRxActivity();
  });

  // ── DELETE ──────────────────────────────────────────────────
server.on("/delete", HTTP_DELETE, [](AsyncWebServerRequest *request) {
  if (!isAuthorized(request)) return;
  if (!request->hasParam("file")) {
    request->send(400, "text/plain", "Param 'file' missing");
    return;
  }

  String filename = request->getParam("file")->value();
  if (!filename.startsWith("/")) filename = "/" + filename;

  // Sicurezza: blocca path traversal
  if (filename.indexOf("..") >= 0) {
    request->send(403, "text/plain", "Forbidden");
    return;
  }

  if (!LittleFS.exists(filename)) {
    request->send(404, "text/plain", "File not found");
    return;
  }

  if (LittleFS.remove(filename)) {
    request->send(200, "text/plain", "File deleted: " + filename);
  } else {
    request->send(500, "text/plain", "Delete failed");
  }
  wifiRxActivity();
});

// ── UPLOAD ───────────────────────────────────────────────────
server.on("/upload", HTTP_POST,
  [](AsyncWebServerRequest *request) {
    request->send(200, "text/plain", "Upload done");
  },
  [](AsyncWebServerRequest *request, String filename, size_t index,
     uint8_t *data, size_t len, bool final) {

    if (!filename.startsWith("/")) filename = "/" + filename;

    // Sicurezza: blocca path traversal
    if (filename.indexOf("..") >= 0) {
      request->send(403, "text/plain", "Forbidden");
      return;
    }

    if (index == 0) {
      Serial.printf("Upload start: %s\n", filename.c_str());
      File f = LittleFS.open(filename, "w");
      if (!f) {
        request->send(500, "text/plain", "Cannot create file");
        return;
      }
      f.close();
    }

    File f = LittleFS.open(filename, "a");
    if (f) {
      f.write(data, len);
      f.close();
    }

    if (final) {
      Serial.printf("Upload done: %s (%u bytes)\n", filename.c_str(), index + len);
    }

    wifiRxActivity();
  }
);

  server.on("/timeBaseCal", HTTP_GET, [](AsyncWebServerRequest *request) {

    if (request->hasParam("delta_us") && request->hasParam("minutes")) {

        double deltaUs = request->getParam("delta_us")->value().toDouble();
        double minutes = request->getParam("minutes")->value().toDouble();

        double calFactor = setTimeBaseCalibration(deltaUs, minutes);

        if (calFactor < 0) {
            request->send(400, "text/plain", "Invalid minutes value");
            return;
        }

        request->send(200, "text/plain",
            "Calibration set: " + String(calFactor, 10));

    }
    else {
        request->send(400, "text/plain", "Missing parameters");
    }
  });
  wifiRxActivity();
}

String serializeSettings(){
  StaticJsonDocument<1152> doc;
  doc["t"] = TYPE_PARAMS_UPDATED;
  doc["c1"] = competitors[0];
  doc["c2"] = competitors[1];
  doc["c3"] = competitors[2];
  doc["c4"] = competitors[3];

  doc["d1"] = delays[0];
  doc["d2"] = delays[1];
  doc["d3"] = delays[2];
  doc["d4"] = delays[3];

  doc["e1"] = lineEnabled[0];
  doc["e2"] = lineEnabled[1];
  doc["e3"] = lineEnabled[2];
  doc["e4"] = lineEnabled[3];

  doc["lt1_1"] = lineDevice[0];
  doc["lt1_2"] = lineDevice[1];
  doc["lt1_3"] = lineDevice[2];
  doc["lt1_4"] = lineDevice[3];

  doc["lt2_1"] = lineMode[0];
  doc["lt2_2"] = lineMode[1];
  doc["lt2_3"] = lineMode[2];
  doc["lt2_4"] = lineMode[3];

  doc["utc"] = utcOffset;
  doc["sm"] = syncMode;
  doc["ss"] = syncStatus;
  doc["sn"] = stationName;
  doc["pw"] = powerSource;
  doc["bz"]               = buzzerActive;

  String message;
  serializeJson(doc, message);

  return message;
}

String serializeMessage(String msg){
  StaticJsonDocument<512> doc;
  doc["t"] = TYPE_GENERIC_MESSAGE;
  doc["msg"] = msg;

  String message;
  serializeJson(doc, message);

  return message;
}

void broadCastSettings(){
  String message = serializeSettings();
  ws.textAll(message);
  wifiTxActivity();
}

void broadcastCells() {
  ws.textAll(cellsToJson());
  wifiTxActivity();
}

void broadcastLineUpdate(int idx) {
  StaticJsonDocument<320> doc;
  doc["t"]  = TYPE_LINE_UPDATED;
  doc["l"]  = idx + 1;
  doc["c"]  = competitors[idx];
  doc["d"]  = delays[idx];
  doc["e"]  = lineEnabled[idx];
  doc["t1"] = lineDevice[idx];
  doc["t2"] = lineMode[idx];
  String msg;
  serializeJson(doc, msg);
  ws.textAll(msg);
  wifiTxActivity();
}


void broadCastRowEdited(const JsonDocument& entry){
  StaticJsonDocument<512> doc;
  doc["t"] = TYPE_ROW_UPDATED;
  doc[INDEX_FIELD] = entry[INDEX_FIELD];
  doc[LINE_NUMBER_FIELD] = entry[LINE_NUMBER_FIELD];
  doc[COMPETITOR_FIELD] = entry[COMPETITOR_FIELD];
  doc[HOUR_FIELD] = entry[HOUR_FIELD];
  doc[MINUTE_FIELD] = entry[MINUTE_FIELD];
  doc[SECOND_FIELD] = entry[SECOND_FIELD];
  doc[MILLIS_FIELD] = entry[MILLIS_FIELD];
  doc[PENALITY_FIELD] = entry[PENALITY_FIELD];
  doc[CANCELLED_FIELD] = entry[CANCELLED_FIELD];
  doc[EDITED_FIELD] = entry[EDITED_FIELD];

  String message;
  serializeJson(doc, message);

  ws.textAll(message);
  wifiTxActivity();
}

// Converte una stringa hex (es. "78a48cd6cdc0") in Base64
String hexToBase64(const String& hex) {
    // 1. Converti la stringa hex in array di byte
    int byteLen = hex.length() / 2;
    uint8_t bytes[byteLen];
    
    for (int i = 0; i < byteLen; i++) {
        bytes[i] = (uint8_t) strtol(hex.substring(i * 2, i * 2 + 2).c_str(), nullptr, 16);
    }

    // 2. Codifica i byte in Base64
    String result = "";
    int i = 0;
    uint8_t buf3[3], buf4[4];

    int len = byteLen;
    const uint8_t* data = bytes;

    while (len--) {
        buf3[i++] = *data++;
        if (i == 3) {
            buf4[0] = (buf3[0] & 0xfc) >> 2;
            buf4[1] = ((buf3[0] & 0x03) << 4) + ((buf3[1] & 0xf0) >> 4);
            buf4[2] = ((buf3[1] & 0x0f) << 2) + ((buf3[2] & 0xc0) >> 6);
            buf4[3] = buf3[2] & 0x3f;
            for (int j = 0; j < 4; j++) result += BASE64_CHARS[buf4[j]];
            i = 0;
        }
    }

    // Gestisci il padding
    if (i > 0) {
        for (int j = i; j < 3; j++) buf3[j] = 0;
        buf4[0] = (buf3[0] & 0xfc) >> 2;
        buf4[1] = ((buf3[0] & 0x03) << 4) + ((buf3[1] & 0xf0) >> 4);
        buf4[2] = ((buf3[1] & 0x0f) << 2) + ((buf3[2] & 0xc0) >> 6);
        for (int j = 0; j < i + 1; j++) result += BASE64_CHARS[buf4[j]];
        while (i++ < 3) result += '=';
    }

    return result;
}
