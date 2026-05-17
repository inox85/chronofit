#include "mqtt.h"
#include "globals.h"
#include "settings.h"
#include "routes.h"
#include "Params.h"
#include "time_utils.h"
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

static const char* MQTT_SERVER_DEFAULT = "broker.hivemq.com";
static const int   MQTT_PORT_DEFAULT   = 1883;
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
static String mqttTopicPrefix;
static String mqttBrokerHost;
static int    mqttBrokerPort;
static String mqttBrokerUser;
static String mqttBrokerPass;
static char   mqttPublishTopic[128];

static void buildPublishTopic() {
    snprintf(mqttPublishTopic, sizeof(mqttPublishTopic), "%s/%s/%s/%s/checkpoint",
             mqttTopicPrefix.c_str(), mqttEventName.c_str(), stationName.c_str(), chipIdStr.c_str());
}

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String msg;
    msg.reserve(length);
    for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

    int pendingId = -1;
    if (mqttAcquireRow) {
        if (mqttImmediateMode) {
            writeCheckpointFromMqtt(msg.c_str());
        } else {
            pendingId = appendToPending(String(topic), msg);
        }
    }

    if (mqttShowPopup) {
        StaticJsonDocument<512> doc;
        doc["t"]     = TYPE_MQTT_NOTIFICATION;
        doc["topic"] = topic;
        doc["data"]  = serialized(msg);
        if (pendingId >= 0) doc["pendingId"] = pendingId;
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
        if (!WiFi.hostByName(mqttBrokerHost.c_str(), brokerIp)) {
            vTaskDelay(pdMS_TO_TICKS(5000));
            continue;
        }
        Serial.printf("[MQTT] %s risolto in %s\n", mqttBrokerHost.c_str(), brokerIp.toString().c_str());

        String clientId = "chronofit-" + chipIdStr;
        Serial.print("[MQTT] Connessione...");
        bool connected = mqttBrokerUser.isEmpty()
            ? mqtt.connect(clientId.c_str())
            : mqtt.connect(clientId.c_str(), mqttBrokerUser.c_str(), mqttBrokerPass.c_str());
        if (connected) {
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
    mqttSubTopic     = readStringFromSettings("mqttSubTopic", "");
    mqttEventName    = readStringFromSettings("mqttEvent", "");
    mqttTopicPrefix  = readStringFromSettings("mqttPrefix", "chronofit");
    mqttBrokerHost   = readStringFromSettings("mqttBrokerHost", MQTT_SERVER_DEFAULT);
    mqttBrokerPort   = readStringFromSettings("mqttBrokerPort", String(MQTT_PORT_DEFAULT)).toInt();
    mqttBrokerUser   = readStringFromSettings("mqttBrokerUser", "");
    mqttBrokerPass   = readStringFromSettings("mqttBrokerPass", "");
    mqttAcquireRow    = readStringFromSettings("mqttAcquireRow",    "0").toInt();
    mqttImmediateMode = readStringFromSettings("mqttImmediateMode","0").toInt();
    mqttShowPopup     = readStringFromSettings("mqttShowPopup",     "1").toInt();
    initPendingIndex();
    mqttQueue = xQueueCreate(QUEUE_SIZE, sizeof(MqttMessage));
    wifiClient.setTimeout(1);
    mqtt.setServer(mqttBrokerHost.c_str(), mqttBrokerPort);
    mqtt.setCallback(onMqttMessage);
    buildPublishTopic();
    xTaskCreatePinnedToCore(mqttTask, "mqtt", 4096, nullptr, 1, nullptr, 1);
}

void mqttUpdateSettings(const String& newSubTopic, const String& newEventName, const String& newPrefix) {
    mqttSubTopic    = newSubTopic;
    mqttEventName   = newEventName;
    mqttTopicPrefix = newPrefix.isEmpty() ? "chronofit" : newPrefix;
    buildPublishTopic();
    // Forza riconnessione per aggiornare la subscribe
    mqtt.disconnect();
    mqttConnected = false;
    Serial.printf("[MQTT] Settings aggiornati — prefix: %s, evento: %s, sub: %s\n",
                  mqttTopicPrefix.c_str(), mqttEventName.c_str(), mqttSubTopic.c_str());
}

void mqttUpdateBroker(const String& host, int port, const String& user, const String& pass) {
    mqttBrokerHost = host.isEmpty() ? MQTT_SERVER_DEFAULT : host;
    mqttBrokerPort = (port <= 0)    ? MQTT_PORT_DEFAULT   : port;
    mqttBrokerUser = user;
    mqttBrokerPass = pass;
    mqtt.disconnect();
    mqttConnected = false;
    mqtt.setServer(mqttBrokerHost.c_str(), mqttBrokerPort);
    Serial.printf("[MQTT] Broker aggiornato — %s:%d user:%s\n",
                  mqttBrokerHost.c_str(), mqttBrokerPort,
                  mqttBrokerUser.isEmpty() ? "(nessuno)" : mqttBrokerUser.c_str());
}

void mqttPublishCheckpoint(const char* jsonPayload) {
    if (mqttQueue == nullptr) return;

    MqttMessage msg;
    strlcpy(msg.topic,   mqttPublishTopic, sizeof(msg.topic));
    strlcpy(msg.payload, jsonPayload,      sizeof(msg.payload));

    if (xQueueSend(mqttQueue, &msg, 0) != pdTRUE) {
        Serial.println("[MQTT] Coda piena, messaggio scartato");
    }
}
