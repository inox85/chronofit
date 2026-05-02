#include "mqtt.h"
#include "globals.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include "esp_task_wdt.h"

static const char* MQTT_SERVER = "broker.hivemq.com";
static const int   MQTT_PORT   = 1883;
static const int   QUEUE_SIZE  = 20;

struct MqttMessage {
    char topic[80];
    char payload[300];
};

static WiFiClient    wifiClient;
static PubSubClient  mqtt(wifiClient);
static QueueHandle_t mqttQueue = nullptr;

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String msg;
    msg.reserve(length);
    for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];
    Serial.printf("[MQTT IN] %s: %s\n", topic, msg.c_str());
}

static void subscribe() {
    String topicCmd = "chronofit/" + stationName + "/cmd";
    mqtt.subscribe(topicCmd.c_str());
    Serial.printf("[MQTT] Sottoscritto a: %s\n", topicCmd.c_str());
}

static void connectBlocking() {
    while (!mqtt.connected()) {


        if (!internetOK) {
            vTaskDelay(pdMS_TO_TICKS(2000));
            continue;
        }

        IPAddress brokerIp;
        if (!WiFi.hostByName(MQTT_SERVER, brokerIp)) {
            Serial.println("[MQTT] DNS fallito per " + String(MQTT_SERVER) + ", riprovo tra 5s");
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }
        Serial.printf("[MQTT] %s risolto in %s\n", MQTT_SERVER, brokerIp.toString().c_str());

        String clientId = "chronofit-" + chipIdStr;
        Serial.print("[MQTT] Connessione...");

        if (mqtt.connect(clientId.c_str())) {
            Serial.println(" OK");
            subscribe();
        } else {
            Serial.printf(" fallita rc=%d, riprovo tra 5s\n", mqtt.state());
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
    }
}

static void mqttTask(void*) {
    for (;;) {
        connectBlocking();

        MqttMessage msg;
        while (mqtt.connected() && xQueueReceive(mqttQueue, &msg, 0) == pdTRUE) {
            mqtt.publish(msg.topic, msg.payload);
            Serial.printf("[MQTT OUT] %s: %s\n", msg.topic, msg.payload);
        }

        mqtt.loop();
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void mqttSetup() {
    mqttQueue = xQueueCreate(QUEUE_SIZE, sizeof(MqttMessage));
    wifiClient.setTimeout(1);
    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setCallback(onMqttMessage);
    xTaskCreatePinnedToCore(mqttTask, "mqtt", 4096, nullptr, 1, nullptr, 0);
}

void mqttPublishCheckpoint(const String& jsonPayload) {
    if (mqttQueue == nullptr) return;

    String topic = "chronofit/" + stationName + "/checkpoint";

    MqttMessage msg;
    topic.toCharArray(msg.topic, sizeof(msg.topic));
    jsonPayload.toCharArray(msg.payload, sizeof(msg.payload));

    if (xQueueSend(mqttQueue, &msg, 0) != pdTRUE) {
        Serial.println("[MQTT] Coda piena, messaggio scartato");
    }
}
