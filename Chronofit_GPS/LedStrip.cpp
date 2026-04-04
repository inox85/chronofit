#include "LedStrip.h"

LedStrip::LedStrip() {}

void LedStrip::begin() {
    FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(_leds, NUM_LEDS);
    FastLED.setBrightness(BRIGHTNESS);
    FastLED.clear();
    FastLED.show();
}

// ─────────────────────────────────────────
//  Controllo singolo LED
// ─────────────────────────────────────────

void LedStrip::setLed(uint8_t index, CRGB color) {
    if (index >= NUM_LEDS) return;
    _leds[index] = color;
    FastLED.show();
}

void LedStrip::turnOffLed(uint8_t index) {
    if (index >= NUM_LEDS) return;
    _leds[index] = CRGB::Black;
    FastLED.show();
}

void LedStrip::turnOffAll() {
    FastLED.clear();
    FastLED.show();
}

// ─────────────────────────────────────────
//  Effetti
// ─────────────────────────────────────────

void LedStrip::sweepEffect(CRGB color, uint16_t delayMs) {
    // Accensione da sinistra a destra
    for (uint8_t i = 0; i < NUM_LEDS; i++) {
        _leds[i] = color;
        FastLED.show();
        delay(delayMs);
    }

    delay(300);

    // Spegnimento da sinistra a destra
    for (uint8_t i = 0; i < NUM_LEDS; i++) {
        _leds[i] = CRGB::Black;
        FastLED.show();
        delay(delayMs);
    }

    delay(200);
}

void LedStrip::sweepSequence(CRGB* colors, uint8_t numColors, uint16_t delayMs) {
    for (uint8_t c = 0; c < numColors; c++) {
        sweepEffect(colors[c], delayMs);
    }
}

void LedStrip::defaultSweepSequence() {
    CRGB seq[] = {
        CRGB::Red,
        CRGB::Green,
        CRGB::Blue,
        CRGB::Yellow
    };
    sweepSequence(seq, 4);
}
