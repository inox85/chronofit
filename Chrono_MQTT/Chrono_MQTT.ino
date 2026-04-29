#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>

const char* mqttServer = "918090d5e9974ce28ebaabfe1cf1a626.s1.eu.hivemq.cloud";
const int   mqttPort   = 8883;
const char* mqttUser   = "chronofit";
const char* mqttPass   = "Freedom2020";

const char* topicPub   = "test/chronofit/1";
const char* topicSub   = "test/comando";

WiFiClientSecure wifiClient;
PubSubClient mqtt(wifiClient);

String selectedSSID = "";
String wifiPassword = "";

void onMessage(char* topic, byte* payload, unsigned int length) {
  String msg = "";
  for (int i = 0; i < length; i++) msg += (char)payload[i];
  Serial.printf("[MQTT IN] topic=%s payload=%s\n", topic, msg.c_str());

  if (msg == "led_on")  Serial.println("Accendo LED!");
  else if (msg == "led_off") Serial.println("Spengo LED!")
}

void scanAndSelectNetwork() {
  Serial.println("\nScansione reti WiFi in corso...");
  int n = WiFi.scanNetworks();

  if (n == 0) {
    Serial.println("Nessuna rete trovata.");
    return;
  }

  Serial.println("\nReti disponibili:");
  for (int i = 0; i < n; i++) {
    Serial.printf("  [%d] %s (%d dBm) %s\n",
                  i + 1,
                  WiFi.SSID(i).c_str(),
                  WiFi.RSSI(i),
                  WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "aperta" : "protetta");
  }

  Serial.print("\nInserisci il numero della rete: ");
  while (!Serial.available());
  int scelta = Serial.parseInt();
  Serial.println(scelta);

  if (scelta < 1 || scelta > n) {
    Serial.println("Scelta non valida.");
    return;
  }

  selectedSSID = WiFi.SSID(scelta - 1);
  Serial.printf("Rete selezionata: %s\n", selectedSSID.c_str());

  if (WiFi.encryptionType(scelta - 1) != WIFI_AUTH_OPEN) {
    Serial.print("Inserisci la password: ");
    while (!Serial.available());
    wifiPassword = Serial.readStringUntil('\n');
    wifiPassword.trim();
    Serial.println("********");
  }
}

void connectWiFi() {
  WiFi.begin(selectedSSID.c_str(), wifiPassword.c_str());
  Serial.print("Connessione a " + selectedSSID);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 10000) {
    delay(500);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnesso! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nConnessione fallita — riprovo scansione.");
    scanAndSelectNetwork();
    connectWiFi();
  }
}

void connectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("Connessione MQTT...");
    if (mqtt.connect("ESP32_test", mqttUser, mqttPass)) {
      Serial.println("connesso!");
      mqtt.subscribe(topicSub);
      Serial.println("Iscritto a: " + String(topicSub));
    } else {
      Serial.printf("fallito, rc=%d — riprovo tra 3s\n", mqtt.state());
      delay(3000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  WiFi.mode(WIFI_STA);
  scanAndSelectNetwork();

  if (selectedSSID != "") connectWiFi();

  wifiClient.setInsecure();
  mqtt.setServer(mqttServer, mqttPort);
  mqtt.setCallback(onMessage);
}

void loop() {
  if (!mqtt.connected()) connectMQTT();
  mqtt.loop();

  static unsigned long last = 0;
  if (millis() - last > 5000) {
    last = millis();
    String payload = "{\"device\":\"ESP32\",\"uptime\":" + String(millis()) + "}";
    mqtt.publish(topicPub, payload.c_str());
    Serial.println("Pubblicato: " + payload);
  }
}