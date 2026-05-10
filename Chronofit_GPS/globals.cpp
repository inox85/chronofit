#include "globals.h"
#include "params.h"
#include <ESPAsyncWebServer.h>
#include <TinyGPSPlus.h>
#include <DNSServer.h>


const char* BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

LedStrip RGBLeds;
// --- Costanti --- 
String chipIdStr = "";
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
uint64_t ppsEpochSec = 0;
volatile bool ppsTriggered = false;
volatile bool lineTriggered = false;
volatile uint32_t ppsCounter = 0;


volatile bool RTCTriggered = false;

bool testOnSync = true;
int calRunning = 0;
int calPpsCount = 0;

int fixStatus = 0;
int prevFixStatus = 0;

volatile uint64_t calStartUs = 0;
volatile uint64_t lastSyncTrigger = 0;
volatile uint64_t lastNmeaValid = 0;
volatile uint64_t syncReference = 0;
unsigned long gpsTimeOffsetUs = 0;
int utcOffset = 0;

uint64_t lastPPSDetected = 0;

volatile uint64_t lastRTCTrigger = 0;

double calibrationFactor = 1.0;
double calTemp = 50;
double compFactor = 0.03;

int syncEnabled = 1;

// --- Sensori ---
String lineIds[5] = {"1", "2", "3", "4", "Sync-test"};
int competitors[5] = {0, 0, 0, 0, 0};
unsigned long delays[5] = {0, 0, 0, 0, 0};
int lineEnabled[5] = {1, 1, 1, 1, 1};
volatile unsigned long lastSensorsSignal[5] = {0, 0, 0, 0, 0};
int sensorsPins[5] = { SENSOR_IN1, SENSOR_IN2, SENSOR_IN3, SENSOR_IN4, -1 };
volatile bool lastSensorState[5] = {HIGH, HIGH, HIGH, HIGH, HIGH};
volatile bool sensorTriggered[5] = {false, false, false, false, false};
volatile uint64_t sensorTime[5] = {0, 0, 0, 0, 0};

volatile int syncTestRequested = 0;

volatile int8_t actualSecond = 0;
volatile int8_t actualSecondForTest = 0;

// WiFi Connection

unsigned long startAttemptTime = 0;
const unsigned long wifiTimeout = 10000; // 10 secondi
volatile bool internetOK = false;
bool wifiReconnecting = false;  // true = caduta dopo connessione riuscita, sta riprovando
volatile bool mqttConnected = false;

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

unsigned long lastClientCheck = 0;

uint32_t RTCTtriggerCount = 0;
uint64_t startRTC = 0;

uint64_t prevRTCTrigger = 0;
uint64_t prevPPSTrigger= 0;
double meanRTCAdjFactor = 1;
uint32_t ppsDiff = 0;
uint32_t rtcDiff = 0;

uint32_t rtcMeanCount = 0;
uint32_t ppsMeanCount = 0;

uint64_t rtcDiffSum = 0;
uint32_t rtcDiffCount = 0;
double rtcDiffMean = 0;

uint64_t ppsDiffSum = 0;
uint32_t ppsDiffCount = 0;
double ppsDiffMean = 0;

double ppmAdjRTC = 0.0;

uint64_t rtcWindowStartUs = 0;
uint32_t rtcWindowCount = 0;
uint64_t rtcWindowSumUs = 0;

bool calRTC = false;

int agingFactor = 0;

int32_t usDriftAtPPS = 0;
uint64_t lastDeltaPPSSync = 0;
double extimatedDriftByPPS = 0;

unsigned long lastRxTime = 0;
unsigned long lastTxTime = 0;

volatile bool shouldRestart = false;

int buzzerActive = 0;

int mqttShowPopup     = 1;
int mqttAcquireRow    = 0;
int mqttImmediateMode = 0;
int pendingRowIndex   = 0;

portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;