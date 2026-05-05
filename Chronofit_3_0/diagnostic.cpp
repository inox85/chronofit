#include "diagnostic.h"
#include "constants.h"
#include "params.h"
#include "globals.h"
#include <Arduino.h>

// definizione e inizializzazione
int powerSource = POWER_MODE_NONE;
unsigned long lastPowerCheck = 0;
int prevPowerSourceStatus = POWER_MODE_NONE;

void checkPowerSource() {

    if (millis() - lastPowerCheck > 1000) {
        int powerVoltage = analogRead(POWER_SOURCE);
        lastPowerCheck = millis();
        powerSource = POWER_MODE_NONE;

        if(powerVoltage > BATTERY_POWER_THRESHOLD){
            powerSource = POWER_MODE_BATTERY;
        }
        
        if(powerVoltage > USB_POWER_THRESHOLD) {
            powerSource = POWER_MODE_USB;
        }

        if(prevPowerSourceStatus != powerSource){
            prevPowerSourceStatus = powerSource;
            
            if(powerSource == POWER_MODE_USB || powerSource == POWER_MODE_BATTERY){
                printEnabled = 1;
            }else{
                printEnabled = 0;
            }

        }
    }
}
