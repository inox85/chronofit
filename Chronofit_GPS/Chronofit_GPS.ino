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
#include "RTC.h"

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

void IRAM_ATTR onSecondTick(){
  lastRTCTrigger = micros64();
  RTCTriggered = true;
}

void setup() {
  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm
  Serial.begin(9600, SERIAL_8N1);
  ServicesSerial.begin(9600, SERIAL_8N1, GPS_RX, PRINTER_TX);

  rtc_init(SDA_PIN, SCL_PIN, 400000);
  rtc_enable_1hz();

  pinMode(SQW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SQW_PIN), onSecondTick, FALLING);

  rtc_set_datetime(2026, 2, 25, 12, 0, 0); // solo una volta

  pinMode(LED_1, OUTPUT);
  pinMode(LED_2, OUTPUT);
  pinMode(LED_3, OUTPUT);

  digitalWrite(LED_1, HIGH);
  digitalWrite(LED_2, HIGH);
  digitalWrite(LED_3, HIGH);

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

  printerInit();

  sweepBuzz();

  pinMode(0, INPUT);

  
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

  activateAccessPoint();

  delay(1000);
  digitalWrite(LED_1, LOW);
  digitalWrite(LED_2, LOW);
  digitalWrite(LED_3, LOW);
  
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

  bool validNmea = false;

  validNmea = processServicesSerial();

  if(RTCTriggered){
    RTCTriggered = false;
    handleRTCSync();
  }

  if((millis() - lastClientCheck) > LAST_CLIENT_CHECK){
    lastClientCheck = millis();
    digitalWrite(LED_1, checkConnectedClient());
  }
  
  if(syncStatus != SYNC_WAIT_LINE_SIGNAL){
    if(((millis() - lastGPSSync)/60000 >= GPSRefreshInterval || GPSRefreshInterval == 0) 
        && syncMode == MODE_SYNC_GPS) {
      syncStatus = SYNC_WAIT_GPS;
    }
  }

  // 🔹 Gestione PPS GPS (unico punto che consuma ppsTriggered)
  uint64_t delta = lastNmeaValid - lastSyncTrigger;

  if (ppsTriggered && (delta >=20000 && delta <= 100000) && validNmea && gps.time.isUpdated() && syncMode == MODE_SYNC_GPS) {
      
      uint64_t thisPpsUs = lastSyncTrigger;
      ppsTriggered = false;   // consumato QUI, una sola volta

      if (syncStatus == SYNC_WAIT_GPS || syncStatus == SYNC_FIRST_GPS_SYNC) {
        syncReference = thisPpsUs;
        syncStatus = SYNC_GPS_SYNCED;
        handlePpsSync();          // NON deve più toccare ppsTriggered
        lastGPSSync = millis();
      }

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

            writeDoubleToSettings("calTempRef", readInternalTemp());

            setTimeBaseCalibration(errorUs, calPpsCount / 60);

            sweepBuzz();
          }

      } else {
          // avvio nuova finestra di calibrazione
          calStartUs = thisPpsUs;
          calPpsCount = 0;
      }
  }



  PreciseTime t = getPreciseTime();
  actualSecond = t.ss;

  if(actualSecond != lastBroadCastSecond && t.ms < 10){
    lastBroadCastSecond = actualSecond;
    broadcastTime();  
  }
  
  digitalWrite(LED_3, syncTestRequested);
  
  if(actualSecond == 0){
    ppsCounter = 0;
  }

  // if(!syncTestRequested && (!digitalRead(0) || analogRead(35) > 500)){
  //   if(syncMode == MODE_SYNC_GPS){
  //     sweepBuzz();   
  //     syncTestRequested = 1;  
  //   }
  //   else{
  //     buzzerBeep(50,1,0,250,128);
  //   }
  // }

  if (syncTestRequested && syncStatus == SYNC_GPS_SYNCED) { 
    PreciseTime time = getPreciseTime();
    
    int pNum = 60;
    if (time.ms < 500){
        pNum = 61;
    }

    if((ppsCounter % pNum) == 0 && gps.time.isUpdated()){
      syncTestRequested = 0;
      
      sensorTime[4] = lastSyncTrigger;
      sensorTriggered[4] = true;
    }
    
  }

  handleSensorTrigger();
  
  checkPowerSource();

}

bool checkConnectedClient(){
  int n = WiFi.softAPgetStationNum();
  if(n > 0)
  {
    return true;
  }
  return false;
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
      }else if(syncMode == MODE_ELAPSED_TIME && syncStatus == ELAPSED_WAITING_START)
      {
        lastSyncTrigger = sensorTime[i];    //lineTriggered = true;
        syncReference = lastSyncTrigger;
        handleLineSync();
        checkPointRoutine(i);
      }else{
        if(i == 4 && printEnabled){
          printOnPrinter("---GPS SYNC TEST START---", 1);
        }
        checkPointRoutine(i);
        if(i == 4 && printEnabled){
          printOnPrinter("---GPS SYNC TEST END---", 1);
        }
      }
    }
  }
}

bool processServicesSerial() {
  while (ServicesSerial.available()) {
    char c = ServicesSerial.read();
    gps.encode(c);  // decodifica NMEA
    //Serial.print(c);
    if(gps.time.isValid()){
      lastNmeaValid = micros64();
      return true;
    }
  }
  return false;
}

