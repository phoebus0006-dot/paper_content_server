#include "config.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <PubSubClient.h>

#include <esp_heap_caps.h>

#include "DEV_Config.h"
#include "EPD_7in3e.h"

struct StateInfo {
  String mode;
  String frameId;
  String nextSwitchAt;
  String title;
};

static String lastFrameId;
static unsigned long lastPollMs = 0;
static bool epdReady = false;

// MQTT state
static WiFiClient mqttWifiClient;
static PubSubClient mqttClient(mqttWifiClient);
static bool mqttEnabled = false;
static bool publicationPending = false;
static String pendingFrameId;
static String pendingSnapshotId;
static String pendingFrameSha256;
static unsigned long mqttReconnectMs = 0;

String endpoint(const char *path) {
  String url = CONTENT_BASE_URL;
  while (url.endsWith("/")) url.remove(url.length() - 1);
  return url + path;
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("WiFi connect: %s\n", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.disconnect(true, true);
  delay(250);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < HTTP_TIMEOUT_MS) {
    delay(250);
    Serial.print('.');
  }
  Serial.println();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("WiFi failed, status=%d\n", WiFi.status());
    return false;
  }

  Serial.printf("WiFi OK, IP=%s\n", WiFi.localIP().toString().c_str());
  return true;
}

void ensureEpdReady() {
  if (epdReady) return;
  Serial.printf("EPD pins BUSY=%d RST=%d DC=%d CS=%d DIN=%d SCLK=%d\n",
                EPD_BUSY_PIN, EPD_RST_PIN, EPD_DC_PIN, EPD_CS_PIN, EPD_MOSI_PIN, EPD_SCK_PIN);
  if (DEV_Module_Init() != 0) {
    Serial.println("DEV_Module_Init failed");
    return;
  }
  epdReady = true;
}

bool readExact(WiFiClient *stream, uint8_t *dst, size_t len, unsigned long timeoutMs) {
  size_t got = 0;
  unsigned long start = millis();
  while (got < len) {
    int available = stream->available();
    if (available > 0) {
      int n = stream->read(dst + got, len - got);
      if (n > 0) {
        got += (size_t)n;
        start = millis();
      }
      continue;
    }
    if (!stream->connected() && !stream->available()) return false;
    if (millis() - start > timeoutMs) return false;
    delay(1);
  }
  return true;
}

String extractJsonString(const String &json, const char *key) {
  String needle = String("\"") + key + "\"";
  int keyPos = json.indexOf(needle);
  if (keyPos < 0) return String();
  int colon = json.indexOf(':', keyPos + needle.length());
  if (colon < 0) return String();
  int start = json.indexOf('"', colon + 1);
  if (start < 0) return String();
  int end = json.indexOf('"', start + 1);
  if (end < 0) return String();
  return json.substring(start + 1, end);
}

bool fetchState(StateInfo &state) {
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/json");

  if (!http.begin(endpoint("/api/state.json"))) {
    Serial.println("state begin failed");
    return false;
  }

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("state HTTP %d\n", code);
    http.end();
    return false;
  }

  String body = http.getString();
  http.end();

  state.mode = extractJsonString(body, "mode");
  state.frameId = extractJsonString(body, "frameId");
  state.nextSwitchAt = extractJsonString(body, "nextSwitchLocal");
  state.title = extractJsonString(body, "title");

  Serial.printf("state mode=%s frameId=%s next=%s title=%s\n",
                state.mode.c_str(), state.frameId.c_str(), state.nextSwitchAt.c_str(), state.title.c_str());
  return !state.frameId.isEmpty();
}

bool displayFrameBuffer(const uint8_t *payload, size_t payloadLen) {
  ensureEpdReady();
  if (!epdReady) return false;

  if (!EPD_7IN3E_Init()) {
    Serial.println("display: EPD init failed (BUSY timeout?)");
    return false;
  }
  if (!EPD_7IN3E_Display((UBYTE *)payload)) {
    Serial.println("display: EPD display failed (BUSY timeout?)");
    return false;
  }
  DEV_Delay_ms(500);
  if (!EPD_7IN3E_Sleep()) {
    Serial.println("display: EPD sleep failed");
    return false;
  }
  Serial.printf("displayFrameBuffer done, payload=%u, epd slept\n", (unsigned)payloadLen);
  return true;
}

