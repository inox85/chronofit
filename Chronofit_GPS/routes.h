// routes.h
#pragma once
#include <ESPAsyncWebServer.h>
#include "globals.h"
#include <ArduinoJson.h>

void registerRoutes(AsyncWebServer &server, AsyncWebSocket &ws);
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
