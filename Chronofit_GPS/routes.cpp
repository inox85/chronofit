#include "routes.h"
#include <ArduinoJson.h>
#include <LittleFS.h>
#include "globals.h"
#include <TimeLib.h>  // oppure #include <Time.h> se usi quella versione
#include <TinyGPSPlus.h>
#include "params.h"
#include "time_utils.h"
#include "debug.h"
#include <Update.h>
#include "printer.h"
#include "buzzer.h"
#include "settings.h"
#include "diagnostic.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "FS.h"
#include <WiFiClientSecure.h>
#include <NetworkClientSecure.h>
#include <base64.h>
#include "secrets.h"
#include "RTC.h"
#include "esp_wifi.h"
#include <time.h>
#include <ESP_Mail_Client.h>
#include "gps_custom.h"
#include "LedStrip.h"
#include "mqtt_manager.h"


SMTPSession smtp;

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

void activateAccessPoint(){
   // Imposta un IP statico per l’AP
  IPAddress local_IP(192, 168, 1, 1);
  IPAddress gateway(192, 168, 1, 1);
  IPAddress subnet(255, 255, 255, 0);

  if (!WiFi.softAPConfig(local_IP, gateway, subnet)) {
    debug("❌ Errore nella configurazione dell'IP statico");
  }

  uint64_t chipId = ESP.getEfuseMac();
  // Converti il chipId in una stringa esadecimale
  chipIdStr = String((uint32_t)(chipId >> 32), HEX) + String((uint32_t)chipId, HEX);

  // Crea l'SSID con il chipId
  String ssid_sn = String(ssid) + "_" + chipIdStr; 

  WiFi.softAP(ssid_sn);
  #ifdef DEBUG
    Serial.println("Access Point avviato");
    Serial.print("IP: ");
    Serial.println(WiFi.softAPIP());
  #endif

  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  registerRoutes(server, ws);

  server.begin();
}

void wifiRxActivity() { lastRxTime = millis(); }

void wifiTxActivity() { lastTxTime = millis(); }


static uint8_t reconnectAttempts = 0;
static const uint8_t MAX_ATTEMPTS = 5;

