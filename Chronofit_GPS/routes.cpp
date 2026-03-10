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
  String chipIdStr = String((uint32_t)(chipId >> 32), HEX) + String((uint32_t)chipId, HEX);

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

bool postSessionJson(const char* url, const char* filePath) {

  // Controllo esistenza file
  if (!LittleFS.exists(filePath)) {
    Serial.println("❌ File non trovato: " + String(filePath));
    return false;
  }

  // Apro il file in lettura
  File file = LittleFS.open(filePath, "r");
  if (!file) {
    Serial.println("❌ Errore apertura file");
    return false;
  }

  // Creo HTTP client
  HTTPClient http;
  http.begin(url);
  http.addHeader("Content-Type", "application/json"); // JSON

  // POST leggendo il file direttamente come payload
  int httpResponseCode = http.sendRequest("POST", &file, file.size());

  file.close(); // chiudo file

  if (httpResponseCode > 0) {
    Serial.print("✅ POST OK, HTTP code: ");
    Serial.println(httpResponseCode);
    Serial.println(http.getString()); // risposta server
    http.end();
    return true;
  } else {
    Serial.print("❌ POST fallita: ");
    Serial.println(http.errorToString(httpResponseCode));
    http.end();
    return false;
  }
}


bool connectToWiFi(const char* ssid, const char* password, uint32_t timeoutMs) {

  String msgJson = serializeMessage("Connecting to WiFi for internet access...");
  ws.textAll(msgJson);

  WiFi.begin(ssid, password);

  unsigned long start = millis();

  Serial.print("Connessione a ");
  Serial.print(ssid);


  WiFi.onEvent([](WiFiEvent_t event) {
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      Serial.println("Connesso con IP");
        
      String msgJson = serializeMessage("WiFi connected with IP address");
      ws.textAll(msgJson);
    }
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {

    }
  });

  
  xTaskCreatePinnedToCore(
    internetCheckTask,
    "InternetCheck",
    4096,
    NULL,
    1,
    NULL,
    0   // core 0 (WiFi sta su core 0/1 senza problemi)
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
        lastSyncTrigger = micros64();
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
    
  });

  server.on("/checkPoint", HTTP_GET, [](AsyncWebServerRequest *request) {
    int lineNumber = 0;
    uint32_t mowMicros = micros64();
    if (request->hasParam("lineNumber")) {
        lineNumber = request->getParam("lineNumber")->value().toInt();
    }

    sensorTriggered[lineNumber] = true;
    sensorTime[lineNumber] = mowMicros;

    request->send(200, "text/plain", "CheckPoint received!");
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

  });

    // --- JSON completo ---
  server.on("/email", HTTP_GET, [](AsyncWebServerRequest *request) {

    if(internetOK && request->hasParam("address")){
      String emailAddress = request->getParam("address")->value();
      Serial.println("Richiesta invio mail da:");
      Serial.println(emailAddress);
      sendBrevoMailAsync(emailAddress);
    }

    request->send(200, "text/plain", "Email sended!");

  });

    // --- JSON completo ---
  server.on("/wifiCredential", HTTP_GET, [](AsyncWebServerRequest *request) {

    StaticJsonDocument<256> doc;
    
    doc["ssid"] = readStringFromSettings("ssid", "");
    doc["pw"] = readStringFromSettings("pw", "");

    String json;
    serializeJson(doc, json);

    request->send(200, "application/json", json);

  });


    // --- JSON completo ---
  server.on("/allSettings", HTTP_GET, [](AsyncWebServerRequest *request) {

    String message = serializeSettings();

    request->send(200, "text/plain", message);
    
    debug(message);

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
  });


  server.on("/setAttribute", HTTP_GET, [](AsyncWebServerRequest *request){

    #ifdef DEBUG
      Serial.print("URL richiesta: ");
      Serial.println(request->url());
    #endif

    if (request->hasParam("printEnabled")) {
      printEnabled = request->getParam("printEnabled")->value().toInt();
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

  });

  server.on("/syncTest", HTTP_GET, [](AsyncWebServerRequest *request){

    syncTestRequested = 1;
    actualSecond = -1;
    sweepBuzz();
    digitalWrite(12, HIGH);

    request->send(200, "text/plain", "Sync test started");

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
    });


  server.on("/downloadSession", HTTP_GET, [](AsyncWebServerRequest *request) {
  if (!LittleFS.exists("/session.json")) {
    request->send(404, "text/plain", "File non trovato");
    return;
  }
  request->send(LittleFS, "/session.json", "application/json");
  });

  server.on("/systemSettings", HTTP_GET, [](AsyncWebServerRequest *request) {

    StaticJsonDocument<512> doc;
    
    doc["tibeBaseCalCoeff"] = calibrationFactor;
    doc["calPpsCount"] = calPpsCount;
    doc["calPpsTotal"] = CAL_WINDOW_SEC;
    doc["cpuTemperature"] = readInternalTemp();
    
    String json;
    serializeJson(doc, json);

    request->send(200, "application/json", json);

  });

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

      writeIntToSettings("agingFactor", agingFactor);

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


void sendBrevoMail(String emailAddress) {
  Serial.println("Inizio invio mail!");

  WiFiClientSecure client;
  client.setInsecure();  // semplifica TLS

  Serial.println("Verifico connessione...");
  if (!client.connect(BREVO_HOST, BREVO_PORT)) {
    Serial.println("Connessione Brevo fallita");
    return;
  }
  Serial.println("OK");

  // Leggo il JSON ma lo invio come .txt
  String attachmentBase64 = fileToBase64("/session.json");

  Serial.println("Carico allegato...");

  if (attachmentBase64.length() == 0) {
    Serial.println("Allegato vuoto");
    return;
  }

  Serial.println("OK");

  float latitude = gps.location.isValid() ? gps.location.lat() : 0;
  float longitude = gps.location.isValid() ? gps.location.lng() : 0;

  String mapsLink = "https://www.google.com/maps/search/?api=1&query=" + String(latitude, 6) + "," + String(longitude, 6);
  Serial.println("Link creato!");

  String body =
    "{"
      "\"sender\":{"
        "\"name\":\"Chronofit\","
        "\"email\":\"inox85@gmail.com\""
      "},"
      "\"to\":[{"
        "\"email\":\"" + emailAddress + "\","
        "\"name\":\"Admin\""
      "}],"
      "\"subject\":\"File sessione di gara da Chronofit [ " 
          + String(latitude, 6) + ", " + String(longitude, 6) + "]\","
      "\"htmlContent\":\"<p>In allegato trovi il file di sessione.</p>"
        "<p>Visualizza la posizione su Google Maps: "
        "<a href=\\\"" + mapsLink + "\\\" target=\\\"_blank\\\">Apri Google Maps</a></p>\","
      "\"attachment\":[{"
        "\"content\":\"" + attachmentBase64 + "\","
        "\"name\":\"session.txt\""
      "}]"
    "}";

  Serial.println("Mail costruita!");
  client.print(
    "POST /v3/smtp/email HTTP/1.1\r\n"
    "Host: " BREVO_HOST "\r\n"
    "api-key: " BREVO_API_KEY "\r\n"
    "Content-Type: application/json\r\n"
    "Content-Length: " + String(body.length()) + "\r\n"
    "Connection: close\r\n\r\n" +
    body
  );

  Serial.println("Richiesta inviata a Brevo");

  // Lettura intestazioni HTTP
  while (client.connected()) {
    String line = client.readStringUntil('\n');
    if (line == "\r") break; // fine headers
  }

  // Leggi tutto il corpo (JSON di Brevo)
  String response = "";
  while (client.available()) {
    response += client.readString();
  }

  Serial.println("=== Risposta Brevo ===");
  Serial.println(response);

  // Analisi semplice: verifica se contiene "messageId"
  if (response.indexOf("messageId") >= 0) {
    Serial.println("Mail accettata");
    String msgJson = serializeMessage("Mail sent successfully!");
    ws.textAll(msgJson);
  } else {
    Serial.println("Errore invio mail!");
  }
  
}

void sendBrevoMailTask(void* param) {
    String email = *(String*)param;
    sendBrevoMail(email); // il tuo metodo attuale
    delete (String*)param;        // pulizia
    vTaskDelete(NULL);             // termina il task
}

void sendBrevoMailAsync(String email) {
    // copia la stringa perché il task lavora su puntatore
    String* emailCopy = new String(email);
    xTaskCreate(sendBrevoMailTask, "SendBrevoMail", 8192, emailCopy, 1, NULL);
}


