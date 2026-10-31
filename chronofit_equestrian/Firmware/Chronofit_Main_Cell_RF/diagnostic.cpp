#include "diagnostic.h"
#include "constants.h"
#include "params.h"
#include "globals.h"
#include "power.h"
#include <Arduino.h>

// definizione e inizializzazione
int powerSource = POWER_MODE_NONE;
unsigned long lastPowerCheck = 0;
int prevPowerSourceStatus = POWER_MODE_NONE;

// Sulla scheda Chronofit_BLE l'alimentazione esterna si riconosce dal
// caricatore (in carica o carica completa); altrimenti si va a batteria.
void checkPowerSource() {
    if (millis() - lastPowerCheck > 1000) {
        lastPowerCheck = millis();
        powerSource = powerExternal() ? POWER_MODE_USB : POWER_MODE_BATTERY;
        if(prevPowerSourceStatus != powerSource){
            prevPowerSourceStatus = powerSource;
        }
    }
}
