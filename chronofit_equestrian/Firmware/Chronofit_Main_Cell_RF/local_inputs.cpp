#include "local_inputs.h"
#include "constants.h"
#include "globals.h"
#include "settings.h"
#include "cells.h"
#include "esp_timer.h"

struct LocalInput {
  int               pin;
  volatile bool     state;      // stato confermato (true = attivo = LOW)
  volatile bool     pending;    // fronte in attesa di conferma
  volatile uint64_t edgeUs;     // istante del fronte (esp_timer)
  uint64_t          lastEventUs;
  volatile int      line;       // 1..4, 0 = disattivato
};

static LocalInput s_barrier = {PIN_BARRIER, false, false, 0, 0, 1};
static LocalInput s_pad     = {PIN_PAD,     false, false, 0, 0, 0};
static volatile int s_padEdge = PAD_EDGE_RELEASE;

static void IRAM_ATTR onInputEdge(void *arg) {
  LocalInput *in = (LocalInput *)arg;
  if (in->pending) return;
  bool level = !digitalRead(in->pin);
  if (level != in->state) {
    in->edgeUs = (uint64_t)esp_timer_get_time();
    in->pending = true;
  }
}

// Un fronte confermato diventa un passaggio sulla linea dell'ingresso.
static void emitEvent(LocalInput &in, uint64_t tUs) {
  int line = in.line;
  if (line < 1 || line > 4) return;
  int idx = line - 1;
  if (in.lastEventUs != 0 && (tUs - in.lastEventUs) < (uint64_t)delays[idx] * 1000ULL) return;  // lockout
  in.lastEventUs = tUs;

  portENTER_CRITICAL(&isrMux);
  sensorTime[idx] = tUs;
  sensorTriggered[idx] = true;
  portEXIT_CRITICAL(&isrMux);
}

// Ritorna true se lo stato confermato è cambiato; `edgeUs` = istante del fronte.
// L'istante va copiato PRIMA di azzerare `pending`: subito dopo l'interrupt può
// registrare un fronte nuovo.
static bool checkInput(LocalInput &in, uint64_t &edgeUs) {
  if (!in.pending) {
    // fronte non intercettato dall'interrupt: ripiego sul polling
    if (!digitalRead(in.pin) == in.state) return false;
    in.edgeUs = (uint64_t)esp_timer_get_time();
    in.pending = true;
  }

  // Debounce non bloccante: lo stato si conferma LOCAL_DEBOUNCE_MS dopo il fronte.
  edgeUs = in.edgeUs;
  uint64_t nowUs = (uint64_t)esp_timer_get_time();
  if (nowUs < edgeUs || (nowUs - edgeUs) < (uint64_t)LOCAL_DEBOUNCE_MS * 1000ULL) return false;

  bool newState = !digitalRead(in.pin);
  in.pending = false;
  if (newState == in.state) return false;
  in.state = newState;
  cellsMarkDirty();   // stato dell'ingresso in console (riquadro delle linee)
  return true;
}

void localInputsBegin() {
  s_barrier.line = readIntFromSettings("in_bar_line", 1);
  s_pad.line     = readIntFromSettings("in_pad_line", 0);
  s_padEdge      = readIntFromSettings("in_pad_edge", PAD_EDGE_RELEASE);

  pinMode(PIN_BARRIER, INPUT);
  pinMode(PIN_PAD, INPUT);
  s_barrier.state = !digitalRead(PIN_BARRIER);
  s_pad.state     = !digitalRead(PIN_PAD);

  attachInterruptArg(digitalPinToInterrupt(PIN_BARRIER), onInputEdge, &s_barrier, CHANGE);
  attachInterruptArg(digitalPinToInterrupt(PIN_PAD), onInputEdge, &s_pad, CHANGE);
}

void localInputsPoll() {
  uint64_t edgeUs;
  if (checkInput(s_barrier, edgeUs) && s_barrier.state) emitEvent(s_barrier, edgeUs);

  if (checkInput(s_pad, edgeUs)) {
    bool fire = (s_padEdge == PAD_EDGE_CONTACT) ? s_pad.state : !s_pad.state;
    if (fire) emitEvent(s_pad, edgeUs);
  }
}

void localInputsConfigure(int barrierLine, int padLine, int padEdge) {
  if (barrierLine >= 0 && barrierLine <= 4) {
    s_barrier.line = barrierLine;
    writeIntToSettings("in_bar_line", barrierLine);
  }
  if (padLine >= 0 && padLine <= 4) {
    s_pad.line = padLine;
    writeIntToSettings("in_pad_line", padLine);
  }
  if (padEdge == PAD_EDGE_CONTACT || padEdge == PAD_EDGE_RELEASE) {
    s_padEdge = padEdge;
    writeIntToSettings("in_pad_edge", padEdge);
  }
}

int  localBarrierLine()   { return s_barrier.line; }
int  localPadLine()       { return s_pad.line; }
int  localPadEdge()       { return s_padEdge; }
bool localBarrierActive() { return s_barrier.state; }
bool localPadActive()     { return s_pad.state; }
