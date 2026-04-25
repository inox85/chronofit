#include "mqtt_service.h"
#include "globals.h"

void onMqttMessage(char* topic, uint8_t* payload, unsigned int length) {
  String msg;
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.printf("[MQTT IN] %s → %s\n", topic, msg.c_str());
}

static void mqttTask(void* pvParameters) {
  vTaskDelay(10000 / portTICK_PERIOD_MS);
  mqtt.setCallback(onMqttMessage);
  mqtt.begin();

  for (;;) {
    mqtt.loop();
    vTaskDelay(50 / portTICK_PERIOD_MS);
  }
}

void mqttSetup() {
  xTaskCreatePinnedToCore(
    mqttTask,
    "mqttTask",
    16384,
    nullptr,
    1,
    nullptr,
    1  // core 1
  );
}

void mqttLoop() {
  // vuoto — il loop gira nel task separato
}