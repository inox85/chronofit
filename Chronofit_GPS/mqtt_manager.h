#pragma once

#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include "settings.h"

class MQTTManager {
public:
  void begin();
  void loop();
  bool publish(const char* subtopic, const char* payload); // topic scelto
  bool publishDevice(const char* payload);                  // topic fisso con chipID
  String getDeviceTopic();
  void subscribe(const char* topic);
  bool isConnected();

  // Settings
  void saveSettings(const String& server, int port, const String& user,
                    const String& pass, const String& baseTopic);
  String getServer()    { return readStringFromSettings("mqtt_server", ""); }
  int    getPort()      { return readIntFromSettings("mqtt_port", 8883); }
  String getUser()      { return readStringFromSettings("mqtt_user", ""); }
  String getPass()      { return readStringFromSettings("mqtt_pass", ""); }
  String getBaseTopic() { return readStringFromSettings("mqtt_topic", "chronofit/"); }

  void setCallback(void (*cb)(char*, uint8_t*, unsigned int));

private:
  WiFiClientSecure _wifiClient;
  PubSubClient*    _mqtt = nullptr;
  void (*_callback)(char*, uint8_t*, unsigned int) = nullptr;

  void _connect();
};