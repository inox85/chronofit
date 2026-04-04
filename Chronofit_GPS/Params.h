// Stati sincronizzazione orologio
#define FW_VERSION "2.0.0"
#define DEV_NAME    "Chronofit"
#define HW_NAME      "ESP32-32E-N16"


#define SYNC_NONE                     0   // Sync non effettuato
#define SYNC_MANUAL_SET               1   // Tempo settato manualmente
#define SYNC_WAIT_LINE_SIGNAL         2   // In attesa del segnale di sincronismo (esterno)
#define SYNC_SET_BY_LINE_SIGNAL       3   // Tempo impostato tramite segnale esterno
#define SYNC_FIRST_GPS_SYNC           4   // Sincronizzato tramite GPS
#define SYNC_WAIT_GPS                 5   // In attesa della sincronizzazione GPS
#define SYNC_GPS_SYNCED               6   // Sincronizzato tramite GPS
#define ELAPSED_WAITING_START         7   // In attesa di un segnale si inizio cronometraggio
#define ELAPSED_TIME_STARTED          8   // In attesa di un segnale si inizio cronometraggi
#define GPS_ONE_SHOT                  9


#define MODE_SYNC_MANUAL              0
#define MODE_SYNC_LINE                1
#define MODE_SYNC_GPS                 2
#define MODE_ELAPSED_TIME             3

#define POWER_MODE_NONE               0
#define POWER_MODE_USB                1
#define POWER_MODE_BATTERY            2

#define USB_POWER_THRESHOLD           50
#define BATTERY_POWER_THRESHOLD       200

#define TYPE_CHECKPOINT               0
#define TYPE_TIME_UPDATE              1
#define TYPE_SESSION_CLEARED          2
#define TYPE_PARAMS_UPDATED           3
#define TYPE_ROW_UPDATED              4
#define TYPE_GENERIC_MESSAGE          5

#define AGING_REG                     0x10
#define DS3231_ADDR                   0x68
#define DEBUG