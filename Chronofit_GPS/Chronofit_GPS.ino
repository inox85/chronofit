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
#include <FastLED.h>
#include "esp_netif.h"
#include "lwip/netif.h"
#include "lwip/stats.h"
#include "gps_custom.h"
#include <SoftwareSerial.h>

SoftwareSerial gpsCmd(-1, 13);

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


// void setupWiFi() {
//   String ssid     = readStringFromSettings("wifi_ssid", "");
//   String password = readStringFromSettings("wifi_pass", "");

//   if (!ssid.isEmpty()) {
//     Serial.println("Rete salvata trovata: " + ssid);
//     connectToWiFi(ssid.c_str(), password.c_str());
//   } else {
//     Serial.println("Nessuna rete configurata. In attesa di credenziali...");
//   }
// }

// Calcola e invia comando NMEA con checksum automatico
void sendGPSCommand(const char* cmd) {
  uint8_t checksum = 0;
  // Calcola XOR di tutti i caratteri tra $ e *
  for (int i = 0; cmd[i] != '\0'; i++) {
    checksum ^= (uint8_t)cmd[i];
  }
  char buf[128];
  snprintf(buf, sizeof(buf), "$%s*%02X\r\n", cmd, checksum);
  Serial.print("Invio: ");
  Serial.print(buf);
  gpsCmd.print(buf);
  gpsCmd.flush();
  delay(200);
}

void initGPS(){

  Serial.begin(115200);
  delay(500); // aspetta che il monitor seriale si connetta

  gpsCmd.begin(9600);
  delay(100);

  sendGPSCommand("PCAS04,1");           // GPS only
  sendGPSCommand("PCAS02,1000");        // 1Hz
  sendGPSCommand("PCAS03,1,0,1,1,1,0,0,0,0,0,,,0,0");

  gpsCmd.end();
  delay(100);

  ServicesSerial.begin(9600, SERIAL_8N1, GPS_RX, PRINTER_TX);
  delay(100);
  while (ServicesSerial.available()) ServicesSerial.read();

  // Leggi ACK
  unsigned long start = millis();
  String line = "";
  bool success = false;

  while (millis() - start < 3000) {
    while (ServicesSerial.available()) {
      char c = ServicesSerial.read();
      line += c;
      if (c == '\n') {
        Serial.print("GPS risponde: ");
        Serial.print(line);
        if (line.indexOf("PCAS001") >= 0) {
          success = line.indexOf(",0") >= 0;
          Serial.println(success ? "✅ ACK OK" : "❌ ACK errore");
        }
        line = "";
      }
    }
  }

  if (!success) {
    Serial.println("⚠️ Nessun ACK ricevuto dal GPS");
  }

  Serial.println("GPS init completato @ 9600 baud");
}

void setup() {
  gpsParser.begin(gps);
  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm

  //setupWiFi();

  //initGPS();

  Serial.begin(9600, SERIAL_8N1);
  //ServicesSerial.begin(9600, SERIAL_8N1, GPS_RX, PRINTER_TX);
  ServicesSerial.begin(9600, SERIAL_8N1, GPS_RX, PRINTER_TX, false, 2048);

  pinMode(RST_PIN, OUTPUT);
  digitalWrite(RST_PIN, HIGH);
  
  rtc_init(SDA_PIN, SCL_PIN, 400000);
  
  pinMode(SQW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SQW_PIN), onSecondTick, RISING);

  pinMode(PPS_PIN, INPUT);
  attachInterrupt(digitalPinToInterrupt(PPS_PIN), onPpsInterrupt, RISING);
  
  rtc_set_datetime(2026, 2, 25, 12, 0, 0); // solo una volta

  #ifdef VER2

    RGBLeds.begin();
  
  #else

    digitalWrite(LED_1, LOW);
    digitalWrite(LED_2, LOW);
    digitalWrite(LED_3, LOW);

    pinMode(LED_1, OUTPUT);
    pinMode(LED_2, OUTPUT);
    pinMode(LED_3, OUTPUT);

    digitalWrite(LED_1, HIGH);
    digitalWrite(LED_2, HIGH);
    digitalWrite(LED_3, HIGH);

  #endif

  calibrationFactor = readDoubleFromSettings("timeCal", 1.0);
  
  syncMode = readIntFromSettings("syncMode", MODE_SYNC_MANUAL);
  GPSRefreshInterval = readIntFromSettings("refInt", 0);
  utcOffset = readIntFromSettings("utcOffset", 0);
  int rtcAging = readIntFromSettings("rtcAging", 0);
  buzzerActive = readIntFromSettings("buzzActive", 0);

  Serial.print("Writing aging factor: ");
  Serial.println(rtcAging);
  writeAgingOffset(rtcAging);
  Serial.print("Reading aging factor: ");
  Serial.println(rtcAging);
  writeAgingOffset(readAgingOffset());
  rtc_enable_1hz();
  //int8_t agingRegVal = readAgingOffset();

  if(syncMode == MODE_SYNC_GPS)
    syncStatus = SYNC_FIRST_GPS_SYNC;

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

  RGBLeds.defaultSweepSequence();

}

