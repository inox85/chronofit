#include "RTC.h"
#include <Wire.h>
#include "Params.h"

static RTC_DS3231 rtc;   // 👈 unica istanza privata al modulo


void rtc_init(uint8_t sda, uint8_t scl, uint32_t freq)
{
    // Rilascia il reset PRIMA di inizializzare il bus
    delay(100);  // Dai tempo al chip di stabilizzarsi

    Wire.begin(sda, scl, freq);

    // Scan I2C per debug - utile per verificare se il chip risponde
    Serial.println("Scanning I2C...");
    Wire.beginTransmission(0x68);  // indirizzo DS3231
    byte error = Wire.endTransmission();
    if (error == 0) {
        Serial.println("DS3231 trovato su 0x68!");
    } else {
        Serial.print("Errore I2C: ");
        Serial.println(error);
    }

    if (!rtc.begin()) {
        Serial.println("RTC non trovato");
        while(1);
    }
}

void rtc_enable_1hz(void)
{
    rtc.disableAlarm(1);
    rtc.disableAlarm(2);
    rtc.clearAlarm(1);
    rtc.clearAlarm(2);

    rtc.writeSqwPinMode(DS3231_SquareWave1Hz);
}

void rtc_disable_sqw(void)
{   
    rtc.disableAlarm(1);
    rtc.disableAlarm(2);
    rtc.clearAlarm(1);
    rtc.clearAlarm(2);

    rtc.writeSqwPinMode(DS3231_OFF);
}

void rtc_set_datetime(uint16_t year, uint8_t month, uint8_t day,
                      uint8_t hour, uint8_t minute, uint8_t second)
{
    rtc.adjust(DateTime(year, month, day, hour, minute, second));
}

DateTime rtc_now(void)
{
    return rtc.now();
}

bool writeAgingOffset(int8_t offset)
{
    // Scrittura
    Wire.beginTransmission(DS3231_ADDR);
    Wire.write(AGING_REG);
    Wire.write((uint8_t)offset);   // scriviamo come byte
    if (Wire.endTransmission() != 0)
        return false;  // errore I2C

    delay(10); // piccolo delay di sicurezza

    // Lettura di verifica
    Wire.beginTransmission(DS3231_ADDR);
    Wire.write(AGING_REG);
    if (Wire.endTransmission(false) != 0)
        return false;

    Wire.requestFrom(DS3231_ADDR, 1);
    if (Wire.available() != 1)
        return false;
        
    int8_t readValue = (int8_t)Wire.read();

    return (readValue == offset);
}

int8_t readAgingOffset()
{
    Wire.beginTransmission(DS3231_ADDR);
    Wire.write(AGING_REG);
    Wire.endTransmission(false);

    Wire.requestFrom(DS3231_ADDR, 1);

    if (Wire.available())
        return (int8_t)Wire.read();

    return 0; // fallback
}

float rtc_get_temperature()
{
    // Wire.beginTransmission(0x68);
    // Wire.write(0x11);
    // Wire.endTransmission();

    // Wire.requestFrom(0x68, 2);
    // int8_t msb = Wire.read();
    // uint8_t lsb = Wire.read();
    // float temperature = msb + ((lsb >> 6) * 0.25f);
    // Serial.println(temperature, 2);
    // return temperature;
    return rtc.getTemperature();
}