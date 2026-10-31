#include "license.h"
#include "license_secret.h"   // LICENSE_SECRET[32]
#include "settings.h"
#include <mbedtls/md.h>
#include <esp_system.h>

static const int      LIC_UNLIMITED = 0xFFFF;
static const char    *CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

static uint64_t s_device = 0;   // eFuse MAC, 48 bit
static int      s_left = 0;        // utilizzi residui dopo questa accensione (LIC_UNLIMITED = illimitata)
static int      s_seq = 0;         // ultimo progressivo applicato
static bool     s_active = false;  // questa accensione può cronometrare
static bool     s_pendingBoot = false;  // accensione vera ancora da contare (vedi licenseLoop)
static uint32_t s_bootId = 0;      // cambia a ogni avvio: la console mostra il popup una volta per avvio

static uint64_t deviceId() {
  return ESP.getEfuseMac() & 0xFFFFFFFFFFFFULL;
}

// Come chipIdStr (routes.cpp), ma sempre di 12 cifre
static String deviceCode() {
  char b[13];
  snprintf(b, sizeof(b), "%04x%08x", (unsigned)(s_device >> 32), (unsigned)(s_device & 0xFFFFFFFF));
  return String(b);
}

// HMAC-SHA256(segreto, "CFL2" | dispositivo (6 byte) | progressivo | accensioni), primi 6 byte
static void tagFor(uint64_t dev, uint16_t seq, uint16_t boots, uint8_t out[6]) {
  uint8_t msg[14] = {'C', 'F', 'L', '2',
                     (uint8_t)(dev >> 40), (uint8_t)(dev >> 32), (uint8_t)(dev >> 24),
                     (uint8_t)(dev >> 16), (uint8_t)(dev >> 8), (uint8_t)dev,
                     (uint8_t)(seq >> 8), (uint8_t)seq, (uint8_t)(boots >> 8), (uint8_t)boots};
  uint8_t full[32];
  mbedtls_md_hmac(mbedtls_md_info_from_type(MBEDTLS_MD_SHA256),
                  LICENSE_SECRET, sizeof(LICENSE_SECRET), msg, sizeof(msg), full);
  memcpy(out, full, 6);
}

// 16 caratteri base32 Crockford → 10 byte. Ignora trattini e spazi, accetta
// minuscole e le lettere che si confondono con le cifre (O = 0, I/L = 1).
static bool decode(const char *code, uint8_t out[10]) {
  uint8_t vals[16];
  int n = 0;
  for (const char *p = code; *p; p++) {
    char c = toupper((unsigned char)*p);
    if (c == '-' || c == ' ') continue;
    if (c == 'O') c = '0';
    if (c == 'I' || c == 'L') c = '1';
    const char *f = strchr(CROCKFORD, c);
    if (!f || c == 0 || n >= 16) return false;
    vals[n++] = (uint8_t)(f - CROCKFORD);
  }
  if (n != 16) return false;
  memset(out, 0, 10);
  for (int i = 0; i < 16; i++) {
    for (int b = 0; b < 5; b++) {
      int bit = i * 5 + b;
      if (vals[i] & (0x10 >> b)) out[bit / 8] |= (uint8_t)(0x80 >> (bit % 8));
    }
  }
  return true;
}

void licenseBegin() {
  s_device = deviceId();
  s_bootId = esp_random() | 1;
  s_seq = readIntFromSettings("lic_seq", 0);
  s_left = readIntFromSettings("lic_left", 0);
  if (s_left == LIC_UNLIMITED) { s_active = true; return; }
  if (s_left <= 0) { s_left = 0; s_active = false; return; }
  s_active = true;
  // Solo le accensioni vere consumano un utilizzo, e non subito: si conta dopo
  // LICENSE_COMMIT_MS di funzionamento o al primo passaggio (licenseLoop, licenseCountPassage),
  // così programmazione, pressione di EN e monitor seriale non consumano nulla.
  s_pendingBoot = (esp_reset_reason() == ESP_RST_POWERON);
}

static void commitBoot() {
  if (!s_pendingBoot) return;
  s_pendingBoot = false;
  if (s_left > 0 && s_left != LIC_UNLIMITED) {
    s_left--;
    writeIntToSettings("lic_left", s_left);
  }
}

void licenseLoop() {
  if (s_pendingBoot && millis() >= LICENSE_COMMIT_MS) commitBoot();
}

void licenseCountPassage() {
  commitBoot();
}

bool licenseActive() { return s_active; }

LicenseResult licenseApply(const char *code) {
  uint8_t raw[10];
  if (!decode(code, raw)) return LICENSE_ERR_FORMAT;
  uint16_t seq = ((uint16_t)raw[0] << 8) | raw[1];
  uint16_t boots = ((uint16_t)raw[2] << 8) | raw[3];
  uint8_t tag[6];
  tagFor(s_device, seq, boots, tag);
  uint8_t diff = 0;
  for (int i = 0; i < 6; i++) diff |= tag[i] ^ raw[4 + i];
  if (diff) return LICENSE_ERR_INVALID;
  if (seq <= s_seq) return LICENSE_ERR_USED;
  s_seq = seq;
  s_left = boots;
  s_pendingBoot = false;   // un nuovo codice imposta gli utilizzi: l'accensione in corso non si conta
  writeIntToSettings("lic_seq", s_seq);
  writeIntToSettings("lic_left", s_left);
  s_active = boots > 0;   // 0 accensioni = blocco (revoca)
  return LICENSE_OK;
}

String licenseJson() {
  String j = "{\"device\":\"" + deviceCode() + "\"";
  // utilizzi residui dopo l'accensione in corso (anche se non è ancora stata contata)
  int shown = (s_pendingBoot && s_left > 0 && s_left != LIC_UNLIMITED) ? s_left - 1 : s_left;
  j += ",\"left\":" + String(s_left == LIC_UNLIMITED ? -1 : shown);
  j += ",\"unlimited\":" + String(s_left == LIC_UNLIMITED ? "true" : "false");
  j += ",\"active\":" + String(s_active ? "true" : "false");
  j += ",\"seq\":" + String(s_seq);
  j += ",\"boot\":" + String(s_bootId);
  j += ",\"contact\":\"" + String(LICENSE_CONTACT) + "\"}";
  return j;
}