void configFS(){
  if (!LittleFS.begin(true)) {  // true = formatta se non montato!
    Serial.println("Errore nel montaggio di LittleFS");
    return;
  }
  server.serveStatic("/", LittleFS, "/");

}


#define IDLE_TIMEOUT 200  // ms

// ── Chiama queste nel tuo webserver ──────────────────────────


// ── Nel loop() ───────────────────────────────────────────────
void updateWifiLed(uint8_t ledIndex) {
  unsigned long now = millis();
  bool rxRecent = (now - lastRxTime) < IDLE_TIMEOUT;
  bool txRecent = (now - lastTxTime) < IDLE_TIMEOUT;

  if      (txRecent) RGBLeds.setLed(ledIndex, CRGB(0, 255, 0));
  else if (rxRecent) RGBLeds.setLed(ledIndex, CRGB(255, 140, 0));
  else               RGBLeds.setLed(ledIndex, CRGB::Black);
}

// In globals.h o all'inizio del file
bool validNmea = false;  // globale, non locale al loop

void loop() {

  if(shouldRestart){
    delay(500);
    ESP.restart();
  }
  
  if(RTCTriggered){
    RTCTriggered = false;
    if(RTCTtriggerCount == 1){
      startRTC = lastRTCTrigger;
      Serial.print("startRTC: ");
      Serial.println(startRTC);

    }else if(RTCTtriggerCount > 60){
      double extimated = ((double)(RTCTtriggerCount - 1) * 1000000.0)/1000.0;
      double elapsed = (double)(((double)lastRTCTrigger - (double)startRTC)* calibrationFactor )/1000.0;
      double delta = (double)elapsed - (double)extimated;

      // Serial.print(" Delta: ");
      // Serial.print(delta);
      // Serial.print(" in ");
      // Serial.print(RTCTtriggerCount - 1);
      double driftPPM = (delta / (double)(RTCTtriggerCount - 1)) * 1000.0;
      // Serial.print(" DriftPPM: ");
      // Serial.print(driftPPM);


      if(fabs(driftPPM)> 0.5){
        updateCalibrationFactor(driftPPM * 2.0);
      }

    }
    
  }


  dnsServer.processNextRequest();

// DOPO (corretto)
  validNmea = processServicesSerial() || validNmea;

  if((millis() - lastClientCheck) > LAST_CLIENT_CHECK){
    lastClientCheck = millis();

    #ifdef VER2
      if(checkConnectedClient()){
        if(internetOK){
          RGBLeds.setLed(WIFI_LED, CRGB::Green);
        }else{
          RGBLeds.setLed(WIFI_LED, CRGB::Yellow);
        }
      }else{
        RGBLeds.setLed(WIFI_LED, CRGB::Red);
      }
    #else
      digitalWrite(LED_1, checkConnectedClient());
    #endif

  }
  
  if(syncStatus != SYNC_WAIT_LINE_SIGNAL){
    if(((millis() - lastGPSSync)/60000 >= GPSRefreshInterval || GPSRefreshInterval == 0) 
        && syncMode == MODE_SYNC_GPS) {
      syncStatus = SYNC_WAIT_GPS;
    }
  }

  // 🔹 Gestione PPS GPS (unico punto che consuma ppsTriggered)
  uint64_t delta = (lastNmeaValid > 0 && lastSyncTrigger >= lastNmeaValid)
                 ? (lastSyncTrigger - lastNmeaValid)
                 : UINT64_MAX;

  if (ppsTriggered) {
    lastPPSDetected = lastSyncTrigger;

    Serial.printf("[PPS] delta=%llu validNmea=%d isUpdated=%d syncMode=%d syncStatus=%d syncTestRequested=%d\n",
                  delta, validNmea, gps.time.isUpdated(), syncMode, syncStatus, syncTestRequested);

    if ((delta >= 400000 && delta <= 700000) && validNmea && gps.time.isUpdated() && syncMode == MODE_SYNC_GPS) {
      ppsTriggered = false;   // consumato QUI, una sola volta
      validNmea = false;  // ← manca questo!
      uint64_t thisPpsUs = lastSyncTrigger;
      //Serial.printf("[PPS] delta=%llu validNmea=%d isUpdated=%d syncMode=%d syncStatus=%d syncTestRequested=%d\n",
      //              delta, validNmea, gps.time.isUpdated(), syncMode, syncStatus, syncTestRequested);
      if (syncStatus == SYNC_WAIT_GPS || syncStatus == SYNC_FIRST_GPS_SYNC) {
        syncReference = thisPpsUs;
        handlePpsSync();          // NON deve più toccare ppsTriggered
        usDriftAtPPS = 0;
        lastDeltaPPSSync = 0;
        extimatedDriftByPPS = 0;
        syncStatus = SYNC_GPS_SYNCED;
        RTCTtriggerCount = 0;
        lastGPSSync = millis();
      }else if (syncTestRequested && syncStatus == SYNC_GPS_SYNCED){
        PreciseTime pt = getPreciseTime();

        // Serial.printf("[SYNCTEST] ss=%d ms=%d — condizione: %d\n",
        //             pt.ss, pt.ms,
        //             (pt.ss == 0 && pt.ms < 500) || (pt.ss == 59 && pt.ms > 500));

        if((pt.ss == 0 && pt.ms < 500) || (pt.ss == 59 && pt.ms > 500)){
          syncTestRequested = 0;
          sensorTime[4] = thisPpsUs;
          sensorTriggered[4] = true;
          handleSensorTrigger();
        }
        //else {
          //Serial.printf("[SYNCTEST] FALLITO: condizione temporale non soddisfatta\n");
        //}
      //}else {
        //Serial.printf("[PPS] SCARTATO: condizione esterna non soddisfatta\n");
      //}
      }
    } else {
    // Serial.printf("[PPS] SCARTATO — delta ok=%d validNmea=%d isUpdated=%d syncMode=%d\n",
    //               (delta >= 20000 && delta <= 100000), validNmea, gps.time.isUpdated(), syncMode);
    ppsTriggered = false; // consuma comunque per evitare loop
  }
  }

  PreciseTime t = getPreciseTime();
  actualSecond = t.ss;

  if(actualSecond != lastBroadCastSecond && t.ms < 100){
    lastBroadCastSecond = actualSecond;
    broadcastTime();   
  }

  #ifdef VER2
    if(digitalRead(PPS_PIN)){
      RGBLeds.setLed(PPS_LED, CRGB::Blue);
    }else{
      RGBLeds.turnOffLed(PPS_LED);
    }

    RGBLeds.setLed(LINE_LED, getStatusColor());
  #else 
    digitalWrite(LED_3, syncTestRequested);
  #endif
  
  handleSensorTrigger();

  updateWifiLed(COM_LED);

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
        RTCTtriggerCount = 0;
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

CRGB getStatusColor() {
  CRGB color = CRGB::Black;  // parte da spento

  if (digitalRead(SENSOR_IN1) == LOW) color += CRGB::Red;
  if (digitalRead(SENSOR_IN2) == LOW) color += CRGB::Green;
  if (digitalRead(SENSOR_IN3) == LOW) color += CRGB::Blue;
  if (digitalRead(SENSOR_IN4) == LOW) color += CRGB::Yellow;

  return color;
}

// bool processServicesSerial() {
//   while (ServicesSerial.available()) {
//     char c = ServicesSerial.read();
//     gps.encode(c);  // decodifica NMEA
//     //Serial.print(c);
//     if(gps.time.isValid()){
//       lastNmeaValid = esp_timer_get_time();
//       return true;
//     }
//   }
//   return false;
// }


// Buffer per accumulare la sentence corrente
static char nmeaBuffer[90];
static uint8_t nmeaLen = 0;
static bool inSentence = false;

bool isUsefulSentence(const char* buf) {
  // Accetta solo RMC e GGA (sia GP che GN per moduli multi-costellazione)
  return (strncmp(buf, "$GPRMC", 6) == 0 ||
          strncmp(buf, "$GNRMC", 6) == 0 ||
          strncmp(buf, "$GPGGA", 6) == 0 ||
          strncmp(buf, "$GNGGA", 6) == 0);
}

bool processServicesSerial() {
  bool gotValid = false;

  while (ServicesSerial.available()) {
    char c = ServicesSerial.read();

    if (c == '$') {
      // Inizio nuova sentence
      inSentence = true;
      nmeaLen = 0;
      nmeaBuffer[nmeaLen++] = c;
    }
    else if (inSentence) {
      if (nmeaLen < sizeof(nmeaBuffer) - 1) {
        nmeaBuffer[nmeaLen++] = c;
      }

      if (c == '\n') {
        // Sentence completa
        nmeaBuffer[nmeaLen] = '\0';
        inSentence = false;

        if (isUsefulSentence(nmeaBuffer)) {
          // Passa solo RMC e GGA alla libreria
          for (uint8_t i = 0; i < nmeaLen; i++) {
            gps.encode(nmeaBuffer[i]);
          }

          if (gps.time.isValid()) {
            lastNmeaValid = esp_timer_get_time();
            gotValid = true;
          }
        }
      }
    }
  }

  return gotValid;
}
