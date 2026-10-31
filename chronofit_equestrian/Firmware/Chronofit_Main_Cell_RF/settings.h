#ifndef SETTINGS_H
#define SETTINGS_H

#include <Arduino.h>
#include <Preferences.h>
#include "settings.h"

// Oggetto globale Preferences
extern Preferences settings;

// Dichiarazione delle funzioni
void settingsBegin();
void settingsEnd();

int readIntFromSettings(const char* key, int def);
int writeIntToSettings(const char* key, int val);

float readFloatFromSettings(const char* key, float def);
float writeFloatToSettings(const char* key, float val);

double readDoubleFromSettings(const char* key, double def);
double writeDoubleToSettings(const char* key, double val);

unsigned int writeUIntToSettings(const char* key, unsigned int val);
unsigned int readUIntFromSettings(const char* key, unsigned int val);

uint64_t writeULong64ToSettings(const char* key, uint64_t val);
uint64_t readULong64FromSettings(const char* key, uint64_t val);

String writeStringToSettings(const char* key, const String& val);
String readStringFromSettings(const char* key, const String& def);

#endif  // SETTINGS_H
