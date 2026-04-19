#pragma once
#include <TinyGPSPlus.h>

// ============================================================
//  GPS Custom NMEA parser — ATGM336H
//  Costellazioni: GPS (GP) + GLONASS (GL) + BeiDou (GB)
//  Max 4 sentenze GSV per costellazione = max 16 sat ciascuna
// ============================================================

#define GSV_MAX_SENTENCES  4   // sentenze GSV per costellazione
#define GSV_SAT_PER_MSG    4   // satelliti per sentenza GSV
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
  // ── oggetti TinyGPSCustom per ogni costellazione ──────────
  // GPS ($GPGSV)
  TinyGPSCustom gpPRN    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gpElev   [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gpAzimuth[GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gpSNR    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];

  // GLONASS ($GLGSV)
  TinyGPSCustom glPRN    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom glElev   [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom glAzimuth[GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom glSNR    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];

  // BeiDou ($GBGSV)
  TinyGPSCustom gbPRN    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gbElev   [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gbAzimuth[GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];
  TinyGPSCustom gbSNR    [GSV_MAX_SENTENCES][GSV_SAT_PER_MSG];

  // ── numero totale satelliti visibili per costellazione ────
  TinyGPSCustom gpTotalSats;
  TinyGPSCustom glTotalSats;
  TinyGPSCustom gbTotalSats;

  void begin(TinyGPSPlus &gps) {
    // Indici NMEA GSV:
    // campo 3 = totale satelliti visibili
    // per ogni sat (i=0..3): PRN=4+i*4, Elev=5+i*4, Az=6+i*4, SNR=7+i*4

    gpTotalSats.begin(gps, "GPGSV", 3);
    glTotalSats.begin(gps, "GLGSV", 3);
    gbTotalSats.begin(gps, "GBGSV", 3);
    

    for (int s = 0; s < GSV_MAX_SENTENCES; s++) {
      for (int i = 0; i < GSV_SAT_PER_MSG; i++) {
        int fieldBase = 4 + i * 4;

        // GPS
        gpPRN    [s][i].begin(gps, "GPGSV", fieldBase + 0);
        gpElev   [s][i].begin(gps, "GPGSV", fieldBase + 1);
        gpAzimuth[s][i].begin(gps, "GPGSV", fieldBase + 2);
        gpSNR    [s][i].begin(gps, "GPGSV", fieldBase + 3);

        // GLONASS
        glPRN    [s][i].begin(gps, "GLGSV", fieldBase + 0);
        glElev   [s][i].begin(gps, "GLGSV", fieldBase + 1);
        glAzimuth[s][i].begin(gps, "GLGSV", fieldBase + 2);
        glSNR    [s][i].begin(gps, "GLGSV", fieldBase + 3);

        // BeiDou
        gbPRN    [s][i].begin(gps, "GBGSV", fieldBase + 0);
        gbElev   [s][i].begin(gps, "GBGSV", fieldBase + 1);
        gbAzimuth[s][i].begin(gps, "GBGSV", fieldBase + 2);
        gbSNR    [s][i].begin(gps, "GBGSV", fieldBase + 3);
      }
    }
  }

  // ── helper: estrai array SatInfo da una costellazione ────
  int getSats(TinyGPSCustom prn[][GSV_SAT_PER_MSG],
              TinyGPSCustom elev[][GSV_SAT_PER_MSG],
              TinyGPSCustom azimuth[][GSV_SAT_PER_MSG],
              TinyGPSCustom snr[][GSV_SAT_PER_MSG],
              SatInfo* out, int maxOut)
  {
    int count = 0;
    for (int s = 0; s < GSV_MAX_SENTENCES && count < maxOut; s++) {
      for (int i = 0; i < GSV_SAT_PER_MSG && count < maxOut; i++) {
        const char* prnStr = prn[s][i].value();
        if (prnStr && prnStr[0] != '\0') {
          out[count].prn       = atoi(prnStr);
          out[count].elevation = atoi(elev[s][i].value());
          out[count].azimuth   = atoi(azimuth[s][i].value());
          const char* snrStr   = snr[s][i].value();
          out[count].snr       = (snrStr && snrStr[0] != '\0') ? atoi(snrStr) : 0;
          out[count].valid     = (out[count].prn > 0);
          count++;
        }
      }
    }
    return count;
  }

  int getGPSSats   (SatInfo* out, int max) { return getSats(gpPRN, gpElev, gpAzimuth, gpSNR, out, max); }
  int getGLONASSSats(SatInfo* out, int max) { return getSats(glPRN, glElev, glAzimuth, glSNR, out, max); }
  int getBeiDouSats (SatInfo* out, int max) { return getSats(gbPRN, gbElev, gbAzimuth, gbSNR, out, max); }
};

// ── Istanza globale ───────────────────────────────────────
extern GPSCustomParser gpsParser;
