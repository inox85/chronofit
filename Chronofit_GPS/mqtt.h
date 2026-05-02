#pragma once

#include <Arduino.h>
 
void mqttSetup();
void mqttPublishCheckpoint(const String& jsonPayload);
