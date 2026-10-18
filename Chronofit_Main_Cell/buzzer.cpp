#include "Buzzer.h"
#include <Arduino.h>
#include "globals.h"

static uint8_t buzzerPin;
static QueueHandle_t buzzerQueue;
static TaskHandle_t buzzerTaskHandle;

static const uint8_t LEDC_CHANNEL = 2;
static const uint8_t LEDC_RESOLUTION = 16; // 0–255
static uint32_t currentFreq = 0;

static void buzzerTask(void *parameter)
{
  BuzzerCmd_t cmd;
  Serial.println("Avvio beep loop");
  for (;;)
  {
    if (xQueueReceive(buzzerQueue, &cmd, portMAX_DELAY) == pdTRUE)
    {
      // Imposta frequenza solo se cambia
      if (cmd.frequencyHz != currentFreq)
      {
        ledcWriteTone(buzzerPin, cmd.frequencyHz);
        currentFreq = cmd.frequencyHz;
      }

      for (uint8_t i = 0; i < cmd.count; i++)
      {
        ledcWrite(buzzerPin, cmd.duty);   // ON
        vTaskDelay(pdMS_TO_TICKS(cmd.durationMs));
        ledcWrite(buzzerPin, 0);          // OFF

        if (i < cmd.count - 1)
          vTaskDelay(pdMS_TO_TICKS(cmd.pauseMs));
      }
    }
  }
}

void buzzerInit(uint8_t pin)
{
  buzzerPin = pin;

  buzzerQueue = xQueueCreate(5, sizeof(BuzzerCmd_t));

  //ledcSetup(LEDC_CHANNEL, 2000, LEDC_RESOLUTION);
  //ledcAttachPin(buzzerPin, LEDC_CHANNEL);
  //ledcWrite(LEDC_CHANNEL, 0);
  ledcAttachChannel(buzzerPin, 1000, 8, 2);
  //ledcAttachChannel(buzzerPin, 2000, LEDC_RESOLUTION, LEDC_CHANNEL);

  xTaskCreatePinnedToCore(
      buzzerTask,
      "BuzzerTask",
      2048,
      nullptr,
      1,
      &buzzerTaskHandle,
      1);
}

void buzzerBeep(uint16_t durationMs,
                uint8_t count,
                uint16_t pauseMs,
                uint16_t frequencyHz,
                uint8_t duty)
{
  if (!buzzerQueue) return;

  BuzzerCmd_t cmd = {
      .durationMs = durationMs,
      .count = count,
      .pauseMs = pauseMs,
      .frequencyHz = frequencyHz,
      .duty = duty};

  xQueueSend(buzzerQueue, &cmd, 0);
}

void sweepBuzz(){
  if(buzzerActive == 0)
    return;

  buzzerBeep(400,1,0,220,32);
  buzzerBeep(200,1,0,440,64);
  buzzerBeep(100,1,0,880,128);
}

void graveBuzz(){
  buzzerBeep(100,1,0,100,128);
}

void reverseSweepBuzz(){
  if(buzzerActive == 0)
    return;

  buzzerBeep(400,1,0,880,32);
  buzzerBeep(200,1,0,440,64);
  buzzerBeep(100,1,0,220,128);
}

void playBinary(uint32_t value) {
  if(buzzerActive == 0)
    return;
  const uint16_t FREQ_1 = 220;
  const uint16_t FREQ_0 = 880;
  const uint16_t BIT_TIME = 200;
  const uint8_t  DUTY = 128;
  
  uint16_t freq = (value & (1UL << 2)) ? FREQ_1 : FREQ_0;
  buzzerBeep(BIT_TIME, 1, 0, freq, DUTY);
  buzzerBeep(50, 1, 0, freq, 0);
  freq = (value & (1UL << 1)) ? FREQ_1 : FREQ_0;
  buzzerBeep(BIT_TIME, 1, 0, freq, DUTY);
  buzzerBeep(50, 1, 0, freq, 0);
  freq = (value & (1UL << 0)) ? FREQ_1 : FREQ_0;
  buzzerBeep(BIT_TIME, 1, 0, freq, DUTY);
  buzzerBeep(50, 1, 0, freq, 0);

}
