#include "mqtt_manager.h"
#include "globals.h"
#include "routes.h"    // per serializeMessage() e ws
#include "debug.h"
#include <WiFiClientSecure.h>

// cambia questa riga
static WiFiClientSecure _wifiClient;  // invece di WiFiClient

// ── Struttura messaggio in coda ───────────────────────────────────────────────
struct MqttMessage {
  char topic  [MQTT_TOPIC_SIZE];
  char payload[MQTT_PAYLOAD_SIZE];
};

// ── Stato interno ─────────────────────────────────────────────────────────────
static MQTTClient      _mqttClient(512);   // buffer 512 byte
static QueueHandle_t   _queue = nullptr;
static bool            _connected = false;

// ── Callback messaggi in arrivo ───────────────────────────────────────────────
static void _onMessage(String &topic, String &payload) {
  Serial.printf("[MQTT] RX %s → %s\n", topic.c_str(), payload.c_str());

  // ── Gestione comandi in arrivo ────────────────────────────────────────────
  // Per ora solo log. Aggiungere qui i case quando decidi cosa fare.
  // Esempio futuro:
  //   if (topic == MQTT_TOPIC_CMD) {
  //     if (payload == "reset") esp_restart();
  //   }

  // Opzionale: inola il messaggio MQTT anche al WebSocket
  // ws.textAll(serializeMessage("[MQTT] " + payload));
}

// ── Connessione al broker ─────────────────────────────────────────────────────
static void _connect() {
  if (WiFi.status() != WL_CONNECTED) {
    debug("[MQTT] WiFi non disponibile, connessione rimandata");
    return;
  }

  Serial.printf("[MQTT] Connessione a %s:%d...\n", MQTT_HOST, MQTT_PORT);

  bool ok;
  if (strlen(MQTT_USER) > 0) {
    ok = _mqttClient.connect(MQTT_CLIENT_ID, MQTT_USER, MQTT_PASS);
  } else {
    ok = _mqttClient.connect(MQTT_CLIENT_ID);
  }

  if (ok) {
    _connected = true;
    Serial.println("[MQTT] ✅ Connesso!");

    // Subscribe al topic comandi
    _mqttClient.subscribe(MQTT_TOPIC_CMD);
    Serial.printf("[MQTT] Subscribed a %s\n", MQTT_TOPIC_CMD);

    // Notifica WebSocket
    ws.textAll(serializeMessage("✅ MQTT connected"));

  } else {
    _connected = false;
    Serial.printf("[MQTT] ❌ Connessione fallita, errore=%d\n", _mqttClient.lastError());
  }
}

// ── Task FreeRTOS — gira su Core 1 ───────────────────────────────────────────
static void _mqttTask(void* pvParameters) {
  static uint32_t lastReconnectMs   = 0;
  static uint32_t lastKeepAliveMs   = 0;
  const  uint32_t RECONNECT_INTERVAL = 5000;   // riprova ogni 5 s
  
  _wifiClient.setInsecure();  // aggiungilo prima di begin()
  _mqttClient.begin(MQTT_HOST, MQTT_PORT, _wifiClient);
  _mqttClient.onMessage(_onMessage);
  _mqttClient.setKeepAlive(30);

  // Prima connessione
  _connect();

  for (;;) {

    if (_mqttClient.connected()) {
      // ── mantieni vivo il loop MQTT ──────────────────────────────────────
      _mqttClient.loop();
      _connected = true;

      // ── svuota coda publish ─────────────────────────────────────────────
      MqttMessage msg;
      while (xQueueReceive(_queue, &msg, 0) == pdTRUE) {
        bool sent = _mqttClient.publish(msg.topic, msg.payload);
        if (sent) {
          Serial.printf("[MQTT] TX %s → %s\n", msg.topic, msg.payload);
        } else {
          Serial.printf("[MQTT] ❌ Publish fallito su %s\n", msg.topic);
        }
      }

    } else {
      // ── riconnessione con backoff ────────────────────────────────────────
      _connected = false;

      // ✅ inutile tentare se il WiFi non è disponibile
      if (WiFi.status() != WL_CONNECTED) {
        vTaskDelay(pdMS_TO_TICKS(1000));  // aspetta 1s e ricontrolla
        continue;
      }

      uint32_t now = millis();
      if (now - lastReconnectMs > RECONNECT_INTERVAL) {
        lastReconnectMs = now;
        _connect();
      }
    }

    // 10 ms → ~100 cicli/sec, non pesa sul sistema
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ── API pubblica ──────────────────────────────────────────────────────────────

void mqttManagerBegin() {
  // Crea la coda thread-safe
  _queue = xQueueCreate(MQTT_QUEUE_SIZE, sizeof(MqttMessage));
  if (_queue == nullptr) {
    Serial.println("[MQTT] ❌ Impossibile creare la coda FreeRTOS!");
    return;
  }

  // Avvia il task su Core 1 (ESPAsyncWebServer usa Core 0)
  BaseType_t res = xTaskCreatePinnedToCore(
    _mqttTask,
    "mqttTask",
    8192,    // stack 8 KB — sufficiente per MQTT + TLS
    nullptr,
    1,       // priorità 1
    nullptr,
    1        // Core 1
  );

  if (res != pdPASS) {
    Serial.println("[MQTT] ❌ Impossibile creare il task!");
  } else {
    Serial.println("[MQTT] Task avviato su Core 1");
  }

}

bool mqttPublishCheckpoint(const char* payload) {
  if (_queue == nullptr) return false;

  MqttMessage msg;
  strncpy(msg.topic,   MQTT_TOPIC_CHECKPOINT, MQTT_TOPIC_SIZE   - 1);
  strncpy(msg.payload, payload,               MQTT_PAYLOAD_SIZE - 1);
  msg.topic  [MQTT_TOPIC_SIZE   - 1] = '\0';
  msg.payload[MQTT_PAYLOAD_SIZE - 1] = '\0';

  // xQueueSend non blocca (timeout=0): se la coda è piena scarta il messaggio
  if (xQueueSend(_queue, &msg, 0) != pdTRUE) {
    Serial.println("[MQTT] ⚠️ Coda piena, checkpoint scartato");
    return false;
  }
  return true;
}

bool mqttIsConnected() {
  return _connected;
}
