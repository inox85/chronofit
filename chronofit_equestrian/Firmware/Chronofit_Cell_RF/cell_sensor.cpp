#include "cell_sensor.h"
#include "cell_config.h"
#include "esp_timer.h"

static volatile bool     s_state = false;     // stato confermato (true = attivo = LOW)
static volatile bool     s_pending = false;   // fronte in attesa di conferma
static volatile uint64_t s_edgeUs = 0;
static volatile uint64_t s_lockoutUs = (uint64_t)CELL_DEFAULT_LOCKOUT_MS * 1000ULL;
static uint64_t          s_lastEventUs = 0;
static uint32_t          s_lockedOut = 0;

static void IRAM_ATTR onEdge() {
  if (s_pending) return;
  bool level = !digitalRead(PIN_BARRIER);
  if (level != s_state) {
    s_edgeUs = (uint64_t)esp_timer_get_time();
    s_pending = true;
  }
}

void cellSensorBegin(uint32_t lockoutMs) {
  cellSensorSetLockout(lockoutMs);
  pinMode(PIN_BARRIER, INPUT);
  s_state = !digitalRead(PIN_BARRIER);
  attachInterrupt(digitalPinToInterrupt(PIN_BARRIER), onEdge, CHANGE);
}

void cellSensorSetLockout(uint32_t lockoutMs) {
  s_lockoutUs = (uint64_t)lockoutMs * 1000ULL;
}

bool cellSensorPoll(uint64_t &localUs) {
  if (!s_pending) {
    // fronte non intercettato dall'interrupt: ripiego sul polling
    if (!digitalRead(PIN_BARRIER) == s_state) return false;
    s_edgeUs = (uint64_t)esp_timer_get_time();
    s_pending = true;
  }

  // L'istante va copiato PRIMA di azzerare s_pending: subito dopo l'interrupt
  // può registrare un fronte nuovo.
  uint64_t edgeUs = s_edgeUs;
  uint64_t nowUs = (uint64_t)esp_timer_get_time();
  if (nowUs < edgeUs || (nowUs - edgeUs) < (uint64_t)CELL_DEBOUNCE_MS * 1000ULL) return false;

  bool newState = !digitalRead(PIN_BARRIER);
  s_pending = false;
  if (newState == s_state) return false;
  s_state = newState;
  if (!newState) return false;   // il passaggio è il fronte verso "attivo"

  if (s_lastEventUs != 0 && (edgeUs - s_lastEventUs) < s_lockoutUs) {
    s_lockedOut++;
    return false;
  }
  s_lastEventUs = edgeUs;
  localUs = edgeUs;
  return true;
}

bool cellSensorActive() { return s_state; }

uint32_t cellSensorLockedOutCount() { return s_lockedOut; }
