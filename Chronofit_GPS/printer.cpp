#include "printer.h"
#include <Arduino.h>
#include "globals.h"
#include "services_serial.h"
#include "params.h"


// ===== CONFIG =====
#define PRINT_BUFFER_SIZE 128
#define PRINTER_QUEUE_LEN 10
// ===== STRUTTURE =====
typedef struct {
    char text[PRINT_BUFFER_SIZE];
    uint8_t cr;
} PrintJob_t;

// ===== OGGETTI RTOS =====
static QueueHandle_t printerQueue = NULL;



const char* checkpointFlagLabel(int lineNumber, int lineMode, bool cancelled, bool edited) {
  if (cancelled) return "ANN ";
  if (edited)    return "EDIT";
  if (lineNumber == 6) return "SCR ";  // "Fuori pressostato": innescata da pressione schermo
  return (lineMode == 1) ? "MAN " : "AUT ";
}

void printFormatted(int index, String line, int competitor, int hh, int mm, int ss, int ms, int cr, const char* flag){

  char buffer[48];

  sprintf(buffer, "%03d L%s %5d %02d:%02d:%02d.%03d %s", index, line.c_str(), competitor, hh, mm, ss, ms, flag);

  String text = String(buffer);

  printOnPrinter(text, cr);

}

// ===== Scontrino sincronizzazione =====

const char* syncModeLabel(int mode) {
  switch (mode) {
    case MODE_SYNC_MANUAL: return "MAN";
    case MODE_SYNC_LINE:   return "EST";
    case MODE_SYNC_GPS:    return "GPS";
    default:               return "";  // es. MODE_ELAPSED_TIME: nessuna sincronizzazione
  }
}

void printSyncStart(int mode, int hh, int mm, int ss, int ms) {
  const char* label = syncModeLabel(mode);
  if (!label[0]) return;

  char line[48];
  snprintf(line, sizeof(line), "SINCRONIZZAZIONE %s", label);
  printOnPrinter(line, 1);
  printOnPrinter("------------------------------", 1);
  snprintf(line, sizeof(line), "ORA SINCRO   %02d:%02d:%02d.%03d %s", hh, mm, ss, ms, label);
  printOnPrinter(line, 1);
}

void printSyncConfirm(int mode, int hh, int mm, int ss, int ms) {
  const char* label = syncModeLabel(mode);
  if (!label[0]) return;

  char line[48];
  snprintf(line, sizeof(line), "CONFERMA     %02d:%02d:%02d.%03d %s", hh, mm, ss, ms, label);
  printOnPrinter(line, 1);
}


// ===== TASK =====
static void printerTask(void *pvParameters) {
    PrintJob_t job;

    for (;;) {
        if (xQueueReceive(printerQueue, &job, portMAX_DELAY) == pdTRUE) {

            ServicesSerial.print(job.text);

            for (int i = 0; i < job.cr; i++) {
                ServicesSerial.write(0x0A);
            }

            // evita di saturare UART / stampante
            vTaskDelay(pdMS_TO_TICKS(10));
        }
    }
}

// ===== API PUBBLICA =====
void printerInit() {

    printerQueue = xQueueCreate(PRINTER_QUEUE_LEN, sizeof(PrintJob_t));
    if (printerQueue == NULL) {
        Serial.println("Printer queue error");
        return;
    }

    xTaskCreatePinnedToCore(
        printerTask,
        "PrinterTask",
        4096,
        NULL,
        1,
        NULL,
        1
    );
}

void printOnPrinter(const String &text, int cr) {

    if (!printerQueue) return;

    PrintJob_t job;
    strncpy(job.text, text.c_str(), PRINT_BUFFER_SIZE - 1);
    job.text[PRINT_BUFFER_SIZE - 1] = '\0';
    job.cr = cr;

    xQueueSend(printerQueue, &job, 0);  // non bloccante
}
