#pragma once
#include <Arduino.h>

void mqttSetup();
void mqttPublishCheckpoint(const char* jsonPayload);
void mqttUpdateSettings(const String& newSubTopic, const String& newEventName, const String& newPrefix);
void mqttUpdateBroker(const String& host, int port, const String& user, const String& pass);
