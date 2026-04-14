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
    for (int i = 0; i < NUM_LEDS; i++) {
        // Fade out il LED precedente
        if (i > 0) {
            _leds[i - 1].fadeToBlackBy(120);
        }
        if (i > 1) {
            _leds[i - 2].fadeToBlackBy(200);
        }
        _leds[i] = color;
        FastLED.show();
        delay(delayMs);
    }
    // Spegni la "coda" rimasta
    FastLED.clear();
    FastLED.show();
}

void LedStrip::sweepSequence(CRGB* colors, uint8_t numColors, uint16_t delayMs) {
    for (uint8_t c = 0; c < numColors; c++) {
        CRGB nextColor = colors[(c + 1) % numColors];
        CRGB currColor = colors[c];

        // Sweep con blend graduale verso il colore successivo
        for (int i = 0; i < NUM_LEDS; i++) {
            // Fade coda
            if (i > 0) _leds[i - 1].fadeToBlackBy(60);
            if (i > 1) _leds[i - 2].fadeToBlackBy(120);
            if (i > 2) _leds[i - 3].fadeToBlackBy(180);  // aggiungi un 3° step

            // Blend progressivo: il colore corrente vira verso il prossimo
            // più avanziamo nello sweep, più il colore vira
            uint8_t blendAmount = map(i, 0, NUM_LEDS - 1, 0, 128);
            _leds[i] = blend(currColor, nextColor, blendAmount);

            FastLED.show();
            delay(delayMs);
        }
    }
    FastLED.clear();
    FastLED.show();
}

void LedStrip::defaultSweepSequence() {
    CRGB seq[] = {
        CRGB::Red,
        CRGB::Green,
        CRGB::Blue,
        CRGB::Yellow
    };
    sweepSequence(seq, 4, 60);
}
