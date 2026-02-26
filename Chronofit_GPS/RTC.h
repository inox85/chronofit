#ifndef RTC_H
#define RTC_H

#include <RTClib.h>
#include <Arduino.h>

void rtc_init(uint8_t sda, uint8_t scl, uint32_t freq);
void rtc_enable_1hz(void);

void rtc_set_datetime(uint16_t year, uint8_t month, uint8_t day,
                      uint8_t hour, uint8_t minute, uint8_t second);

DateTime rtc_now(void);

#endif