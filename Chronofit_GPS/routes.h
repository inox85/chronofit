// routes.h
#pragma once
#include <ESPAsyncWebServer.h>
#include "globals.h"
#include <ArduinoJson.h>

void registerRoutes(AsyncWebServer &server, AsyncWebSocket &ws);

void activateAccessPoint();

bool connectToWiFi(const char* ssid, const char* password, uint32_t timeoutMs);

// POST del file session.json a Hooklistener
// postSessionJson(
//   "https://app.hooklistener.com/w/my-first-endpoint-lwi8/esp32",
//   "/session.json"
// );

bool postSessionJson(const char* url, const char* filePath);

// 👇 aggiungi questo:
void onWsEvent(AsyncWebSocket *server,
               AsyncWebSocketClient *client,
               AwsEventType type,
               void *arg,
               uint8_t *data,
               size_t len);


String serializeSettings();

void broadCastSettings();

void broadCastRowEdited(const DynamicJsonDocument& entry);

extern AsyncWebServer server;
extern AsyncWebSocket ws;

void internetCheckTask(void *pvParameters);

String fileToBase64(const char *path);

void sendBrevoMail();

String serializeMessage(String msg);
