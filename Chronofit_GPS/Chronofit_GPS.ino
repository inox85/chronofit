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
#include "mqtt.h"
#include "esp_task_wdt.h"

SoftwareSerial gpsCmd(-1, 13);

void IRAM_ATTR sensorISR(void *arg) {
  int i = (int)arg;
  signalMenagement(i);
}

// --- ISR PPS ---
void IRAM_ATTR onPpsInterrupt() {   
  lastSyncTrigger = esp_timer_get_time();
  ppsTriggered = true;
  ppsCounter = ppsCounter + 1;
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
  char lineBuf[128];
  uint8_t lineLen = 0;
  bool success = false;

  while (millis() - start < 3000) {
    while (ServicesSerial.available()) {
      char c = ServicesSerial.read();
      if (c == '\n') {
        lineBuf[lineLen] = '\0';
        Serial.print("GPS risponde: ");
        Serial.println(lineBuf);
        if (strstr(lineBuf, "PCAS001") != nullptr) {
          success = strstr(lineBuf, ",0") != nullptr;
          Serial.println(success ? "ACK OK" : "ACK errore");
        }
        lineLen = 0;
      } else if (lineLen < sizeof(lineBuf) - 1) {
        lineBuf[lineLen++] = c;
      }
    }
  }

  if (!success) {
    Serial.println("⚠️ Nessun ACK ricevuto dal GPS");
  }

  Serial.println("GPS init completato @ 9600 baud");
}

void setup() {
  // setup()
  esp_task_wdt_config_t wdt_config = {
      .timeout_ms = 30000,  // 30 secondi
      .idle_core_mask = (1 << 0) | (1 << 1),  // entrambi i core
      .trigger_panic = true
  };
  esp_task_wdt_reconfigure(&wdt_config);
  
  configFS();
  gpsParser.begin(gps);

  esp_wifi_set_max_tx_power(80);   // 80 × 0.25 dBm = 20 dBm
  esp_wifi_set_protocol(WIFI_IF_AP, WIFI_PROTOCOL_11B | WIFI_PROTOCOL_11G);

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

  stationName       = readStringFromSettings("stationName", "");
  calibrationFactor = readDoubleFromSettings("timeCal", 1.0);

  lineDevice[0] = readStringFromSettings("lt1_1", lineDevice[0]);
  lineDevice[1] = readStringFromSettings("lt1_2", lineDevice[1]);
  lineDevice[2] = readStringFromSettings("lt1_3", lineDevice[2]);
  lineDevice[3] = readStringFromSettings("lt1_4", lineDevice[3]);

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

  sessionRowIndex = getLastSessionRowIndex();

  activateAccessPoint();

  mqttSetup();

  RGBLeds.defaultSweepSequence();

}

