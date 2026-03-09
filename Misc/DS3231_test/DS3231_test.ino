#include <Wire.h>
#include "RTClib.h"

RTC_DS3231 rtc;

#define SDA_PIN 21
#define SCL_PIN 22
#define SQW_PIN 23

volatile bool secondTick = false;

// Interrupt Service Routine
void IRAM_ATTR onSecondTick() {
  secondTick = true;
}

void setup() {
  Serial.begin(115200);

  // Inizializza I2C con pin personalizzati
  Wire.begin(SDA_PIN, SCL_PIN, 400000);

  if (!rtc.begin()) {
    Serial.println("RTC non trovato!");
    while (1);
  }

  // Imposta data e ora (ESEGUI UNA SOLA VOLTA POI COMMENTA)
  rtc.adjust(DateTime(2026, 2, 25, 12, 0, 0));

  // Disabilita allarmi
  rtc.disableAlarm(1);
  rtc.disableAlarm(2);
  rtc.clearAlarm(1);
  rtc.clearAlarm(2);

  // Disabilita onda quadra classica
  rtc.writeSqwPinMode(DS3231_OFF);

  // Configura interrupt ogni secondo
  rtc.writeSqwPinMode(DS3231_SquareWave1Hz);

  // Configura pin interrupt su ESP32
  pinMode(SQW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(SQW_PIN), onSecondTick, FALLING);

  Serial.println("Sistema pronto");
}

void loop() {

  if (secondTick) {
    secondTick = false;

    DateTime now = rtc.now();

    Serial.print("Orario: ");
    Serial.print(now.year());
    Serial.print("/");
    Serial.print(now.month());
    Serial.print("/");
    Serial.print(now.day());
    Serial.print(" ");
    Serial.print(now.hour());
    Serial.print(":");
    Serial.print(now.minute());
    Serial.print(":");
    Serial.println(now.second());
  }
}