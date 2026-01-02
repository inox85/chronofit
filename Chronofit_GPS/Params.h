// Stati sincronizzazione orologio

#define SYNC_NONE                     0   // Sync non effettuato
#define SYNC_MANUAL_SET               1   // Tempo settato manualmente
#define SYNC_WAIT_LINE_SIGNAL         2   // In attesa del segnale di sincronismo (esterno)
#define SYNC_SET_BY_LINE_SIGNAL       3   // Tempo impostato tramite segnale esterno
#define SYNC_FIRST_GPS_SYNC           4   // Sincronizzato tramite GPS
#define SYNC_WAIT_GPS                 5   // In attesa della sincronizzazione GPS
#define SYNC_GPS_SYNCED               6   // Sincronizzato tramite GPS

#define MODE_SYNC_MANUAL              0
#define MODE_SYNC_LINE                1
#define MODE_SYNC_GPS                 2

#define POWER_MODE_NONE               0
#define POWER_MODE_USB                1
#define POWER_MODE_BATTERY            2

#define USB_POWER_THRESHOLD           50
#define BATTERY_POWER_THRESHOLD       200

//#define CAL_WINDOW_SEC 600UL
//#define CAL_WINDOW_US  (CAL_WINDOW_SEC * 1000000UL)
