#include "power.h"
#include "board.h"
#include <RunningMedian.h>
#include "settings.h"

// Tensione batteria = tensione sul pin (analogReadMilliVolts, già corretta con la
// taratura di fabbrica dell'ADC salvata nel chip) * fattore del partitore / 1000.
// Il fattore si tara su ogni scheda con una misura al tester (powerBatteryCalibrate),
// perché da un esemplare all'altro cambiano le tolleranze di partitore e ADC: con la
// formula di Chronofit_BLE (ADC grezzo * 4,1) l'errore andava da -2 % a +25 %.
// Il default è la media ricavata dalle prime misure su due schede.
constexpr int      BATTERY_FACTOR_DEFAULT    = 4100;   // millesimi
constexpr int      BATTERY_FACTOR_MIN        = 2000;
constexpr int      BATTERY_FACTOR_MAX        = 8000;
// Sotto questa tensione (reale) la scheda si spegne per proteggere la cella Li-ion.
// Con il vecchio coefficiente i 2800 "letti" di Chronofit_BLE corrispondevano a circa 2,2 V reali.
constexpr int      BATTERY_THRESHOLD_MV      = 2900;
// Batteria bassa (powerBatteryLow) e barra sui LED (powerBatteryBar) usano la carica
// in % calcolata dalla Main con la sua curva di scarica (battery_curve.cpp in
// Chronofit_Main_Cell_RF), passata con powerSetBatteryPercent(): la Main per sé,
// la Cell RF dalla risposta al sync. Se non arriva da BATTERY_PCT_VALID_MS (Main
// vecchia o non raggiungibile) si usano le soglie in tensione, ricavate dalla curva
// tipica (100 % da 3900 mV). Con l'isteresi un valore che oscilla attorno alla
// soglia non accende e spegne l'avviso.
constexpr int      BATTERY_LOW_PCT           = 30;
constexpr int      BATTERY_LOW_HYST_PCT      = 3;
constexpr int      BATTERY_LOW_MV            = 3550;   // ≈ 30 % sulla curva tipica
constexpr int      BATTERY_LOW_HYST_MV       = 50;
constexpr uint32_t BATTERY_PCT_VALID_MS      = 30000;
constexpr uint32_t BATTERY_SAMPLE_INTERVAL   = 100;
constexpr uint32_t LOW_BATTERY_RETRY_MS      = 60000;  // se resta accesa (USB) si riprova dopo un minuto
constexpr int      BATTERY_AVERAGE_SAMPLES   = 50;
constexpr int      BUTTON_ADC_THRESHOLD      = 50;
constexpr uint32_t BUTTON_STEP_MS            = 500;
// Antirimbalzo del pulsante: una lettura isolata sotto soglia (rimbalzo del
// contatto, pressione del dito che varia, rumore dell'ADC) non deve valere come
// rilascio, altrimenti il conto alla rovescia di spegnimento riparte da capo.
constexpr uint32_t BUTTON_SAMPLE_MS          = 10;
constexpr uint32_t BUTTON_PRESS_DEBOUNCE_MS  = 30;
constexpr uint32_t BUTTON_RELEASE_DEBOUNCE_MS = 200;
// Pressione breve (rilascio entro SHORT_PRESS_MS): i LED mostrano la carica per
// BATTERY_SHOW_MS, come una barra: > 75 % = 4 LED, > 50 % = 3, > 25 % = 2,
// sotto = 1 lampeggiante.
constexpr uint32_t SHORT_PRESS_MS            = 500;
constexpr uint32_t BATTERY_SHOW_MS           = 3000;
constexpr int      BATTERY_BAR_PCT[3]        = {75, 50, 25};
constexpr int      BATTERY_BAR_MV[3]         = {3770, 3650, 3520};   // le stesse sulla curva tipica

static RunningMedian s_batterySamples(BATTERY_AVERAGE_SAMPLES);
static void (*s_beep)() = nullptr;
static uint32_t s_lastSampleMs = 0;
static int      s_batteryMv = 0;
static int      s_batteryFactor = BATTERY_FACTOR_DEFAULT;
static uint32_t s_lastLowBatteryOff = 0;
static bool     s_batteryLow = false;
static volatile int      s_batteryPct = -1;       // dalla Main, -1 = non nota
static volatile uint32_t s_batteryPctMs = 0;

