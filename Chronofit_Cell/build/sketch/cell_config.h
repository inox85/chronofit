#line 1 "C:\\src\\chronofit\\Chronofit_Cell\\cell_config.h"
#ifndef CELL_CONFIG_H
#define CELL_CONFIG_H

#include <Arduino.h>

#define CELL_FW_VERSION "C1.1.0"

// ── Hardware (stessa scheda del base Chronofit, VER2) ───────────────────────
constexpr int CELL_PIN_IN1 = 0;    // pin di boot: ok come ingresso con pull-up
constexpr int CELL_PIN_IN2 = 25;
constexpr int CELL_PIN_IN3 = 27;
constexpr int CELL_PIN_IN4 = 26;
constexpr int CELL_LED_PIN = 12;   // WS2812, 4 LED
constexpr int CELL_NUM_LEDS = 4;
constexpr int CELL_BUZZER_PIN = 15;

// ── Rete ────────────────────────────────────────────────────────────────────
// Subnet della AP della cella: DEVE essere diversa da quella del base
// (192.168.10.x) altrimenti, collegata in STA al base, non instrada.
#define CELL_AP_IP        192, 168, 11, 1
#define CELL_AP_GATEWAY   192, 168, 11, 1
#define CELL_AP_SUBNET    255, 255, 255, 0
constexpr int CELL_AP_CHANNEL = 6;            // = canale AP del base
constexpr const char* CELL_DEFAULT_BASE_HOST = "192.168.10.1";

// ── Coda eventi / sync clock ────────────────────────────────────────────────
constexpr int      CELL_QUEUE_SIZE        = 32;
constexpr uint64_t CELL_EVENT_MAX_AGE_US  = 300000000ULL; // 5 min = finestra del base
constexpr int      CELL_SYNC_SAMPLES      = 8;
constexpr uint32_t CELL_SYNC_PERIOD_MS    = 3000;
constexpr uint32_t CELL_SYNC_VALID_MS     = 15000;        // offset utilizzabile entro l'ultimo campione OK

#endif
