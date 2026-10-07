// Stati sincronizzazione orologio
//#define VER2

#define FW_VERSION "MC1.0.0"
#define DEV_NAME    "ChronofitMainCell"
#define HW_NAME      "HW VER. 2.0"


// ChronofitMainCell non ha GPS né sincronizzazione dell'orario: restano solo gli stati
// elapsed; i valori numerici sono invariati perché condivisi con la UI JS.
#define SYNC_NONE                     0   // Sync non effettuato
#define ELAPSED_WAITING_START         7   // In attesa di un segnale si inizio cronometraggio
#define ELAPSED_TIME_STARTED          8   // In attesa di un segnale si inizio cronometraggi


// Unica modalità: tempo trascorso (elapsed). Il valore 3 è condiviso con la UI JS.
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
#define TYPE_WIFI_CONNECTING          7
#define TYPE_WIFI_ERROR               8
#define TYPE_LINE_UPDATED             11
#define TYPE_CELLS_UPDATED            12

#define DEBUG