bool fetchFrameAndDisplay(const StateInfo &state) {
  if (state.frameId.isEmpty()) return false;
  if (state.frameId == lastFrameId) {
    Serial.printf("skip refresh, frameId unchanged: %s\n", state.frameId.c_str());
    return true;
  }

  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.addHeader("Accept", "application/octet-stream");

  if (!http.begin(endpoint("/api/frame.bin"))) {
    Serial.println("frame begin failed");
    return false;
  }

  const char *responseHeaders[] = {"X-Frame-Id"};
  http.collectHeaders(responseHeaders, 1);

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("frame HTTP %d\n", code);
    http.end();
    return false;
  }

  // Verify X-Frame-Id matches state.frameId to ensure consistency
  // Reject if header missing or mismatched — do not display, do not update lastFrameId
  String serverFrameId = http.header("X-Frame-Id");
  if (serverFrameId.isEmpty() || serverFrameId != state.frameId) {
    Serial.printf("frame X-Frame-Id reject: %s vs expected %s\n",
                  serverFrameId.c_str(), state.frameId.c_str());
    http.end();
    return false;
  }

  int contentLength = http.getSize();
  Serial.printf("frame download start, contentLength=%d\n", contentLength);
  if (contentLength > 0 && contentLength != 192010) {
    Serial.printf("unexpected content length: %d\n", contentLength);
    http.end();
    return false;
  }

  WiFiClient *stream = http.getStreamPtr();
  uint8_t header[10];
  if (!readExact(stream, header, sizeof(header), HTTP_TIMEOUT_MS)) {
    Serial.println("short frame header");
    http.end();
    return false;
  }

  if (header[0] != 'E' || header[1] != 'P' || header[2] != 'F' || header[3] != '1') {
    Serial.printf("bad magic: %02X %02X %02X %02X\n", header[0], header[1], header[2], header[3]);
    http.end();
    return false;
  }

  uint16_t width = (uint16_t)header[4] | ((uint16_t)header[5] << 8);
  uint16_t height = (uint16_t)header[6] | ((uint16_t)header[7] << 8);
  uint8_t panelIndex = header[8];
  uint8_t flags = header[9];
  long payloadLen = ((long)width * (long)height + 1L) / 2L;
  long expectedLen = 10L + payloadLen;

  Serial.printf("EPF1 header width=%u height=%u panel=%u flags=%u payload=%ld total=%ld\n",
                width, height, panelIndex, flags, payloadLen, expectedLen);

  if (width != 800 || height != 480 || panelIndex != PANEL_INDEX) {
    Serial.println("frame header mismatch");
    http.end();
    return false;
  }

  if (contentLength > 0 && contentLength != expectedLen) {
    Serial.printf("length mismatch: got=%d expected=%ld\n", contentLength, expectedLen);
    http.end();
    return false;
  }

  uint8_t *frame = (uint8_t *)heap_caps_malloc(payloadLen, MALLOC_CAP_8BIT | MALLOC_CAP_SPIRAM);
  if (!frame) frame = (uint8_t *)malloc(payloadLen);
  if (!frame) {
    Serial.println("frame malloc failed");
    http.end();
    return false;
  }

  if (!readExact(stream, frame, payloadLen, HTTP_TIMEOUT_MS)) {
    Serial.println("frame payload read failed");
    free(frame);
    http.end();
    return false;
  }

  http.end();

  Serial.printf("frame downloaded bytes=%ld\n", payloadLen);
  bool ok = displayFrameBuffer(frame, payloadLen);
  free(frame);
  if (ok) {
    lastFrameId = state.frameId;
    Serial.printf("display OK, frameId=%s\n", lastFrameId.c_str());
  }
  return ok;
}

void periodicPoll() {
  if (millis() - lastPollMs < REFRESH_INTERVAL_MS) return;
  lastPollMs = millis();
  if (!connectWiFi()) return;

  StateInfo state;
  if (fetchState(state) && fetchFrameAndDisplay(state)) {
    // clear pending on successful poll refresh
    publicationPending = false;
    pendingFrameId = String();
  }
}

void handleMqttNotification() {
  if (!publicationPending) return;
  if (pendingFrameId.isEmpty()) { publicationPending = false; return; }
  if (pendingFrameId == lastFrameId) { publicationPending = false; pendingFrameId = String(); return; }

  if (!connectWiFi()) return;

  StateInfo state;
  if (!fetchState(state)) { return; }

  if (state.frameId != pendingFrameId) {
    // MQTT notification announced a different frameId than current server state
    // This can happen if multiple notifications arrive; still refresh based on server state
    Serial.printf("MQTT pending frameId=%s != server frameId=%s, using server\n",
                  pendingFrameId.c_str(), state.frameId.c_str());
  }

  if (fetchFrameAndDisplay(state)) {
    publicationPending = false;
    pendingFrameId = String();
    // reset poll timer so next poll is at full interval from now
    lastPollMs = millis();
  }
}