bool connectToWiFi(const char* ssid, const char* password, uint32_t timeoutMs) {
  String msgJson = serializeMessage("Connecting to WiFi for internet access...");
  ws.textAll(msgJson);
  startAttemptTime = millis();

  // ── connessione con o senza password ────────────────────────────────────────
  if (password == nullptr || strlen(password) == 0) {
    WiFi.begin(ssid);
    Serial.println("Connessione a rete aperta: " + String(ssid));
  } else {
    WiFi.begin(ssid, password);
    Serial.println("Connessione a rete protetta: " + String(ssid));
  }

  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    switch (event) {
      case ARDUINO_EVENT_WIFI_STA_CONNECTED:
        Serial.println("WiFi: associato all'AP");     
        break;
      case ARDUINO_EVENT_WIFI_STA_GOT_IP:
        Serial.println("WiFi: connesso, IP: " + WiFi.localIP().toString());
        ws.textAll(serializeMessage("✅ WiFi connected with IP address"));

        static bool mqttStarted = false;
        if (!mqttStarted) {
          mqttManagerBegin();  // _connect() viene chiamata automaticamente dal task
          mqttStarted = true;
        }
        break;
      case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: {
        uint8_t reason = info.wifi_sta_disconnected.reason;
        Serial.printf("❌ WiFi: disconnesso, reason=%d\n", reason);
        switch (reason) {
          case WIFI_REASON_AUTH_EXPIRE:
          case WIFI_REASON_AUTH_FAIL:
          case WIFI_REASON_4WAY_HANDSHAKE_TIMEOUT:
          case WIFI_REASON_NO_AP_FOUND:
            // credenziali errate o rete assente → stop definitivo
            reconnectAttempts = MAX_ATTEMPTS;  // ← forza lo stop invece di azzerare
            Serial.println("❌ WiFi: credenziali errate o rete non trovata");
            ws.textAll(serializeMessage("WiFi error: wrong credentials or AP not found"));
            break;
          default:
            if (reconnectAttempts < MAX_ATTEMPTS) {
              reconnectAttempts++;
              Serial.printf("🔄 WiFi: tentativo %d/%d...\n", reconnectAttempts, MAX_ATTEMPTS);
              delay(1000 * reconnectAttempts);
              WiFi.reconnect();
            } else {
              reconnectAttempts = 0;
              Serial.println("❌ WiFi: troppi tentativi falliti, arresto riconnessione");
              ws.textAll(serializeMessage("WiFi: max reconnect attempts reached"));
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

  xTaskCreatePinnedToCore(
    internetCheckTask,
    "InternetCheck",
    4096,
    NULL,
    1,
    NULL,
    0
  );
  return true;
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
      //client->text("Benvenuto!");  // messaggio di benvenuto al client
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

void registerRoutes(AsyncWebServer &server, AsyncWebSocket &ws) {

  ws.onEvent(onWsEvent);
  server.addHandler(&ws);

  // In registerRoutes(), aggiungere alla fine
  server.onNotFound([](AsyncWebServerRequest *request) {
    request->redirect("http://192.168.1.1");
  });

  server.on("/update.html", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(LittleFS, "/update.html", "text/html");
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
     request->send(LittleFS, "/index.html", "text/html");
  });

  server.on("/style.css", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(LittleFS, "/style.css", "text/css");
  });

  server.on("/script.js", HTTP_GET, [](AsyncWebServerRequest *request){
    request->send(LittleFS, "/script.js", "application/javascript");
  });

  server.on("/admin", HTTP_GET, [](AsyncWebServerRequest *request){
     request->send(LittleFS, "/admin.html", "text/html");
  });

  server.on("/setOffset", HTTP_GET, [](AsyncWebServerRequest *request) {
    if (request->hasParam("offset")) {
      String val = request->getParam("offset")->value();
      utcOffset = val.toInt();
      request->send(200, "text/plain", "Time offset updated.");
    } else {
      request->send(400, "text/plain", "Missing offset parameter.");
    }
  });

  server.on("/reset", HTTP_GET, [](AsyncWebServerRequest *request) {
    request->send(400, "text/plain", "Board reboot!");
    esp_restart();
  });

  // --- Set Time Manuale --
  server.on("/setTime", HTTP_GET, [](AsyncWebServerRequest *request) {

    if(request->hasParam("mode"))
    {  
      int mode = request->getParam("mode")->value().toInt();

      if (mode == MODE_SYNC_MANUAL && request->hasParam("hour") && request->hasParam("minute") && request->hasParam("second")) {
        lastSyncTrigger = esp_timer_get_time();
        temp_hh = request->getParam("hour")->value().toInt();
        temp_mm = request->getParam("minute")->value().toInt();
        temp_ss = request->getParam("second")->value().toInt();

        syncStatus = SYNC_MANUAL_SET;
        syncMode = MODE_SYNC_MANUAL;
        debug("Impostazione orario manuale!");

        writeIntToSettings("syncMode", syncMode);

        handleLineSync();

        request->send(200, "text/plain", "Time manually set");


      } else if (mode == MODE_SYNC_LINE && request->hasParam("hour") && request->hasParam("minute") && request->hasParam("second")){
        temp_hh = request->getParam("hour")->value().toInt();
        temp_mm  = request->getParam("minute")->value().toInt();
        temp_ss = request->getParam("second")->value().toInt();
        syncStatus = SYNC_WAIT_LINE_SIGNAL;
        syncMode = MODE_SYNC_LINE;
        utcOffset = 0;

        writeIntToSettings("syncMode", syncMode);

        debug("In attesa di sincronismo da linea!");
        request->send(200, "text/plain", "Wait line signal");



      } else if (mode == MODE_SYNC_GPS && request->hasParam("gpsInterval") && request->hasParam("utcOffset")){

        syncStatus = SYNC_FIRST_GPS_SYNC;
        syncMode = MODE_SYNC_GPS;
        GPSRefreshInterval = request->getParam("gpsInterval")->value().toInt();
        utcOffset = request->getParam("utcOffset")->value().toInt();

        writeIntToSettings("syncMode", syncMode);
        writeIntToSettings("refInt", GPSRefreshInterval);
        writeIntToSettings("utcOffset", utcOffset);
        
        debug("Attesa sincronizzazione GPS");
        request->send(200, "text/plain", "Wait GPS");

      }
      else if (mode == MODE_ELAPSED_TIME){

        syncStatus = ELAPSED_WAITING_START;
        syncMode = MODE_ELAPSED_TIME;
        temp_hh = 0;
        temp_mm  = 0;
        temp_ss = 0;

        debug("Attesa di un segnale di start");
        request->send(200, "text/plain", "Wait GPS");

      }
    } else {
      request->send(400, "text/plain", "Missed params");
    }
    wifiRxActivity();
  });

  server.on("/checkPoint", HTTP_GET, [](AsyncWebServerRequest *request) {
    int lineNumber = 0;
    uint64_t mowMicros = esp_timer_get_time();
    if (request->hasParam("lineNumber")) {
        lineNumber = request->getParam("lineNumber")->value().toInt();
    }

    sensorTriggered[lineNumber] = true;
    sensorTime[lineNumber] = mowMicros;
    request->send(200, "text/plain", "CheckPoint received!");
    wifiRxActivity();
  });

  server.on("/wifiConnect", HTTP_GET, [](AsyncWebServerRequest *request) {
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

    // --- JSON completo ---
  server.on("/time", HTTP_GET, [](AsyncWebServerRequest *request) {

    StaticJsonDocument<512> doc;
    
    PreciseTime t = getPreciseTime();

    doc["hh"] = t.hh;
    doc["mm"] = t.mm;
    doc["ss"] = t.ss;
    doc["ms"] = t.ms;

    String json;
    serializeJson(doc, json);

    request->send(200, "application/json", json);
    wifiRxActivity();
  });

    // --- JSON completo ---
  server.on("/email", HTTP_GET, [](AsyncWebServerRequest *request) {

    if(internetOK && request->hasParam("address")){
      String emailAddress = request->getParam("address")->value();
      Serial.println("Richiesta invio mail da:");
      Serial.println(emailAddress);
      sendMailAsync(emailAddress);
    }

    request->send(200, "text/plain", "Email sended!");
    wifiRxActivity();
  });

    // --- JSON completo ---
  server.on("/wifiCredential", HTTP_GET, [](AsyncWebServerRequest *request) {

    StaticJsonDocument<256> doc;
    
    doc["ssid"] = readStringFromSettings("ssid", "");
    doc["pw"] = readStringFromSettings("pw", "");

    String json;
    serializeJson(doc, json);

    request->send(200, "application/json", json);
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
          request->send(200, "application/json", "{}");
          return;
      }

      // ✅ ESPAsyncWebServer gestisce apertura/chiusura internamente
      request->send(LittleFS, path, "application/json");
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

  server.on("/clearSession", HTTP_GET, [&](AsyncWebServerRequest *request) {
    if (LittleFS.exists("/session.json")) {
      if (LittleFS.remove("/session.json")) {
        request->send(200, "text/plain", "✅ Sessione cancellata con successo!");
        Serial.println("Sessione cancellata dal filesystem.");
        sessionRowIndex = 0;
        StaticJsonDocument<512> doc;
        doc["t"] = TYPE_SESSION_CLEARED;

        String message;
        serializeJson(doc, message);

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



  server.on("/print", HTTP_GET, [](AsyncWebServerRequest *request){
    Serial.print("URL richiesta: ");
    Serial.println(request->url());

    String text = "";
    int cr = 1;

    if (request->hasParam("text")) {
      text = request->getParam("text")->value();
    }
    if (request->hasParam("cr")) {
      cr = request->getParam("cr")->value().toInt();
    }


    Serial.printf("Ricevuti: %s, %d\n", text.c_str(), cr);

    // 🔧 GPS: commenta temporaneamente la chiamata
    printOnPrinter(text, cr);

    request->send(200, "text/plain", "Printed successfully");
    wifiRxActivity();
  });


  server.on("/setAttribute", HTTP_GET, [](AsyncWebServerRequest *request){

    #ifdef DEBUG
      Serial.print("URL richiesta: ");
      Serial.println(request->url());
    #endif

    if (request->hasParam("printEnabled")) {
      printEnabled = request->getParam("printEnabled")->value().toInt();
    }

    if (request->hasParam("buzzerEnable")) {
      buzzerActive = request->getParam("buzzerEnable")->value().toInt();
    }

    if(request->hasParam("stationName"))
    {
      stationName = request->getParam("stationName")->value();
      debug("Impostazione nome stazione!");
      debug(stationName);
      if(printEnabled){
        printOnPrinter("Station name:", 0);
        printOnPrinter(stationName, 1);
      }
      request->send(200, "text/plain", "Station name set!");
    }

    broadCastSettings();
    #ifdef DEBUG
      Serial.printf("Ricevuti: %d, %d, %d\n", printEnabled, syncEnabled, utcOffset);
    #endif

    request->send(200, "text/plain", "Saved sucessfully");
    wifiRxActivity();
  });

  server.on("/syncTest", HTTP_GET, [](AsyncWebServerRequest *request){

    syncTestRequested = 1;
    actualSecond = -1;
    sweepBuzz();
    digitalWrite(12, HIGH);

    request->send(200, "text/plain", "Sync test started");
    wifiRxActivity();
  });


  server.on("/checkPointFields", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL,
  [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {

    String body;
    for (size_t i = 0; i < len; i++) body += (char)data[i];
    debug("Ricevuti nuovi settings: " + body);

    // Puoi poi parsarlo con ArduinoJson
    DynamicJsonDocument doc(1024);
    deserializeJson(doc, body);
    int line = doc["l"].as<int>();
    int idx = line - 1;
    lineIds[idx] = doc["ld"].as<String>();
    competitors[idx] = doc["c"].as<int>();
    delays[idx] = doc["d"].as<int>();

    broadCastSettings();

    #ifdef DEBUG
    Serial.printf("Ricevuti: %d, %s, %d, %d\n",
                    line, lineIds[idx], competitors[idx], delays[idx]);
    #endif
    // E qui elabori o invii via seriale, BLE, ecc.
    request->send(200, "text/plain", "Saved sucessfully"); 
    wifiRxActivity();
  });

  server.on("/sendCheckPointRow", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {

    String body;
    for (size_t i = 0; i < len; i++) body += (char)data[i];
    debug("Ricevuto JSON per stampa riga : " + body);

    // Puoi poi parsarlo con ArduinoJson
    DynamicJsonDocument doc(256);
    deserializeJson(doc, body);

    int id  = doc["index"];
    String lineId = doc["lineId"];
    int competitor = doc["competitor"];
    int hour = doc["hour"];
    int minute = doc["minute"];
    int second = doc["second"];
    int millis = doc["millis"];

    if(printEnabled){
      printFormatted(id, lineId, competitor, hour, minute, second, millis, 1);
    }

    char buffer[40];

    sprintf(buffer, "%03d-%05d-%02d%02d%02d%03d-000-000", lineId, competitor, hour, minute, second, millis);

    String timeString = String(buffer);

    Serial.println(timeString);  // stampa "007-00042"

    request->send(200, "text/plain", "JSON ricevuto con successo");
    wifiRxActivity();
  });

  server.on("/updateCheckPointRow", HTTP_POST, [](AsyncWebServerRequest *request){}, NULL,
    [](AsyncWebServerRequest *request, uint8_t *data, size_t len, size_t index, size_t total) {

        // --- Parse JSON ricevuto ---
        DynamicJsonDocument doc(256);
        DeserializationError err = deserializeJson(doc, data, len);
        if (err) {
            request->send(400, "text/plain", "JSON non valido");
            return;
        }

        int entryIndex = doc["index"].as<int>();
        int lineNumber = doc["lineNumber"].as<int>();
        String lineId = doc["lineId"].as<String>();
        int competitor = doc["competitor"].as<int>();
        int hour = doc["hour"].as<int>();
        int minute = doc["minute"].as<int>();
        int second = doc["second"].as<int>();
        int millis = doc["millis"].as<int>();
        int penality = doc["penality"].as<int>();

        #ifdef DEBUG
          Serial.printf("Aggiorno riga index=%d,  lineNumber=%d, lineId=%d, competitor=%d, %02d:%02d.%d\n",
                      entryIndex, lineNumber, lineId, competitor, hour, minute, millis);
        #endif

        if(printEnabled){ 
          printOnPrinter("Row edited:", 1);
          printFormatted(entryIndex, lineId, competitor, hour, minute, second, millis, 1);
        }

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

        while (inFile.available()) {
            String lineStr = inFile.readStringUntil('\n');
            if (lineStr.isEmpty()) continue;

            DynamicJsonDocument entry(256);
            if (deserializeJson(entry, lineStr)) continue;

            int currentIndex = entry[INDEX_FIELD].as<int>();

            // --- Aggiorna se l'index corrisponde ---
            if (currentIndex == entryIndex) {
                entry[LINE_NUMBER_FIELD] = lineNumber;
                entry[LINE_ID_FIELD] = lineId;
                entry[COMPETITOR_FIELD] = competitor;
                entry[HOUR_FIELD] = hour;
                entry[MINUTE_FIELD] = minute;
                entry[SECOND_FIELD] = second;
                entry[MILLIS_FIELD] = millis;
                entry[PENALITY_FIELD] = penality;
                
                updated = true;
                debug("Riga aggiornata");
                broadCastRowEdited(entry);
            }

            String outLine;
            serializeJson(entry, outLine);
            outFile.println(outLine);
            
        }
        // --- Se non trovato, aggiungi alla fine ---
        if (!updated) {
            DynamicJsonDocument newEntry(256);
            newEntry[INDEX_FIELD] = entryIndex;
            newEntry[LINE_NUMBER_FIELD] = lineNumber;
            newEntry[LINE_ID_FIELD] = lineId;
            newEntry[COMPETITOR_FIELD] = competitor;
            newEntry[HOUR_FIELD] = hour;
            newEntry[MINUTE_FIELD] = minute;
            newEntry[SECOND_FIELD] = second;
            newEntry[MILLIS_FIELD] = millis;
            newEntry[PENALITY_FIELD] = penality;

            String newLine;
            serializeJson(newEntry, newLine);
            outFile.println(newLine);
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
 
    DynamicJsonDocument doc(4096);
  
    // ── dati esistenti ──────────────────────────────────────
    doc["timeCal"]             = calibrationFactor;
    doc["sn"]                  = chipIdStr;
    doc["cpuTemp"]             = readInternalTemp();
    doc["rtcAging"]            = readAgingOffset();
    doc["rtcTemp"]             = rtc_get_temperature();
    doc["fwVer"]               = String(FW_VERSION);
    doc["devName"]             = String(DEV_NAME);
    doc["hwName"]              = String(HW_NAME);
    doc["freeRam"]             = ESP.getFreeHeap();
    doc["minFreeRam"]          = ESP.getMinFreeHeap();
    doc["lastDeltaPPSSync"]    = lastDeltaPPSSync;
    doc["usDriftAtPPS"]        = usDriftAtPPS;
    doc["extimatedDriftByPPS"] = extimatedDriftByPPS;
  
    size_t totalBytes = LittleFS.totalBytes();
    size_t usedBytes  = LittleFS.usedBytes();
    doc["fsTotalBytes"] = totalBytes;
    doc["fsUsedBytes"]  = usedBytes;
    doc["fsFreeBytes"]  = totalBytes - usedBytes;
  
    JsonArray files = doc.createNestedArray("files");
    File root = LittleFS.open("/");

    File file = root.openNextFile();

    while (file) {
      JsonObject obj = files.createNestedObject();
      obj["name"] = file.name();
      obj["size"] = file.size();
      file = root.openNextFile();
    }

    file.close();  // ✅
    root.close();  // ✅
  
    // ── dati GPS base ────────────────────────────────────────
    JsonObject gpsObj = doc.createNestedObject("gps");
  
    gpsObj["fixValid"]    = gps.location.isValid();
    gpsObj["fixAge"]      = gps.location.age();
    gpsObj["lat"]         = gps.location.isValid() ? gps.location.lat()      : 0.0;
    gpsObj["lng"]         = gps.location.isValid() ? gps.location.lng()      : 0.0;
    gpsObj["altM"]        = gps.altitude.isValid()  ? gps.altitude.meters()  : 0.0;
    gpsObj["speedKmh"]    = gps.speed.isValid()     ? gps.speed.kmph()       : 0.0;
    gpsObj["courseDeg"]   = gps.course.isValid()    ? gps.course.deg()       : 0.0;
    gpsObj["hdop"]        = gps.hdop.isValid()      ? gps.hdop.hdop()        : 99.99;
    gpsObj["satsInUse"]   = gps.satellites.isValid() ? (int)gps.satellites.value() : 0;
    gpsObj["charsProc"]   = gps.charsProcessed();
    gpsObj["sentencesOk"] = gps.sentencesWithFix();
    gpsObj["failedCksum"] = gps.failedChecksum();
  
    // Data/ora GPS
    if (gps.date.isValid() && gps.time.isValid()) {
      char dtBuf[32];
      snprintf(dtBuf, sizeof(dtBuf), "%04d-%02d-%02dT%02d:%02d:%02d",
        gps.date.year(), gps.date.month(), gps.date.day(),
        gps.time.hour(), gps.time.minute(), gps.time.second());
      gpsObj["utcTime"] = dtBuf;
    } else {
      gpsObj["utcTime"] = "";
    }
  
    // ── satelliti GPS ────────────────────────────────────────
    SatInfo satBuf[GSV_MAX_SAT];
    int n = gpsParser.getGPSSats(satBuf, GSV_MAX_SAT);
    gpsObj["gpTotalVisible"] = atoi(gpsParser.gpTotalSats.value());
    JsonArray arr = gpsObj.createNestedArray("gpSats");
    for (int i = 0; i < n; i++) {
      if (!satBuf[i].valid) continue;
      JsonObject s = arr.createNestedObject();
      s["prn"]  = satBuf[i].prn;
      s["elev"] = satBuf[i].elevation;
      s["az"]   = satBuf[i].azimuth;
      s["snr"]  = satBuf[i].snr;
    }
  
    String json;
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
    file.close();
    wifiRxActivity();
  });

  // ── DELETE ──────────────────────────────────────────────────
server.on("/delete", HTTP_DELETE, [](AsyncWebServerRequest *request) {
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
    else if (request->hasParam("agingFactor")) {

      int8_t agingFactor = request->getParam("agingFactor")->value().toInt();

      writeIntToSettings("rtcAging", agingFactor);

      writeAgingOffset(agingFactor);

      int8_t agingRegVal = readAgingOffset();

      Serial.println(agingRegVal);

      request->send(200, "text/plain",
          "Aging factor: " + String(agingFactor));

    }  
    else {
        request->send(400, "text/plain", "Missing parameters");
    }
  });
  wifiRxActivity();
}

String serializeSettings(){
  StaticJsonDocument<512> doc;
  doc["t"] = TYPE_PARAMS_UPDATED;
  doc["c1"] = competitors[0];
  doc["c2"] = competitors[1];
  doc["c3"] = competitors[2];
  doc["c4"] = competitors[3];

  doc["l1"] = lineIds[0];
  doc["l2"] = lineIds[1];
  doc["l3"] = lineIds[2];
  doc["l4"] = lineIds[3];

  doc["d1"] = delays[0];
  doc["d2"] = delays[1];
  doc["d3"] = delays[2];
  doc["d4"] = delays[3];

  doc["utc"] = utcOffset;
  doc["print"] = printEnabled;
  doc["sm"] = syncMode;
  doc["ss"] = syncStatus;
  doc["sn"] = stationName;
  doc["si"] = GPSRefreshInterval;
  doc["pw"] = powerSource;
  doc["bz"] = buzzerActive;

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


void broadCastRowEdited(const DynamicJsonDocument& entry){
  StaticJsonDocument<512> doc;
  doc["t"] = TYPE_ROW_UPDATED;
  doc[INDEX_FIELD] = entry[INDEX_FIELD];
  doc[LINE_NUMBER_FIELD] = entry[LINE_NUMBER_FIELD];
  doc[LINE_ID_FIELD] = entry[LINE_ID_FIELD];
  doc[COMPETITOR_FIELD] = entry[COMPETITOR_FIELD];
  doc[HOUR_FIELD] = entry[HOUR_FIELD];
  doc[MINUTE_FIELD] = entry[MINUTE_FIELD];
  doc[SECOND_FIELD] = entry[SECOND_FIELD];
  doc[MILLIS_FIELD] = entry[MILLIS_FIELD];
  doc[PENALITY_FIELD] = entry[PENALITY_FIELD];

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


String fileToBase64(const char *path) {
  File file = LittleFS.open(path, "r");
  if (!file) return "";

  String encoded;
  uint8_t buf[96];  // multiplo di 3

  while (file.available()) {
    int len = file.read(buf, sizeof(buf));
    encoded += base64::encode(buf, len);
  }

  file.close();
  return encoded;
}



void smtpCallback(SMTP_Status status) {
  Serial.println(status.info());
  if (status.success()) {
    Serial.println("────────────────────────");
    Serial.printf("Messaggi inviati: %d\n", status.completedCount());
    Serial.printf("Messaggi falliti: %d\n", status.failedCount());
    Serial.println("────────────────────────");
  }
}

void syncTime() {
  Serial.println("[TIME] Sincronizzazione NTP...");

  // Prova più server in ordine
  configTime(0, 0, "time.google.com", "time.cloudflare.com", "time.windows.com");
  setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
  tzset();

  struct tm timeinfo;
  int retry = 0;
  while (!getLocalTime(&timeinfo) && retry < 40) {
    Serial.print(".");
    delay(1000);
    retry++;
  }

  if (retry >= 40) {
    // Fallback: ora manuale aggiornata
    Serial.println("\n[TIME] NTP non raggiungibile, uso ora manuale...");
    struct tm t = {0};
    t.tm_year = 2026 - 1900;
    t.tm_mon  = 2;   // marzo
    t.tm_mday = 18;
    t.tm_hour = 15;
    t.tm_min  = 0;
    t.tm_sec  = 0;
    time_t epoch = mktime(&t);
    struct timeval tv = { epoch, 0 };
    settimeofday(&tv, nullptr);
    Serial.println("[TIME] ✅ Ora impostata manualmente (fallback)");
  } else {
    Serial.printf("\n[TIME] ✅ Ora: %02d/%02d/%04d %02d:%02d:%02d\n",
      timeinfo.tm_mday, timeinfo.tm_mon + 1, timeinfo.tm_year + 1900,
      timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
  }
}

void sendEmail(String emailAddress, const char* subject, const char* body,
               const char* attachPath = nullptr,
               const char* attachName = nullptr,
               const char* attachMime = nullptr) {

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MAIL] WiFi non connesso!");
    return;
  }

  // Sessione SMTP
  ESP_Mail_Session session;
  session.server.host_name = GMAIL_SMTP_HOST;
  session.server.port      = GMAIL_SMTP_PORT;
  session.login.email      = GMAIL_SMTP_USER;
  session.login.password   = GMAIL_SMTP_PASSWORD;
  session.login.user_domain = "";

  Serial.printf("EMAIL: [%s]\n", emailAddress.c_str());

  SMTP_Message message;
  message.sender.name  = "⏱️Chronofit";
  message.sender.email = GMAIL_SMTP_USER;
  message.subject      = subject;
  message.addRecipient("Chrono", emailAddress);
  message.text.content = body;
  message.text.charSet = "utf-8";

  // Allegato (opzionale)
  if (attachPath != nullptr && LittleFS.exists(attachPath)) {

    SMTP_Attachment attachment;
    attachment.descr.filename       = attachName;
    attachment.descr.mime           = attachMime;
    attachment.file.path            = attachPath;
    attachment.file.storage_type    = esp_mail_file_storage_type_flash;
    attachment.descr.transfer_encoding = Content_Transfer_Encoding::enc_base64;
    message.addAttachment(attachment);
    Serial.printf("[MAIL] Allegato: %s\n", attachPath);

  } else if (attachPath != nullptr) {
    Serial.printf("[MAIL] ⚠️ File non trovato: %s, invio senza allegato\n", attachPath);
  }

  smtp.debug(1);
  smtp.callback(smtpCallback);

  Serial.println("[MAIL] Connessione a Gmail...");
  if (!smtp.connect(&session)) {
    Serial.printf("[MAIL] ❌ Connessione fallita: %s\n", smtp.errorReason().c_str());
    String msgJson = serializeMessage("❌ Mail sent failed!");
    ws.textAll(msgJson);
    return;
  }

  if (!MailClient.sendMail(&smtp, &message)) {
    Serial.printf("[MAIL] ❌ Invio fallito: %s\n", smtp.errorReason().c_str());
  } else {
    Serial.println("[MAIL] ✅ Mail inviata con successo!");
    String msgJson = serializeMessage("✅ Mail sent successfully!");
    ws.textAll(msgJson);
  }

  smtp.closeSession();
  wifiTxActivity();
}


void sendMailTask(void* param) {
    char* email = (char*)param;

    syncTime();

    float lat = gps.location.lat();
    float lon = gps.location.lng();

    char latitude[16];
    char longitude[16];

    snprintf(latitude, sizeof(latitude), "%.6f", lat);
    snprintf(longitude, sizeof(longitude), "%.6f", lon);

    char body[512];

    snprintf(body, sizeof(body),
        "Gentile utente,\r\n"
        "\r\n"
        "la presente per trasmettere in allegato il file relativo alla sessione registrata.\r\n"
        "\r\n"
        "Coordinate geografiche della sessione:\r\n"
        "• Latitudine: %s\r\n"
        "• Longitudine: %s\r\n"
        "\r\n"
        "https://www.google.com/maps/search/?api=1&query=%s,%s\r\n"
        "\r\n"
        "Cordiali saluti,\r\n"
        "Chronofit",
        latitude, longitude, latitude, longitude
    );

    char subject[128];

    snprintf(subject, sizeof(subject),
        "Chronofit - Session file [%s;%s]",
        latitude, longitude
    );

    sendEmail(email, subject, body,
              "/session.json",
              "session.txt",
              "text/plain");

    free(email);   // ✅ corretto per strdup
    vTaskDelete(NULL);
}

void sendMailAsync(String email) {
    char* emailCopy = strdup(email.c_str());  // ✅ corretto
    xTaskCreate(sendMailTask, "sendMailTask", 8192, emailCopy, 1, NULL);
}

