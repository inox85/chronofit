#include "printer.h"
#include <Arduino.h>
#include "globals.h"
#include "services_serial.h"


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



void printFormatted(int index, int line, int competitor, int hh, int mm, int ss, int ms, int cr){

  char buffer[40];

  sprintf(buffer, "#%03d L%03d C%05d T%02d:%02d:%02d.%03d", index, line, competitor, hh, mm, ss, ms);

  String text = String(buffer);

  printOnPrinter(text, cr);

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