// MQTT callback — MUST be lightweight: no HTTP, no display, no long blocking
void mqttCallback(char *topic, byte *payload, unsigned int length) {
  // Validate topic
  String deviceTopic = "epaper/" + String(MQTT_DEVICE_ID) + "/publication";
  if (String(topic) != deviceTopic) {
    Serial.printf("MQTT ignoring wrong topic: %s\n", topic);
    return;
  }

  // Validate payload size
  if (length == 0 || length > 1024) {
    Serial.printf("MQTT ignoring oversized payload: %u bytes\n", length);
    return;
  }

  // Parse JSON manually to avoid dynamic allocation
  String jsonStr = String((char *)payload, length);

  // Extract schemaVersion
  String sv = extractJsonString(jsonStr, "schemaVersion");
  if (sv != "1") {
    Serial.printf("MQTT ignoring unknown schemaVersion: %s\n", sv.c_str());
    return;
  }

  // Extract deviceId
  String msgDeviceId = extractJsonString(jsonStr, "deviceId");
  if (msgDeviceId.isEmpty() || msgDeviceId != String(MQTT_DEVICE_ID)) {
    Serial.printf("MQTT ignoring deviceId mismatch: %s\n", msgDeviceId.c_str());
    return;
  }

  String msgFrameId = extractJsonString(jsonStr, "frameId");
  if (msgFrameId.isEmpty()) {
    Serial.println("MQTT ignoring empty frameId");
    return;
  }

  // Deduplicate in callback: if same frameId already pending or displayed, skip
  if (msgFrameId == pendingFrameId || msgFrameId == lastFrameId) {
    Serial.printf("MQTT ignoring duplicate frameId: %s\n", msgFrameId.c_str());
    return;
  }

  // Set pending flag — main loop will handle the HTTP fetch
  pendingFrameId = msgFrameId;
  pendingSnapshotId = extractJsonString(jsonStr, "snapshotId");
  pendingFrameSha256 = extractJsonString(jsonStr, "frameSha256");
  publicationPending = true;

  Serial.printf("MQTT notification received: frameId=%s\n", pendingFrameId.c_str());
}

void connectMqtt() {
  if (!mqttEnabled) return;
  if (mqttClient.connected()) return;

  // Throttle reconnect attempts
  if (millis() < mqttReconnectMs) return;

  String clientId = String(MQTT_DEVICE_ID) + "_" + String(random(0xFFFF), HEX);
  Serial.printf("MQTT connecting to %s as %s\n", MQTT_BROKER, clientId.c_str());

  mqttClient.setServer(MQTT_BROKER, 1883);
  mqttClient.setCallback(mqttCallback);

  if (mqttClient.connect(clientId.c_str())) {
    Serial.println("MQTT connected");
    String topic = "epaper/" + String(MQTT_DEVICE_ID) + "/publication";
    mqttClient.subscribe(topic.c_str());
    Serial.printf("MQTT subscribed to %s\n", topic.c_str());
  } else {
    Serial.printf("MQTT connect failed, state=%d\n", mqttClient.state());
    mqttReconnectMs = millis() + 30000;
  }
}

void refreshOnce() {
  if (!connectWiFi()) return;

  StateInfo state;
  if (!fetchState(state)) return;
  if (!fetchFrameAndDisplay(state)) return;
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("NewsPhoto_esp32wf starting");
  Serial.printf("Content server: %s\n", CONTENT_BASE_URL);

  mqttEnabled = String(MQTT_ENABLED).equalsIgnoreCase("true");
  if (mqttEnabled) {
    Serial.printf("MQTT enabled, broker=%s deviceId=%s\n", MQTT_BROKER, MQTT_DEVICE_ID);
  } else {
    Serial.println("MQTT disabled");
  }

  refreshOnce();
  lastPollMs = millis();
}

void loop() {
  // MQTT loop (non-blocking if client not connected)
  if (mqttEnabled) {
    if (!mqttClient.connected()) {
      connectMqtt();
    }
    if (mqttClient.connected()) {
      mqttClient.loop();
    }
  }

  // Handle MQTT-triggered refresh (no delay, lightweight check)
  if (publicationPending) {
    handleMqttNotification();
  }

  // Periodic HTTP polling (60s interval, preserved even with MQTT)
  periodicPoll();

  delay(50);
}
