#pragma once
#include <Arduino.h>
#include <MQTT.h>
#include <WiFi.h>

// ── Configurazione broker ─────────────────────────────────────────────────────
// Modifica questi valori oppure spostali in secrets.h
#define MQTT_HOST        "918090d5e9974ce28ebaabfe1cf1a626.s1.eu.hivemq.cloud"
#define MQTT_PORT        8883  
#define MQTT_CLIENT_ID   "chronofit_001"   // deve essere unico per broker
#define MQTT_USER        "chronofit"                // lascia vuoto se non richiesto
#define MQTT_PASS        "Freedom2020"

// ── Topic ─────────────────────────────────────────────────────────────────────
#define MQTT_TOPIC_CHECKPOINT   "chronofit/event_001/chronofit_001/data"
#define MQTT_TOPIC_CMD          "chronofit/cmd"        // topic in ascolto comandi

// ── Coda publish ──────────────────────────────────────────────────────────────
#define MQTT_QUEUE_SIZE     10    // max messaggi in coda
#define MQTT_PAYLOAD_SIZE   256   // max byte payload per messaggio
#define MQTT_TOPIC_SIZE     64    // max byte topic

// ── API pubblica ──────────────────────────────────────────────────────────────

// Chiama questa funzione nel setup(), dopo WiFi.begin()
void mqttManagerBegin();

// Pubblica un checkpoint sulla coda thread-safe.
// Può essere chiamata da qualsiasi task/ISR/handler HTTP.
// Ritorna false se la coda è piena (messaggio scartato).
bool mqttPublishCheckpoint(const char* payload);

// Ritorna true se il client MQTT è attualmente connesso
bool mqttIsConnected();

