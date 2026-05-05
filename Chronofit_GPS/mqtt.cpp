#include "mqtt.h"
#include "globals.h"
#include "settings.h"
#include "routes.h"
#include "Params.h"
#include "time_utils.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

static const char* MQTT_SERVER = "broker.hivemq.com";
static const int   MQTT_PORT   = 1883;
static const int   QUEUE_SIZE  = 50;

struct MqttMessage {
    char topic[80];
    char payload[300];
    bool retained;  // aggiungi questo
};

static WiFiClient    wifiClient;
static PubSubClient  mqtt(wifiClient);
static QueueHandle_t mqttQueue = nullptr;
static String mqttSubTopic;
static String mqttEventName;

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String msg;
    msg.reserve(length);
    for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

    if (mqttAddRow) {
        writeCheckpointFromMqtt(msg);
    }

    if (mqttShowPopup) {
        StaticJsonDocument<512> doc;
        doc["t"]     = TYPE_MQTT_NOTIFICATION;
        doc["topic"] = topic;
        doc["data"]  = serialized(msg);
        String out;
        serializeJson(doc, out);
        ws.textAll(out);
    }
}

static void subscribe() {
    if (mqttSubTopic.length() > 0) {
        mqtt.subscribe(mqttSubTopic.c_str());
        //Serial.printf("[MQTT] Sottoscritto a: %s\n", mqttSubTopic.c_str());
    }
}

static void connectBlocking() {
    while (!mqtt.connected()) {
        if (!internetOK) {
            mqttConnected = false;  // segnala subito: niente internet = niente MQTT
            vTaskDelay(pdMS_TO_TICKS(2000));
            continue;
        }

        IPAddress brokerIp;
        if (!WiFi.hostByName(MQTT_SERVER, brokerIp)) {
            //Serial.println("[MQTT] DNS fallito per " + String(MQTT_SERVER) + ", riprovo tra 5s");
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }
        Serial.printf("[MQTT] %s risolto in %s\n", MQTT_SERVER, brokerIp.toString().c_str());

        String clientId = "chronofit-" + chipIdStr;
        Serial.print("[MQTT] Connessione...");
        if (mqtt.connect(clientId.c_str())) {
            Serial.println(" OK");
            mqttConnected = true;
            subscribe();
        } else {
            mqttConnected = false;
            Serial.printf(" fallita rc=%d, riprovo tra 5s\n", mqtt.state());
            vTaskDelay(pdMS_TO_TICKS(5000));
        }
    }
}

static void mqttTask(void*) {
    for (;;) {
        connectBlocking();

        // Rileva caduta connessione
        if (!mqtt.connected()) {
            mqttConnected = false;
            continue;
        }

        MqttMessage msg;
        while (mqtt.connected() && xQueueReceive(mqttQueue, &msg, 0) == pdTRUE) {
            mqtt.publish(msg.topic, msg.payload, true);
            //Serial.printf("[MQTT OUT] %s: %s\n", msg.topic, msg.payload);
        }

        mqtt.loop();
        vTaskDelay(pdMS_TO_TICKS(10));
    }
}

void mqttSetup() {
    mqttSubTopic  = readStringFromSettings("mqttSubTopic", "");
    mqttEventName = readStringFromSettings("mqttEvent", "");
    mqttQueue = xQueueCreate(QUEUE_SIZE, sizeof(MqttMessage));
    wifiClient.setTimeout(1);
    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setCallback(onMqttMessage);
    xTaskCreatePinnedToCore(mqttTask, "mqtt", 4096, nullptr, 1, nullptr, 1);
}

void mqttUpdateSettings(const String& newSubTopic, const String& newEventName) {
    mqttSubTopic  = newSubTopic;
    mqttEventName = newEventName;
    // Forza riconnessione per aggiornare la subscribe
    mqtt.disconnect();
    mqttConnected = false;
    Serial.printf("[MQTT] Settings aggiornati — evento: %s, sub: %s\n",
                  mqttEventName.c_str(), mqttSubTopic.c_str());
}

void mqttPublishCheckpoint(const String& jsonPayload) {
    if (mqttQueue == nullptr) return;

    String topic = "chronofit/" + mqttEventName + "/" + stationName + "/" + chipIdStr + "/checkpoint";

    MqttMessage msg;
    topic.toCharArray(msg.topic, sizeof(msg.topic));
    jsonPayload.toCharArray(msg.payload, sizeof(msg.payload));

    if (xQueueSend(mqttQueue, &msg, 0) != pdTRUE) {
        Serial.println("[MQTT] Coda piena, messaggio scartato");
    }
}
