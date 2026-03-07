#include <WiFi.h>
#include <ESPAsyncWebServer.h>
#include <TinyGPSPlus.h>
#include <TimeLib.h>
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <DNSServer.h>
#include <Update.h>
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
#define PROTOTYPEamazon

void IRAM_ATTR sensorISR(void *arg) {

  int i = (int)arg;

  signalMenagement(i);

}


// --- ISR PPS ---
void IRAM_ATTR onPpsInterrupt() {   
  lastSyncTrigger = esp_timer_get_time();
  ppsTriggered = true;
  ppsCounter++;
}

void signalMenagement(int i){
  
  bool current = digitalRead(sensorsPins[i]);

  // fronte HIGH -> LOW
  if (lastSensorState[i] == HIGH && current == LOW) {
      unsigned long now = millis();
      uint64_t nowMicros = esp_timer_get_time();

      if ((unsigned long)(now - lastSensorsSignal[i]) > delays[i]) {
          sensorTime[i] = nowMicros;
          sensorTriggered[i] = true;
          lastSensorsSignal[i] = now;
      }
  }

  lastSensorState[i] = current;

}

void IRAM_ATTR onSecondTick(){
  lastRTCTrigger = esp_timer_get_time();
  RTCTriggered = true;
  RTCTtriggerCount++;

}



void setup() {
  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm
  Serial.begin(9600, SERIAL_8N1);
  ServicesSerial.begin(9600, SERIAL_8N1, GPS_RX, PRINTER_TX);

  rtc_init(SDA_PIN, SCL_PIN, 400000);
  rtc_enable_1hz();

  pinMode(SQW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SQW_PIN), onSecondTick, RISING);

  pinMode(PPS_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(PPS_PIN), onPpsInterrupt, RISING);
  
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

  writeAgingOffset(0);

  int8_t agingRegVal = readAgingOffset();

  Serial.println(agingRegVal);

}

void configFS(){
  if (!LittleFS.begin(true)) {  // true = formatta se non montato!
    Serial.println("Errore nel montaggio di LittleFS");
    return;
  }

  server.serveStatic("/", LittleFS, "/");

}

bool calcAgingRCT = false;
bool calcAgingPPS = false;

static double ppmMean = 0.0;
static uint32_t ppmCount = 0;

void loop() {

  if(RTCTriggered){
    RTCTriggered = false;


    if(RTCTtriggerCount == 1){

      startRTC = lastRTCTrigger;

      Serial.print("startRTC: ");
      Serial.println(startRTC);

    }else if(RTCTtriggerCount > 30){
      double extimated = ((double)(RTCTtriggerCount - 1) * 1000000.0)/1000.0;
      double elapsed = (double)(((double)lastRTCTrigger - (double)startRTC)* calibrationFactor )/1000.0;
      double delta = (double)elapsed - (double)extimated;

      Serial.print(" Delta: ");
      Serial.print(delta);
      Serial.print(" in ");
      Serial.print(RTCTtriggerCount - 1);
      double driftPPM = (delta / (double)(RTCTtriggerCount - 1)) * 1000.0;
      Serial.print(" DriftPPM: ");
      Serial.println(driftPPM);
      if(fabs(driftPPM)> 0.5){
        updateCalibrationFactor(driftPPM * 2.0);
      }

    }
    
  }


  dnsServer.processNextRequest();

  bool validNmea = false;

  validNmea = processServicesSerial();


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
      ppsTriggered = false;   // consumato QUI, una sola volta
      uint64_t thisPpsUs = lastSyncTrigger;

      if (syncStatus == SYNC_WAIT_GPS || syncStatus == SYNC_FIRST_GPS_SYNC) {
        syncReference = thisPpsUs;
        syncStatus = SYNC_GPS_SYNCED;
        RTCTtriggerCount = 0;
        handlePpsSync();          // NON deve più toccare ppsTriggered
        lastGPSSync = millis();
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

  if(!syncTestRequested && (!digitalRead(0) || analogRead(35) > 500)){
    if(syncMode == MODE_SYNC_GPS){
      sweepBuzz();   
      syncTestRequested = 1;  
    }
    else{
      buzzerBeep(50,1,0,250,128);
    }
  }

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
      Serial.print("Line");
      Serial.println(i);

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

