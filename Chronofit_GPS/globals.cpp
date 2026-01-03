#include "globals.h"
#include "params.h"
#include <ESPAsyncWebServer.h>
#include <TinyGPSPlus.h>
#include <DNSServer.h>

// --- Costanti ---
const char *ssid = "Chronofit";
const byte DNS_PORT = 53;

// --- WiFi AP ---

DNSServer dnsServer;

// --- Hardware ---

TinyGPSPlus gps;

// --- Variabili generali ---
String stationName = "";

// --- PPS ---
volatile uint8_t ppsH, ppsM, ppsS = 0;
volatile bool ppsTriggered = false;
volatile bool lineTriggered = false;
volatile uint32_t ppsCounter = 0;

bool testOnSync = true;
int calRunning = 0;
int calPpsCount = 0;

int fixStatus = 0;
int prevFixStatus = 0;

volatile uint64_t calStartUs = 0;
volatile uint64_t lastSyncTrigger = 0;
volatile uint64_t syncReference = 0;
unsigned long gpsTimeOffsetUs = 0;
int utcOffset = 0;

double calibrationFactor = 1.0;

int syncEnabled = 1;

// --- Sensori ---
int lineIds[5] = {1, 2, 3, 4, -1};
int competitors[5] = {0, 0, 0, 0, 0};
unsigned long delays[5] = {0, 0, 0, 0, 0};
volatile unsigned long lastSensorsSignal[5] = {0, 0, 0, 0, 0};
int sensorsPins[5] = { SENSOR_IN1, SENSOR_IN2, SENSOR_IN3, SENSOR_IN4, -1 };
volatile bool lastSensorState[5] = {HIGH, HIGH, HIGH, HIGH, HIGH};
volatile bool sensorTriggered[5] = {false, false, false, false, false};
volatile uint64_t sensorTime[5] = {0, 0, 0, 0, 0};

volatile int syncTestRequested = 0;

volatile int8_t actualSecond = 0;
volatile int8_t actualSecondForTest = 0;

// --- Varie ---
unsigned long lastBroadcast = 0;

int printEnabled = 1;

int temp_hh = 0;
int temp_mm = 0;
int temp_ss = 0;

int syncStatus = SYNC_NONE;
int syncMode = MODE_SYNC_MANUAL;
unsigned long lastGPSSync = 0;
int GPSRefreshInterval = 0;

int lastBroadCastSecond = 0;

int sessionRowIndex = 0;
