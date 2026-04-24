#pragma once
#include <TinyGPSPlus.h>

// ============================================================
//  GPS Custom NMEA parser — ATGM336H
//  Costellazione: GPS only ($GPGSV)
//  Max 4 sentenze GSV = max 16 satelliti
// ============================================================

#define GSV_MAX_SENTENCES  4   // sentenze GSV per ciclo
#define GSV_SAT_PER_MSG    4   // satelliti per sentenza
#define GSV_MAX_SAT        (GSV_MAX_SENTENCES * GSV_SAT_PER_MSG)  // 16

struct SatInfo {
  int  prn;
  int  elevation;
  int  azimuth;
  int  snr;
  bool valid;
};

class GPSCustomParser {
public:
  // ── GPS ($GPGSV) ──────────────────────────────────────────
  TinyGPSCustom gpPRN    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gpElev   [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gpAzimuth[GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gpSNR    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];

  // ── totale satelliti visibili ─────────────────────────────
  TinyGPSCustom gpTotalSats;

  void begin(TinyGPSPlus &gps) {
    // campo 3 = totale satelliti visibili
    // per ogni sat (i=0..3): PRN=4+i*4, Elev=5+i*4, Az=6+i*4, SNR=7+i*4
    gpTotalSats.begin(gps, "GPGSV", 3);

    for (int s = 0; s < GSV_MAX_SENTENCES; s++) {
      for (int i = 0; i < GSV_SAT_PER_MSG; i++) {
        int f = 4 + i * 4;
        gpPRN    [s][i].begin(gps, "GPGSV", f + 0);
        gpElev   [s][i].begin(gps, "GPGSV", f + 1);
        gpAzimuth[s][i].begin(gps, "GPGSV", f + 2);
        gpSNR    [s][i].begin(gps, "GPGSV", f + 3);
      }
    }
  }

  // ── estrai array SatInfo ──────────────────────────────────
  int getGPSSats(SatInfo* out, int maxOut) {
    int count = 0;
    for (int s = 0; s < GSV_MAX_SENTENCES && count < maxOut; s++) {
      for (int i = 0; i < GSV_SAT_PER_MSG && count < maxOut; i++) {
        const char* prnStr = gpPRN[s][i].value();
        if (prnStr && prnStr[0] != '\0') {
          out[count].prn       = atoi(prnStr);
          out[count].elevation = atoi(gpElev[s][i].value());
          out[count].azimuth   = atoi(gpAzimuth[s][i].value());
          const char* snrStr   = gpSNR[s][i].value();
          out[count].snr       = (snrStr && snrStr[0] != '\0') ? atoi(snrStr) : 0;
          out[count].valid     = (out[count].prn > 0);
          count++;
        }
      }
    }
    return count;
  }
};

// ── Istanza globale ───────────────────────────────────────
extern GPSCustomParser gpsParser;