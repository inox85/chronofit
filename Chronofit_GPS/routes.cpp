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

AsyncWebServer server(80);
AsyncWebSocket ws("/ws");

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

  // --- Set Time Manuale --
  server.on("/setTime", HTTP_GET, [](AsyncWebServerRequest *request) {

    if(request->hasParam("mode"))
    {  
      int mode = request->getParam("mode")->value().toInt();

      if (mode == MODE_SYNC_MANUAL && request->hasParam("hour") && request->hasParam("minute") && request->hasParam("second")) {
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
    // 🔹 Salva e invia
    //checkPointRoutine(lineNumber);

    // 🔹 Risposta al client (opzionale)
    //String jsonMessage;
    //serializeJson(doc, jsonMessage); // senza type, se vuoi
    request->send(200, "text/plain", "CheckPoint received!");
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
        doc["t"] = "sessionCleared";

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
    lineIds[idx] = doc["ld"].as<int>();
    competitors[idx] = doc["c"].as<int>();
    delays[idx] = doc["d"].as<int>();

    broadCastSettings();

    #ifdef DEBUG
    Serial.printf("Ricevuti: %d, %d, %d, %d\n",
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
    int lineId = doc["lineId"];
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
        int lineId = doc["lineId"].as<int>();
        int competitor = doc["competitor"].as<int>();
        int hour = doc["hour"].as<int>();
        int minute = doc["minute"].as<int>();
        int second = doc["second"].as<int>();
        int millis = doc["millis"].as<int>();

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

            int currentIndex = entry["index"].as<int>();

            // --- Aggiorna se l'index corrisponde ---
            if (currentIndex == entryIndex) {
                entry["competitor"] = competitor;
                entry["lineNumber"] = lineNumber;
                entry["lineId"] = lineId;
                entry["hour"] = hour;
                entry["minute"] = minute;
                entry["second"] = second;
                entry["millis"] = millis;
                updated = true;
                debug("Riga aggiornata");
            }

            String outLine;
            serializeJson(entry, outLine);
            outFile.println(outLine);
        }
        // --- Se non trovato, aggiungi alla fine ---
        if (!updated) {
            DynamicJsonDocument newEntry(256);
            newEntry["index"] = entryIndex;
            newEntry["lineNumber"] = lineNumber;
            newEntry["lineId"] = lineId;
            newEntry["competitor"] = competitor;
            newEntry["hour"] = hour;
            newEntry["minute"] = minute;
            newEntry["second"] = second;
            newEntry["millis"] = millis;

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
    
    doc["timeBaseCal"] = calibrationFactor;
    doc["calPpsCount"] = calPpsCount;
    doc["calPpsTotal"] = CAL_WINDOW_SEC;
    doc["intTemp"] = readInternalTemp();

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
    else if (request->hasParam("auto")) {

        calRunning = request->getParam("auto")->value().toInt();

        request->send(200, "text/plain",
            "Cal running: " + String(calRunning));

      } 
      else {
          request->send(400, "text/plain", "Missing parameters");
      }
  });

}

String serializeSettings(){
  StaticJsonDocument<512> doc;
  doc["t"] = "paramsUpdated";
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

  String message;
  serializeJson(doc, message);

  return message;
}

void broadCastSettings(){
  String message = serializeSettings();
  ws.textAll(message);
}

