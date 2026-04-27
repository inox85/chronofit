#pragma once
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "settings.h"
#include <Arduino.h>
#include "freertos/semphr.h"

class MQTTManager {
public:
  void begin();
  void loop();
  bool publishDevice(const char* payload);              // chronofit/<chipID>
  bool publish(const char* subtopic, const char* payload); // chronofit/<subtopic>
  void subscribe(const char* fullTopic);                // topic libero
  bool isConnected();
  String getDeviceBaseTopic();

  void saveSettings(const String& server, int port, const String& user,
                    const String& pass, const String& subtopic, const String& subscribeTopic);

  String getServer()         { return readStringFromSettings("mqtt_server", ""); }
  int    getPort()           { return readIntFromSettings("mqtt_port", 8883); }
  String getUser()           { return readStringFromSettings("mqtt_user", ""); }
  String getPass()           { return readStringFromSettings("mqtt_pass", ""); }
  String getSubtopic()       { return readStringFromSettings("mqtt_subtopic", "data/"); }
  String getEvent()       { return readStringFromSettings("event", "event"); }
  String getSubscribeTopic() { return readStringFromSettings("free_topic", ""); }

  void setCallback(void (*cb)(char*, uint8_t*, unsigned int));

private:
  SemaphoreHandle_t _mutex = nullptr;
  void (*_callback)(char*, uint8_t*, unsigned int) = nullptr;
  bool _connecting = false;
  unsigned long _lastAttempt = 0;
  static constexpr const char* BASE_TOPIC = "chronofit/";

  WiFiClientSecure _wifiClient;
  PubSubClient*    _mqtt = nullptr;

  void _connect();
};