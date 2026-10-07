#include "cell_sensor.h"
#include "cell_config.h"
#include "esp_timer.h"

static const int kPins[4] = {CELL_PIN_IN1, CELL_PIN_IN2, CELL_PIN_IN3, CELL_PIN_IN4};

static int      s_pin = CELL_PIN_IN1;
static uint64_t s_lockoutUs = 50000;

// Ring buffer single-producer (ISR) / single-consumer (loop): niente lock.
constexpr int RING_SIZE = 16;
static volatile uint64_t s_ring[RING_SIZE];
static volatile uint8_t  s_head = 0;
static volatile uint8_t  s_tail = 0;
static volatile uint64_t s_lastEdgeUs = 0;
static volatile uint32_t s_lockedOut = 0;

static void IRAM_ATTR sensorISR() {
  uint64_t now = (uint64_t)esp_timer_get_time();
  if (s_lastEdgeUs != 0 && (now - s_lastEdgeUs) < s_lockoutUs) {
    s_lockedOut = s_lockedOut + 1;
    return;
  }
  s_lastEdgeUs = now;
  uint8_t next = (uint8_t)((s_head + 1) % RING_SIZE);
  if (next == s_tail) return;   // pieno: scarta (non succede a ritmi umani)
  s_ring[s_head] = now;
  s_head = next;
}

void cellSensorBegin(int input, uint32_t lockoutMs) {
  if (input < 1 || input > 4) input = 1;
  s_pin = kPins[input - 1];
  s_lockoutUs = (uint64_t)lockoutMs * 1000ULL;
  pinMode(s_pin, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(s_pin), sensorISR, FALLING);
}

bool cellSensorPop(uint64_t &localUs) {
  if (s_tail == s_head) return false;
  localUs = s_ring[s_tail];
  s_tail = (uint8_t)((s_tail + 1) % RING_SIZE);
  return true;
}

bool cellSensorActive() {
  return digitalRead(s_pin) == LOW;
}

uint32_t cellSensorLockedOutCount() {
  return s_lockedOut;
}
