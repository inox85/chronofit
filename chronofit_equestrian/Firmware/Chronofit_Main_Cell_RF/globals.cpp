#include "globals.h"
#include "settings.h"
#include "cells.h"
#include "params.h"
#include <ESPAsyncWebServer.h>
#include <DNSServer.h>


const char* BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// --- Costanti --- 
String chipIdStr = "";
const char *ssid = "ChronofitMainCellRF";
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
// Linee 1-4 "gestite" di default: un dispositivo vuoto le farebbe risultare
// "Non gestita" nella console (vale finché l'operatore non salva un valore, NVS lt1_N).
String lineDevice[6] = {"Barriera 1", "Barriera 2", "Barriera 3", "Barriera 4", "Serivice", "Services"};
int lineMode[6]   = {0, 0, 0, 0, 0, 1};   // 0=auto   | 1=manuale
int competitors[6] = {0, 0, 0, 0, 0, 0};
unsigned long delays[6] = {0, 0, 0, 0, 0, 0};

void lineDelaysLoad() {
  for (int i = 0; i < 4; i++) {
    char key[12];
    snprintf(key, sizeof(key), "ldelay_%d", i + 1);
    delays[i] = (unsigned long)max(0, readIntFromSettings(key, (int)LINE_DELAY_DEFAULT_MS));
  }
}

void lineDelaySet(int idx, long ms) {
  if (idx < 0 || idx >= 6) return;
  unsigned long v = ms < 0 ? 0 : (unsigned long)ms;
  if (delays[idx] == v) return;
  delays[idx] = v;
  cellsMarkDirty();   // la console mostra il lockout delle Cell RF della linea
  if (idx < 4) {
    char key[12];
    snprintf(key, sizeof(key), "ldelay_%d", idx + 1);
    writeIntToSettings(key, (int)v);
  }
}
int lineEnabled[6] = {1, 1, 1, 1, 1, 1};
// Linea (1-4) il cui primo passaggio fa partire il tempo trascorso; 0 = qualsiasi (NVS el_start)
int elapsedStartLine = 0;
// 1 = una linea si disattiva da sola dopo il primo passaggio (NVS line_once)
int lineDisableAfterPass = 0;
volatile bool sensorTriggered[6] = {false, false, false, false, false, false};
// Passaggio manuale dalla console (/checkPoint): conta anche su una linea disabilitata
volatile bool sensorManual[6] = {false, false, false, false, false, false};
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

int buzzerActive = 1;


portMUX_TYPE isrMux = portMUX_INITIALIZER_UNLOCKED;