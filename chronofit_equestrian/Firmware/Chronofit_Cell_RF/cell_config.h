#ifndef CELL_CONFIG_H
#define CELL_CONFIG_H

#include <Arduino.h>
#include "board.h"

#define CELL_FW_VERSION "CR1.5.0"   // max 8 caratteri (campo fw dei pacchetti radio)

// ── Coda eventi ─────────────────────────────────────────────────────────────
constexpr int      CELL_QUEUE_SIZE       = 32;
constexpr uint64_t CELL_EVENT_MAX_AGE_US = 300000000ULL;   // 5 min = finestra della Main

// ── Sync del clock con la Main ──────────────────────────────────────────────
constexpr int      CELL_SYNC_SAMPLES   = 8;
constexpr uint32_t CELL_SYNC_PERIOD_MS = 1000;   // è anche il battito di presenza
constexpr uint32_t CELL_SYNC_BURST_GAP_MS = 30;  // raffica iniziale
constexpr uint32_t CELL_SYNC_VALID_MS  = 5000;   // offset utilizzabile entro l'ultimo campione OK
// Un campione il cui offset differisce di più da quello stimato non è jitter: il clock
// della Main è ripartito (riavvio). Servono due campioni concordi per riazzerare la finestra.
constexpr int64_t  CELL_SYNC_JUMP_US   = 500000;
// Oltre questo ritardo il sync è considerato a precisione ridotta (LED).
constexpr uint32_t CELL_SYNC_DEGRADED_US = 5000;

// ── Link ────────────────────────────────────────────────────────────────────
constexpr int      CELL_LINK_WINDOW    = 20;     // scambi su cui si calcola la qualità del link
constexpr uint32_t CELL_MAIN_LOST_MS   = 5000;   // Main non sentita da più di così = link giù

// Una Cell già abbinata può passare a un'altra Main in abbinamento solo se, da
// quando è accesa, non ha mai sentito la sua Main ed è accesa da meno di così.
// Per riabbinarla a una Main nuova basta riaccenderla vicino a quella.
constexpr uint32_t CELL_REPAIR_WINDOW_MS = 120000;

// ── Default della configurazione (poi la decide la Main) ────────────────────
constexpr int      CELL_DEFAULT_LINE       = 1;
constexpr uint32_t CELL_DEFAULT_LOCKOUT_MS = 200;

constexpr uint32_t CELL_DEBOUNCE_MS = 10;

#endif
