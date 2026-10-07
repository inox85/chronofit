#include "globals.h"
#include "params.h"
#include <ESPAsyncWebServer.h>
#include <DNSServer.h>


const char* BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

LedStrip RGBLeds;
// --- Costanti --- 
String chipIdStr = "";
const char *ssid = "ChronofitMainCell";
const byte DNS_PORT = 53;

// --- WiFi AP ---

DNSServer dnsServer;

// --- Hardware ---


// --- Variabili generali ---
String stationName = "";

// --- Ancora oraria assoluta (secondi dall'inizio del giorno al momento del sync) ---
uint64_t ppsEpochSec = 0;





volatile uint64_t lastSyncTrigger = 0;
volatile uint64_t syncReference = 0;
int utcOffset = 0;



double calibrationFactor = 1.0;

int syncEnabled = 1;

// --- Sensori ---
// Indice 4 = linea 5 (non usata), indice 5 = linea 6 (Fuori pressostato, manuale)
String lineIds[6]    = {"1", "2", "3", "4", "Sync-test", "F.P."};
String lineDevice[6] = {"", "", "", "", "Serivice", "Services"};
int lineMode[6]   = {0, 0, 0, 0, 0, 1};   // 0=auto   | 1=manuale
int competitors[6] = {0, 0, 0, 0, 0, 0};
unsigned long delays[6] = {0, 0, 0, 0, 0, 0};
int lineEnabled[6] = {1, 1, 1, 1, 1, 1};
volatile unsigned long lastSensorsSignal[6] = {0, 0, 0, 0, 0, 0};
int sensorsPins[6] = { SENSOR_IN1, SENSOR_IN2, SENSOR_IN3, SENSOR_IN4, -1, -1 };
volatile bool lastSensorState[6] = {HIGH, HIGH, HIGH, HIGH, HIGH, HIGH};
volatile bool sensorTriggered[6] = {false, false, false, false, false, false};
volatile uint64_t sensorTime[6] = {0, 0, 0, 0, 0, 0};


volatile int8_t actualSecond = 0;

// WiFi Connection

unsigned long startAttemptTime = 0;
const unsigned long wifiTimeout = 10000; // 10 secondi
volatile bool internetOK = false;
bool wifiReconnecting = false;  // true = caduta dopo connessione riuscita, sta riprovando

// --- Varie ---
unsigned long lastBroadcast = 0;



int temp_hh = 0;
int temp_mm = 0;
int temp_ss = 0;

int syncStatus = ELAPSED_WAITING_START;
int syncMode = MODE_ELAPSED_TIME;

int lastBroadCastSecond = 0;

int sessionRowIndex = 0;

unsigned long lastClientCheck = 0;


unsigned long lastRxTime = 0;
unsigned long lastTxTime = 0;

volatile bool shouldRestart = false;

int buzzerActive = 0;


portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;