// Carica in % dalla Main, se recente; -1 altrimenti
static int batteryPct() {
  int pct = s_batteryPct;
  if (pct < 0 || (uint32_t)(millis() - s_batteryPctMs) > BATTERY_PCT_VALID_MS) return -1;
  return pct;
}

// Il pulsante serve anche ad accendere: all'avvio è ancora premuto. Lo spegnimento
// si arma solo dopo averlo visto rilasciato una volta.
static bool     s_buttonArmed = false;
static uint32_t s_pressStartMs = 0;
static bool     s_pressed = false;         // stato con antirimbalzo
static bool     s_rawPressed = false;      // ultima lettura grezza
static uint32_t s_rawChangeMs = 0;         // istante dell'ultimo cambio della lettura grezza
static uint32_t s_lastButtonSampleMs = 0;
static uint32_t s_batteryShowUntilMs = 0;   // 0 = barra della carica non visibile

static const int kLeds[4] = {PIN_LED1, PIN_LED2, PIN_LED3, PIN_LED4};

static void allLeds(bool on) {
  for (int pin : kLeds) digitalWrite(pin, on ? HIGH : LOW);
}

static bool readButton() {
  return analogRead(PIN_ADC_BUTTON) > BUTTON_ADC_THRESHOLD;
}

static int readBatteryMv() {
  return (int)(((int64_t)analogReadMilliVolts(PIN_ADC_BATTERY) * s_batteryFactor) / 1000);
}

void powerBegin(void (*beep)()) {
  s_beep = beep;
  pinMode(PIN_GATE_CONTROL, OUTPUT);
  digitalWrite(PIN_GATE_CONTROL, HIGH);

  for (int pin : kLeds) pinMode(pin, OUTPUT);
  pinMode(PIN_BATTERY_CHARGE, INPUT);
  pinMode(PIN_BATTERY_STBY, INPUT);

  for (int pin : kLeds) { digitalWrite(pin, HIGH); delay(150); }
  allLeds(false);

  s_batteryFactor = readIntFromSettings("bat_factor", BATTERY_FACTOR_DEFAULT);
  if (s_batteryFactor < BATTERY_FACTOR_MIN || s_batteryFactor > BATTERY_FACTOR_MAX) s_batteryFactor = BATTERY_FACTOR_DEFAULT;
  s_batteryMv = readBatteryMv();
}

static void sampleBattery() {
  uint32_t now = millis();
  if (s_lastSampleMs != 0 && (uint32_t)(now - s_lastSampleMs) < BATTERY_SAMPLE_INTERVAL) return;
  s_lastSampleMs = now;

  s_batterySamples.add(readBatteryMv());
  s_batteryMv = s_batterySamples.getMedian();

  int pct = batteryPct();
  if (!s_batterySamples.isFull() || powerExternal()) s_batteryLow = false;
  else if (pct >= 0) {
    if (pct < BATTERY_LOW_PCT) s_batteryLow = true;
    else if (pct >= BATTERY_LOW_PCT + BATTERY_LOW_HYST_PCT) s_batteryLow = false;
  }
  else if (s_batteryMv < BATTERY_LOW_MV) s_batteryLow = true;
  else if (s_batteryMv > BATTERY_LOW_MV + BATTERY_LOW_HYST_MV) s_batteryLow = false;

  // Solo a buffer pieno: una lettura bassa all'avvio non spegne la scheda.
  if (s_batterySamples.isFull() && s_batteryMv < BATTERY_THRESHOLD_MV &&
      (s_lastLowBatteryOff == 0 || (uint32_t)(now - s_lastLowBatteryOff) > LOW_BATTERY_RETRY_MS)) {
    s_lastLowBatteryOff = now;
    Serial.printf("[power] batteria scarica (%d mV): spegnimento\n", s_batteryMv);
    for (int i = 0; i < 10; i++) { allLeds(false); delay(25); allLeds(true); delay(25); }
    powerOff();
  }
}

