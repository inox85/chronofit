#include "mqtt_manager.h"

void MQTTManager::begin() {
  _wifiClient.setInsecure();
  _mqtt = new PubSubClient(_wifiClient);

  String server = getServer();
  int    port   = getPort();

  if (server.isEmpty()) {
    Serial.println("[MQTT] Nessun server configurato");
    return;
  }

  _mqtt->setServer(server.c_str(), port);

  if (_callback) {
    _mqtt->setCallback(_callback);
  }

  Serial.printf("[MQTT] Server: %s:%d\n", server.c_str(), port);
  _connect();
}

void MQTTManager::_connect() {
  if (!_mqtt || _mqtt->connected()) return;

  String user  = getUser();
  String pass  = getPass();
  String topic = getBaseTopic() + "/stato";

  Serial.print("[MQTT] Connessione...");

  bool ok = _mqtt->connect(
    "ESP32_Chronofit",
    user.isEmpty() ? nullptr : user.c_str(),
    pass.isEmpty() ? nullptr : pass.c_str(),
    topic.c_str(),   // last will topic
    0, true,         // QoS, retain
    "offline"        // last will message
  );

  if (ok) {
    Serial.println("connesso!");
    // Pubblica stato online con retain
    _mqtt->publish(topic.c_str(), "online", true);
  } else {
    Serial.printf("fallito, rc=%d\n", _mqtt->state());
  }
}

void MQTTManager::loop() {
  if (!_mqtt) return;
  if (!_mqtt->connected()) _connect();
  _mqtt->loop();
}


bool MQTTManager::publish(const char* subtopic, const char* payload) {
  if (!_mqtt || !_mqtt->connected()) return false;
  String fullTopic = getBaseTopic() + "/" + subtopic;
  Serial.printf("[MQTT OUT] %s → %s\n", fullTopic.c_str(), payload);
  return _mqtt->publish(fullTopic.c_str(), payload);
}

bool MQTTManager::publishDevice(const char* payload) {
  if (!_mqtt || !_mqtt->connected()) return false;
  String fullTopic = getDeviceTopic();
  Serial.printf("[MQTT DEV] %s → %s\n", fullTopic.c_str(), payload);
  return _mqtt->publish(fullTopic.c_str(), payload);
}

void MQTTManager::subscribe(const char* topic) {
  if (!_mqtt || !_mqtt->connected()) return;
  String fullTopic = getBaseTopic() + "/" + topic;
  _mqtt->subscribe(fullTopic.c_str());
  Serial.printf("[MQTT SUB] %s\n", fullTopic.c_str());
}

String MQTTManager::getDeviceTopic() {
  uint64_t chipId = ESP.getEfuseMac();
  char chipStr[17];
  snprintf(chipStr, sizeof(chipStr), "%04X%08X",
           (uint32_t)(chipId >> 32),
           (uint32_t)chipId);
  return getBaseTopic() + "devices/" + String(chipStr);
}


bool MQTTManager::isConnected() {
  return _mqtt && _mqtt->connected();
}

void MQTTManager::setCallback(void (*cb)(char*, uint8_t*, unsigned int)) {
  _callback = cb;
  if (_mqtt) _mqtt->setCallback(cb);
}

void MQTTManager::saveSettings(const String& server, int port, const String& user,
                                const String& pass,   const String& baseTopic) {
  writeStringToSettings("mqtt_server", server);
  writeIntToSettings("mqtt_port",      port);
  writeStringToSettings("mqtt_user",   user);
  writeStringToSettings("mqtt_pass",   pass);
  writeStringToSettings("mqtt_topic",  baseTopic);
  Serial.println("[MQTT] Settings salvati");
}