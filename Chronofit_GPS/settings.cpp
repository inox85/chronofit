#include "settings.h"

Preferences settings;  // Creazione dell'istanza globale

void settingsBegin() {  
    settings.end();  // Assicura la chiusura prima di riaprire
    if (!settings.begin("settings", false)) { 
        return;
    }
}

void settingsEnd() {
    settings.end();
}

int readIntFromSettings(const char* key, int def) {
    settingsBegin();
    int val = settings.getInt(key, def);
    //Console::debug(key, val);  // Console::debug sostituita con Serial
    settingsEnd();
    delay(100);
    return val;
}

int writeIntToSettings(const char* key, int val) {
    settingsBegin();
    settings.putInt(key, val);
    settingsEnd();
    delay(100);
    return readIntFromSettings(key, -1);
}

unsigned int readUIntFromSettings(const char* key, unsigned int def) {
    settingsBegin();
    unsigned int val = settings.getUInt(key, def);
    //Console::debug(key, val);  // Console::debug sostituita con Serial
    settingsEnd();
    delay(100);
    return val;
}

unsigned int writeUIntToSettings(const char* key, unsigned int val) {
    settingsBegin();
    settings.putUInt(key, val);
    settingsEnd();
    delay(100);
    return readUIntFromSettings(key, -1);
}

float readFloatFromSettings(const char* key, float def) {
    settingsBegin();
    float val = settings.getFloat(key, def);
    //Console::debug(key, val);  // Console::debug sostituita con Serial
    settingsEnd();
    delay(100);
    return val;
}

float writeFloatToSettings(const char* key, float val) {
    settingsBegin();
    settings.putFloat(key, val);
    settingsEnd();
    delay(100);
    return readFloatFromSettings(key, -1.0);
}

double writeDoubleToSettings(const char* key, double val) {
    settingsBegin();
    settings.putDouble(key, val);
    settingsEnd();
    delay(10);
    return readDoubleFromSettings(key, -1.0);
}

double readDoubleFromSettings(const char* key, double def) {
    settingsBegin();
    double val = settings.getDouble(key, def);
    settingsEnd();
    delay(10);
    return val;
}

uint64_t writeULong64ToSettings(const char* key, uint64_t val) {
    settingsBegin();
    settings.putULong64(key, val);
    settingsEnd();
    delay(100);
    return readULong64FromSettings(key, -1.0);
}

uint64_t readULong64FromSettings(const char* key, uint64_t def) {
    settingsBegin();
    uint64_t val = settings.getULong64(key, def);
    settingsEnd();
    delay(100);
    return val;
}

