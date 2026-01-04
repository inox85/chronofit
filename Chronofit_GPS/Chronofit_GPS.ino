#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <TinyGPSPlus.h>
#include <TimeLib.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <DNSServer.h>
#include <Update.h>
#include <SoftwareSerial.h>
#include "params.h"
#include "esp_wifi.h"
#include "routes.h"
#include "globals.h"
#include "constants.h"
#include "time_utils.h"
#include "debug.h"
#include "services_serial.h"
#include "buzzer.h"
#include "diagnostic.h"
#include "printer.h"
#include "settings.h"

#define DEBUG
#define PROTOTYPE

void IRAM_ATTR sensorISR(void *arg) {
    int i = (int)arg;

    bool current = digitalRead(sensorsPins[i]);

    // fronte HIGH -> LOW
    if (lastSensorState[i] == HIGH && current == LOW) {
        unsigned long now = millis();
        uint64_t nowMicros = micros64();

        if ((unsigned long)(now - lastSensorsSignal[i]) > delays[i]) {
            sensorTime[i] = nowMicros;
            sensorTriggered[i] = true;
            lastSensorsSignal[i] = now;
        }
    }

    lastSensorState[i] = current;
}

// --- ISR PPS ---
void IRAM_ATTR onPpsInterrupt() {
  lastSyncTrigger = micros64();
  ppsTriggered = true;
  ppsCounter++;
}

void setup() {
  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm
  Serial.begin(9600, SERIAL_8N1);
  ServicesSerial.begin(9600, SERIAL_8N1, GPS_RX, PRINTER_TX);

  calibrationFactor = readDoubleFromSettings("timeCal", 1.0);
  
  syncMode = readIntFromSettings("syncMode", MODE_SYNC_MANUAL);
  if(syncMode == MODE_SYNC_GPS)
    syncStatus = SYNC_FIRST_GPS_SYNC;
  GPSRefreshInterval = readIntFromSettings("refInt", 0);
  utcOffset = readIntFromSettings("utcOffset", 0);

  Serial.println();
  Serial.print("Time cal factor: ");
  Serial.println(calibrationFactor, 10);

  pinMode(PPS_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(PPS_PIN), onPpsInterrupt, RISING);

  buzzerInit(BUZZER);

  sweepBuzz();

  pinMode(0, INPUT);
  pinMode(12, OUTPUT);
  digitalWrite(12, LOW);
  
  for (int i = 0; i < 4; i++) {
    pinMode(sensorsPins[i], INPUT_PULLUP);
    lastSensorState[i] = digitalRead(sensorsPins[i]);

    attachInterruptArg(
      sensorsPins[i],
      sensorISR,
      (void*)i,
      CHANGE
    );
  }

  configFS();

  sessionRowIndex = getLastSessionRowIndex();
  
  // --- WiFi AP ---
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

    // Registra tutte le route
  registerRoutes(server, ws);

  server.begin();

}

void configFS(){
  if (!LittleFS.begin(true)) {  // true = formatta se non montato!
    Serial.println("Errore nel montaggio di LittleFS");
    return;
  }

  server.serveStatic("/", LittleFS, "/");
}


void loop() {

  dnsServer.processNextRequest();

  if(syncStatus != SYNC_WAIT_LINE_SIGNAL){
    processServicesSerial();

    if(((millis() - lastGPSSync)/60000 >= GPSRefreshInterval || GPSRefreshInterval == 0) 
        && syncMode == MODE_SYNC_GPS) {
      syncStatus = SYNC_WAIT_GPS;
    }
  }

  // 🔹 Gestione PPS GPS (unico punto che consuma ppsTriggered)

  if (ppsTriggered && gps.time.isUpdated() && syncMode == MODE_SYNC_GPS) {
    
      
      uint64_t thisPpsUs = lastSyncTrigger;
      ppsTriggered = false;   // consumato QUI, una sola volta

      if (syncStatus == SYNC_WAIT_GPS || syncStatus == SYNC_FIRST_GPS_SYNC) {
        
        // if (testOnSync && syncStatus != SYNC_FIRST_GPS_SYNC) {
        //     sensorTime[4] = thisPpsUs;
        //     sensorTriggered[4] = true;
        //     handleSensorTrigger();
        //     //buzzerBeep(100, 3, 50, 500, 128);
        // }

        syncReference = thisPpsUs;
        syncStatus = SYNC_GPS_SYNCED;
        handlePpsSync();          // NON deve più toccare ppsTriggered
        lastGPSSync = millis();
      }

      // ------------------------------------------------
      // 🔹 CALIBRAZIONE QUARZO (SEMPRE)
      // ------------------------------------------------
      if (calRunning) {

          calPpsCount++;
          Serial.print("CAL PPS: ");
          Serial.println(calPpsCount);

          if (calPpsCount >= CAL_WINDOW_SEC) {   // 600 PPS = 10 minuti
              calRunning = false;

              int32_t errorUs = (int32_t)CAL_WINDOW_US - (int32_t)(thisPpsUs - calStartUs);

              Serial.print("Cal start us: ");
              Serial.println(calStartUs);
              Serial.print("Cal end us: ");
              Serial.println(thisPpsUs);
              Serial.print("Calibration error (us): ");
              Serial.println(errorUs);

              setTimeBaseCalibration(errorUs, calPpsCount / 60);

              sweepBuzz();
          }

      } else {
          // avvio nuova finestra di calibrazione
          calStartUs = thisPpsUs;
          calPpsCount = 0;
      }
  }


  handleSensorTrigger();

  PreciseTime t = getPreciseTime();
  actualSecond = t.ss;

  if(actualSecond != lastBroadCastSecond && t.ms < 10){
    lastBroadCastSecond = actualSecond;
    broadcastTime();  
  }

  if(actualSecond == 0){
    ppsCounter = 0;
  }

  //Serial.println(ppsCounter);

  if(!syncTestRequested && (!digitalRead(0) || analogRead(35) > 500)){
    if(syncMode == MODE_SYNC_GPS){
      sweepBuzz();   
      syncTestRequested = 1;
      digitalWrite(12, HIGH);
    }
    else{
      buzzerBeep(50,1,0,250,128);
    }
  }

  if (syncTestRequested && syncStatus == SYNC_GPS_SYNCED) {
    if((ppsCounter % 60) == 0){
      syncTestRequested = 0;
      digitalWrite(12, LOW);
      sensorTime[4] = lastSyncTrigger;
      sensorTriggered[4] = true;
    }
  }


  checkPowerSource();

}



void handleSensorTrigger(){
  for (int i = 0; i < 5; i++) {
    if (sensorTriggered[i]) {
      sensorTriggered[i] = false;           // reset del flag
      playBinary(i+1);
      if (syncMode == MODE_SYNC_LINE && syncStatus == SYNC_WAIT_LINE_SIGNAL){
        lastSyncTrigger = sensorTime[i];    //lineTriggered = true;
        syncReference = lastSyncTrigger;
        handleLineSync();
      }else{
        if(i == 4){
          printOnPrinter("---GPS SYNC TEST START---", 1);
        }
        checkPointRoutine(i);
        if(i == 4){
          printOnPrinter("---GPS SYNC TEST END---", 1);
        }
      }
    }
  }
}

void processServicesSerial() {
  while (ServicesSerial.available()) {
    char c = ServicesSerial.read();
    gps.encode(c);  // decodifica NMEA
    //Serial.print(c); // opzionale per debug
  }
}

