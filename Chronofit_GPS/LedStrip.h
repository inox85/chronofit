#pragma once

#include <FastLED.h>

#define LED_PIN       12
#define NUM_LEDS      4
#define LED_TYPE      WS2812B
#define COLOR_ORDER   GRB
#define BRIGHTNESS    80
#define SWEEP_DELAY   150

class LedStrip {
public:
    LedStrip();

    void begin();

    // --- Controllo singolo LED ---
    void setLed(uint8_t index, CRGB color);
    void turnOffLed(uint8_t index);
    void turnOffAll();

    // --- Effetti ---
    void sweepEffect(CRGB color, uint16_t delayMs = SWEEP_DELAY);
    void sweepSequence(CRGB* colors, uint8_t numColors, uint16_t delayMs = SWEEP_DELAY);

    // Sequenza predefinita: Rosso → Verde → Blu → Giallo
    void defaultSweepSequence();

private:
    CRGB _leds[NUM_LEDS];
};
