#pragma once
#include <Arduino.h>

void mqttSetup();
void mqttPublishCheckpoint(const String& jsonPayload);
void mqttUpdateSettings(const String& newSubTopic, const String& newEventName);