static void updateButton() {
  uint32_t now = millis();
  if ((uint32_t)(now - s_lastButtonSampleMs) < BUTTON_SAMPLE_MS) return;
  s_lastButtonSampleMs = now;

  bool raw = readButton();
  if (raw != s_rawPressed) { s_rawPressed = raw; s_rawChangeMs = now; }
  uint32_t stableMs = now - s_rawChangeMs;

  if (!s_buttonArmed) {
    if (!raw && stableMs >= BUTTON_RELEASE_DEBOUNCE_MS) s_buttonArmed = true;
    return;
  }
  if (!s_pressed && raw && stableMs >= BUTTON_PRESS_DEBOUNCE_MS) {
    s_pressed = true;
    s_pressStartMs = s_rawChangeMs;   // il conto parte dall'inizio della pressione
  } else if (s_pressed && !raw && stableMs >= BUTTON_RELEASE_DEBOUNCE_MS) {
    s_pressed = false;
    if ((uint32_t)(s_rawChangeMs - s_pressStartMs) < SHORT_PRESS_MS)
      s_batteryShowUntilMs = (now + BATTERY_SHOW_MS) | 1;
  }
  // `raw` evita lo spegnimento se il pulsante è appena stato rilasciato e il
  // rilascio non è ancora confermato dall'antirimbalzo.
  if (s_pressed && raw && (uint32_t)(now - s_pressStartMs) >= 4 * BUTTON_STEP_MS + BUTTON_STEP_MS) {
    Serial.println("[power] pulsante: spegnimento");
    s_pressed = false;
    s_buttonArmed = false;   // se resta accesa (USB) serve un nuovo rilascio
    powerOff();
  }
}

void powerUpdate() {
  sampleBattery();
  updateButton();
}

int powerBatteryBar() {
  if (s_batteryShowUntilMs == 0) return -1;
  uint32_t now = millis();
  if ((int32_t)(s_batteryShowUntilMs - now) <= 0) { s_batteryShowUntilMs = 0; return -1; }
  if (s_batteryMv <= 0) return 0;
  int leds = 1;
  int pct = batteryPct();
  for (int i = 0; i < 3; i++) {
    if (pct >= 0 ? pct > BATTERY_BAR_PCT[i] : s_batteryMv > BATTERY_BAR_MV[i]) { leds = 4 - i; break; }
  }
  if (leds == 1 && (now % 400) >= 200) return 0;   // 1 LED: lampeggia
  return leds;
}

int powerButtonCountdown() {
  if (!s_pressed) return -1;
  int steps = (int)((uint32_t)(millis() - s_pressStartMs) / BUTTON_STEP_MS);
  return steps >= 4 ? 0 : 4 - steps;
}

void powerOff() {
  digitalWrite(PIN_GATE_CONTROL, LOW);
  allLeds(true);  delay(100);
  allLeds(false); delay(100);
  allLeds(true);  delay(100);
  allLeds(false);
  if (s_beep) s_beep();
  // Se dopo l'attesa è ancora accesa è alimentata da USB: si continua a funzionare
  // (l'autoritenuta resta bassa, come in Chronofit_BLE).
  delay(5000);
}

int powerBatteryMv() { return s_batteryMv; }

bool powerBatteryLow() { return s_batteryLow; }

void powerSetBatteryPercent(int pct) {
  s_batteryPct = pct;
  s_batteryPctMs = millis();
}

int powerBatteryFactor() { return s_batteryFactor; }

int powerBatteryCalibrate(int realMv) {
  if (realMv < 2500 || realMv > 5000) return -1;
  int pinMv = analogReadMilliVolts(PIN_ADC_BATTERY);
  if (pinMv <= 50) return -1;   // pin scollegato o batteria assente
  int factor = (int)(((int64_t)realMv * 1000) / pinMv);
  if (factor < BATTERY_FACTOR_MIN || factor > BATTERY_FACTOR_MAX) return -1;
  s_batteryFactor = factor;
  writeIntToSettings("bat_factor", factor);
  // La mediana conteneva letture con il fattore vecchio: si riparte da zero.
  s_batterySamples.clear();
  s_batteryMv = readBatteryMv();
  Serial.printf("[power] batteria tarata: %d mV reali, pin %d mV, fattore %d\n", realMv, pinMv, factor);
  return factor;
}
bool powerCharging() { return digitalRead(PIN_BATTERY_CHARGE) == LOW; }
bool powerCharged()  { return digitalRead(PIN_BATTERY_STBY) == LOW; }
bool powerExternal() { return powerCharging() || powerCharged(); }