void configFS(){
  if (!LittleFS.begin(true, "/spiffs", 20)) {  // true = formatta se non montato!
    Serial.println("Errore nel montaggio di LittleFS");
    return;
  }
  server.serveStatic("/", LittleFS, "/").setCacheControl("public, max-age=2592000");

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
  
  bool localRTCTriggered = false;
  uint64_t localRTCTrigger = 0;
  uint32_t localRTCCount = 0;
  portENTER_CRITICAL(&isrMux);
    if (RTCTriggered) {
      localRTCTriggered = true;
      localRTCTrigger = lastRTCTrigger;
      localRTCCount = RTCTtriggerCount;
      RTCTriggered = false;
    }
  portEXIT_CRITICAL(&isrMux);

  if(localRTCTriggered){
    if(localRTCCount == 1){
      startRTC = localRTCTrigger;
      Serial.print("startRTC: ");
      Serial.println(startRTC);

    }else if(localRTCCount > 60){
      double extimated = ((double)(localRTCCount - 1) * 1000000.0)/1000.0;
      double elapsed = (double)(((double)localRTCTrigger - (double)startRTC)* calibrationFactor )/1000.0;
      double delta = (double)elapsed - (double)extimated;

      double driftPPM = (delta / (double)(localRTCCount - 1)) * 1000.0;

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
    ws.cleanupClients();

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
  bool localPpsTriggered = false;
  uint64_t thisPpsUs = 0;
  portENTER_CRITICAL(&isrMux);
    if (ppsTriggered) {
      localPpsTriggered = true;
      thisPpsUs = lastSyncTrigger;
    }
  portEXIT_CRITICAL(&isrMux);

  uint64_t delta = (lastNmeaValid > 0 && thisPpsUs >= lastNmeaValid)
                 ? (thisPpsUs - lastNmeaValid)
                 : UINT64_MAX;

  if (localPpsTriggered) {
    lastPPSDetected = thisPpsUs;

    if (nmeaDeltaDebug) {
      if (lastNmeaValid > 0 && thisPpsUs >= lastNmeaValid) {
        Serial.printf("[PPS-NMEA delta] %llu µs  (%.3f ms)  validNmea=%d  timeUpdated=%d\n",
          delta, delta / 1000.0f, validNmea, gps.time.isUpdated());
      } else {
        Serial.printf("[PPS-NMEA delta] N/A — nessun NMEA valido ricevuto\n");
      }
    }
    // Sincronizzazione iniziale — richiede NMEA fresco
    if ((delta >= 200000 && delta <= 700000) && validNmea && gps.time.isUpdated() && syncMode == MODE_SYNC_GPS) {
      validNmea = false;

      if (syncStatus == SYNC_WAIT_GPS || syncStatus == SYNC_FIRST_GPS_SYNC) {
        syncReference = thisPpsUs;
        handlePpsSync();
        usDriftAtPPS = 0;
        lastDeltaPPSSync = 0;
        extimatedDriftByPPS = 0;
        syncStatus = SYNC_GPS_SYNCED;
        RTCTtriggerCount = 0;
        lastGPSSync = millis();

        if (printEnabled) {
          PreciseTime pt = getPreciseTimeFromSync(thisPpsUs);
          printSyncStart(MODE_SYNC_GPS, pt.hh, pt.mm, pt.ss, pt.ms);
        }
      }
    }

    if (syncTestRequested && syncStatus == SYNC_GPS_SYNCED && syncMode == MODE_SYNC_GPS) {
      PreciseTime pt = getPreciseTimeFromSync(thisPpsUs);
      if ((pt.ss == 0 && pt.ms < 500) || (pt.ss == 59 && pt.ms > 500)) {
        syncTestRequested = 0;
        sensorTime[4] = thisPpsUs;
        portENTER_CRITICAL(&isrMux);
          sensorTriggered[4] = true;
        portEXIT_CRITICAL(&isrMux);
        handleSensorTrigger();
      }
    }

    portENTER_CRITICAL(&isrMux);
      ppsTriggered = false;
    portEXIT_CRITICAL(&isrMux);
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
  for (int i = 0; i < 6; i++) {
    bool triggered = false;
    uint64_t tUs = 0;
    portENTER_CRITICAL(&isrMux);
      if (sensorTriggered[i]) {
        triggered = true;
        tUs = sensorTime[i];
        sensorTriggered[i] = false;
      }
    portEXIT_CRITICAL(&isrMux);

    if (triggered) {
      playBinary(i+1);
      if (syncMode == MODE_SYNC_LINE && syncStatus == SYNC_WAIT_LINE_SIGNAL){
        lastSyncTrigger = tUs;
        syncReference = lastSyncTrigger;
        handleLineSync();
        if (printEnabled) {
          PreciseTime pt = getPreciseTime();
          printSyncStart(MODE_SYNC_LINE, pt.hh, pt.mm, pt.ss, pt.ms);
        }
      }else if(syncMode == MODE_ELAPSED_TIME && syncStatus == ELAPSED_WAITING_START)
      {
        lastSyncTrigger = tUs;
        syncReference = lastSyncTrigger;
        RTCTtriggerCount = 0;
        handleLineSync();
        checkPointRoutine(i);
      }else{
        if (i == 4 && printEnabled) {
          // Conferma/test di sincronizzazione: sostituisce la riga di
          // checkpoint di questa linea virtuale con lo scontrino dedicato.
          PreciseTime pt = getPreciseSensorTime(i);
          printSyncConfirm(syncMode, pt.hh, pt.mm, pt.ss, pt.ms);
          printEnabled = 0;
          checkPointRoutine(i);
          printEnabled = 1;
        } else {
          checkPointRoutine(i);
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
  return (strncmp(buf, "$GPRMC", 6) == 0 ||
          strncmp(buf, "$GNRMC", 6) == 0 ||
          strncmp(buf, "$GPGGA", 6) == 0 ||
          strncmp(buf, "$GNGGA", 6) == 0 ||
          strncmp(buf, "$GPGSV", 6) == 0 ||  // satelliti in vista
          strncmp(buf, "$GNGSV", 6) == 0);   // multi-costellazione
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
      } else {
        // Sentenza troppo lunga: scarta e attendi la prossima
        if (serialDebug) Serial.println("[NMEA] WARN: sentence too long, discarded");
        inSentence = false;
        nmeaLen = 0;
      }

      if (c == '\n') {
        // Sentence completa
        nmeaBuffer[nmeaLen] = '\0';
        inSentence = false;

        if (serialDebug) {
          Serial.print(isUsefulSentence(nmeaBuffer) ? "[NMEA] " : "[NMEA][skip] ");
          Serial.print(nmeaBuffer);
        }

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