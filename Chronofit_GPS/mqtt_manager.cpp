#include <Arduino.h>
#include "mqtt_manager.h"
#include <WiFi.h>


void MQTTManager::_connect() {
  if (!_mqtt || _mqtt->connected() || _connecting) return;
    _connecting = true;

  // Variabili locali che vivono per tutta la funzione
  String user      = getUser();
  String pass      = getPass();
  String willTopic = getDeviceBaseTopic() + "/state";

  const char* userPtr = user.isEmpty() ? nullptr : user.c_str();
  const char* passPtr = pass.isEmpty() ? nullptr : pass.c_str();

  Serial.printf("[MQTT] User: '%s'\n", user.c_str());
  Serial.printf("[MQTT] Pass: '%s'\n", pass.c_str());  // ← qui
  Serial.print("[MQTT] Connessione...");

  Serial.print("[MQTT] Connessione...");

  bool ok = _mqtt->connect(
    "ESP32_Chronofit",
    userPtr,
    passPtr,
    willTopic.c_str(), 0, true, "offline"
  );

  if (ok) {
    Serial.println("connesso!");
    _mqtt->publish(willTopic.c_str(), "online", true);

    String cmdTopic = getDeviceBaseTopic() + "/commands";
    _mqtt->subscribe(cmdTopic.c_str());
    Serial.printf("[MQTT SUB] %s\n", cmdTopic.c_str());

    String userTopic = getSubscribeTopic();
    if (!userTopic.isEmpty()) {
      String fullTopic = String(BASE_TOPIC) + userTopic;
      _mqtt->subscribe(userTopic.c_str());
      Serial.printf("[MQTT SUB] %s\n", userTopic.c_str());
    }
  } else {
    Serial.printf("fallito, rc=%d\n", _mqtt->state());
  }
  _connecting = false;
}

// Topic immutabile — chronofit/<chipID>
String MQTTManager::getDeviceBaseTopic() {
  uint64_t chipId = ESP.getEfuseMac();
  char chipStr[17];
  snprintf(chipStr, sizeof(chipStr), "%04X%08X",
           (uint32_t)(chipId >> 32), (uint32_t)chipId);
  return String(BASE_TOPIC) + "devices/" + chipStr;
}

// Publish su chronofit/<subtopic configurabile>
bool MQTTManager::publish(const char* subtopic, const char* payload) {
  if (!_mqtt || !_mqtt->connected()) return false;
  String fullTopic = String(BASE_TOPIC) + subtopic;
  return _mqtt->publish(fullTopic.c_str(), payload);
}

// Publish su chronofit/<chipID>
bool MQTTManager::publishDevice(const char* payload) {
  if (!_mqtt || !_mqtt->connected()) return false;
  return _mqtt->publish(getDeviceBaseTopic().c_str(), payload);
}

void MQTTManager::subscribe(const char* fullTopic) {
  if (!_mqtt || !_mqtt->connected()) return;
  String topic = String(BASE_TOPIC) + fullTopic;
  _mqtt->subscribe(topic.c_str());
  Serial.printf("[MQTT SUB] %s\n", topic.c_str());
}

void MQTTManager::saveSettings(const String& server, int port, const String& user,
                                const String& pass, const String& subtopic,
                                const String& subscribeTopic) {
  writeStringToSettings("mqtt_server",     server);
  writeIntToSettings("mqtt_port",          port);
  writeStringToSettings("mqtt_user",       user);
  writeStringToSettings("mqtt_pass",       pass);
  writeStringToSettings("mqtt_subtopic",   subtopic);
  writeStringToSettings("free_topic", subscribeTopic);

  Serial.println("[MQTT] Settings salvati:");
  Serial.printf("  server:    %s\n", getServer().c_str());
  Serial.printf("  port:      %d\n", getPort());
  Serial.printf("  user:      %s\n", getUser().c_str());
  Serial.printf("  pass:      %s\n", getPass().c_str());
  Serial.printf("  subtopic:  %s\n", getSubtopic().c_str());
  Serial.printf("  freetopic: %s\n", getSubscribeTopic().c_str());
}

void MQTTManager::begin() {
  if (!_mutex) _mutex = xSemaphoreCreateMutex();

  xSemaphoreTake(_mutex, portMAX_DELAY);

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[MQTT] WiFi non connesso, skip");
    xSemaphoreGive(_mutex);
    return;
  }

  if (_mqtt) { delete _mqtt; _mqtt = nullptr; }

  _wifiClient.setInsecure();
  _mqtt = new PubSubClient(_wifiClient);
  _mqtt->setBufferSize(1024);
  _mqtt->setKeepAlive(60);
  _mqtt->setSocketTimeout(3);

  String server = getServer();
  int    port   = getPort();

  if (server.isEmpty()) {
    Serial.println("[MQTT] Nessun server configurato");
    delete _mqtt;
    _mqtt = nullptr;
    xSemaphoreGive(_mutex);
    return;
  }

  _mqtt->setServer(server.c_str(), port);
  if (_callback) _mqtt->setCallback(_callback);

  Serial.printf("[MQTT] Server: %s:%d\n", server.c_str(), port);
  _connect();

  if (!_mqtt->connected()) {
    Serial.println("[MQTT] Primo tentativo fallito, riprovo...");
    vTaskDelay(3000 / portTICK_PERIOD_MS);
    _connect();
  }

  xSemaphoreGive(_mutex);
}

void MQTTManager::loop() {
  if (!_mqtt) return;
  if (WiFi.status() != WL_CONNECTED) return;

  xSemaphoreTake(_mutex, portMAX_DELAY);

  if (!_mqtt->connected()) {
    unsigned long now = millis();
    if (now - _lastAttempt > 5000) {
      _lastAttempt = now;
      _connect();
    }
    xSemaphoreGive(_mutex);  // ← sempre prima del return
    return;
  }

  _mqtt->loop();
  xSemaphoreGive(_mutex);
}

bool MQTTManager::isConnected() {
  return _mqtt && _mqtt->connected();
}

void MQTTManager::setCallback(void (*cb)(char*, uint8_t*, unsigned int)) {
  _callback = cb;
  if (_mqtt) _mqtt->setCallback(cb);
}