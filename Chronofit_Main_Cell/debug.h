#pragma once
#include <Arduino.h>

inline void debug(const String &text) {
  #ifdef DEBUG
    Serial.println(text);
  #endif
}