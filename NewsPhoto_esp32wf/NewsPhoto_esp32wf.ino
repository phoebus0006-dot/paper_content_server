#include "config.h"

#include <HTTPClient.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <mbedtls/sha256.h>

#include <esp_heap_caps.h>

#include "DEV_Config.h"
#include "EPD_7in3e.h"

#include "firmware_core/time_utils.h"
#include "firmware_core/mqtt_pending_state.h"
#include "firmware_core/frame_transport_policy.h"

struct StateInfo {
  String mode;
  String frameId;
  String nextSwitchAt;
  String title;
  String frameSha256;
};

static String lastFrameId;
static unsigned long lastPollMs = 0;
static bool epdReady = false;

// MQTT state — SINGLE AUTHORITATIVE OBJECT (R4-03)
static WiFiClient mqttWifiClient;
static PubSubClient mqttClient(mqttWifiClient);
static bool mqttEnabled = false;
static MqttPendingState mqttState;
static unsigned long mqttReconnectMs = 0;

void clearPendingMqttNotification() {
  MqttPendingState_Clear(&mqttState);
}

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

  WiFi.begin(WIFI_SSID, WIFI_PASS);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < WIFI_TIMEOUT_MS) {
    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WiFi OK, IP: %s\n", WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.println("WiFi timeout");
  return false;
}

bool readExact(WiFiClient *stream, uint8_t *buf, size_t len, unsigned long timeoutMs) {
  size_t read = 0;
  unsigned long start = millis();

  while (read < len && millis() - start < timeoutMs) {
    while (stream->available() > 0 && read < len) {
      int c = stream->read();
      if (c < 0) break;
      buf[read++] = (uint8_t)c;
      start = millis();
    }
    if (read < len) delay(1);
  }

  return read == len;
}

bool isValidShaHex(const String &sha) {
  if (sha.length() != 64) return false;
  for (unsigned int i = 0; i < sha.length(); i++) {
    char c = sha.charAt(i);
    bool ok = (c >= '0' && c <= '9') ||
              (c >= 'a' && c <= 'f') ||
              (c >= 'A' && c <= 'F');
    if (!ok) return false;
  }
  return true;
}

String normalizeShaHex(const String &sha) {
  String out = sha;
  out.toLowerCase();
  return out;
}

String extractJsonString(const String &json, const char *key) {
  String pattern = "\"" + String(key) + "\"";
  int pos = json.indexOf(pattern);
  if (pos < 0) return "";

  int colon = json.indexOf(':', pos);
  if (colon < 0) return "";

  int quoteStart = json.indexOf('"', colon);
  if (quoteStart < 0) return "";

  int quoteEnd = json.indexOf('"', quoteStart + 1);
  if (quoteEnd < 0) return "";

  return json.substring(quoteStart + 1, quoteEnd);
}

bool extractJsonInt(const String &json, const char *key, int &outVal) {
  String pattern = "\"" + String(key) + "\"";
  int pos = json.indexOf(pattern);
  if (pos < 0) return false;

  int colon = json.indexOf(':', pos);
  if (colon < 0) return false;

  int p = colon + 1;
  while (p < (int)json.length() && (json.charAt(p) == ' ' || json.charAt(p) == '\t' || json.charAt(p) == '\r' || json.charAt(p) == '\n')) {
    p++;
  }
  if (p >= (int)json.length()) return false;

  if (json.charAt(p) == '"') {
    p++;
    int start = p;
    while (p < (int)json.length() && json.charAt(p) >= '0' && json.charAt(p) <= '9') {
      p++;
    }
    if (p == start) return false;
    outVal = json.substring(start, p).toInt();
    return true;
  }

  if ((json.charAt(p) >= '0' && json.charAt(p) <= '9') || json.charAt(p) == '-') {
    int start = p;
    if (json.charAt(p) == '-') p++;
    while (p < (int)json.length() && json.charAt(p) >= '0' && json.charAt(p) <= '9') {
      p++;
    }
    if (p == start || (p == start + 1 && json.charAt(start) == '-')) return false;
    outVal = json.substring(start, p).toInt();
    return true;
  }

  return false;
}

bool ensureEpdReady() {
  if (epdReady) return true;

  Serial.println("EPD init starting");
  if (DEV_Module_Init() != 0) {
    Serial.println("DEV_Module_Init failed");
    return false;
  }

  EPD_7IN3E_Init();
  epdReady = true;
  Serial.println("EPD init ready");
  return true;
}

bool displayFrameBuffer(const uint8_t *frame, size_t len) {
  if (len != 192000) {
    Serial.printf("display payload mismatch: len=%zu expected=192000\n", len);
    return false;
  }

  if (!ensureEpdReady()) {
    Serial.println("display failed: EPD not ready");
    return false;
  }

  Serial.println("EPD DisplayFrame starting");
  EPD_7IN3E_DisplayFrame(frame);
  Serial.println("EPD DisplayFrame completed");
  return true;
}

bool fetchState(StateInfo &state) {
  HTTPClient http;
  String url = endpoint(STATE_ENDPOINT);

  Serial.printf("fetchState: %s\n", url.c_str());
  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (strlen(DEVICE_SECRET) > 0) {
    http.addHeader("X-Device-Secret", DEVICE_SECRET);
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
  state.nextSwitchAt = extractJsonString(body, "nextSwitchAt");
  state.title = extractJsonString(body, "title");
  state.frameSha256 = extractJsonString(body, "frameSha256");

  Serial.printf("state mode=%s frameId=%s sha256=%s title=%s\n",
                state.mode.c_str(),
                state.frameId.c_str(),
                state.frameSha256.substring(0, 16).c_str(),
                state.title.c_str());

  return !state.frameId.isEmpty();
}

bool fetchFrameAndDisplay(const StateInfo &state, const String &expectedSha) {
  if (state.frameId == lastFrameId) {
    Serial.printf("frame %s already displayed, skip download\n", state.frameId.c_str());
    return true;
  }

  HTTPClient http;
  String url = endpoint(FRAME_ENDPOINT);
  Serial.printf("fetchFrame: %s for %s\n", url.c_str(), state.frameId.c_str());

  http.begin(url);
  http.setTimeout(HTTP_TIMEOUT_MS);
  http.collectHeaders((const char *[]){"X-Frame-Id"}, 1);
  if (strlen(DEVICE_SECRET) > 0) {
    http.addHeader("X-Device-Secret", DEVICE_SECRET);
  }

  int code = http.GET();
  if (code != HTTP_CODE_OK) {
    Serial.printf("frame HTTP %d\n", code);
    http.end();
    return false;
  }

  String serverFrameId = http.header("X-Frame-Id");
  if (serverFrameId.isEmpty() || serverFrameId != state.frameId) {
    Serial.printf("frame X-Frame-Id reject: %s vs expected %s\n",
                  serverFrameId.c_str(), state.frameId.c_str());
    http.end();
    return false;
  }

  // Production Transport Integration with FrameTransport_Evaluate (R4-02)
  FrameTransportParams trParams;
  memset(&trParams, 0, sizeof(trParams));
  trParams.contentLength = http.getSize();

  WiFiClient *stream = http.getStreamPtr();
  uint8_t header[10];
  if (stream && readExact(stream, header, sizeof(header), HTTP_TIMEOUT_MS)) {
    trParams.headerBytesRead = 10;
    memcpy(trParams.header, header, 10);
  }

  uint8_t *frame = NULL;
  long payloadLen = 192000L;
  if (trParams.headerBytesRead == 10) {
    frame = (uint8_t *)heap_caps_malloc(payloadLen, MALLOC_CAP_8BIT | MALLOC_CAP_SPIRAM);
    if (!frame) frame = (uint8_t *)malloc(payloadLen);
    if (frame && readExact(stream, frame, payloadLen, HTTP_TIMEOUT_MS)) {
      trParams.payloadBytesRead = payloadLen;
    }
  }

  trParams.streamHasExtraBytes = (stream && stream->available() > 0);

  // Full 192010-byte SHA256 calculation
  bool shaOk = false;
  if (trParams.payloadBytesRead == payloadLen) {
    mbedtls_sha256_context shaCtx;
    mbedtls_sha256_init(&shaCtx);
    if (mbedtls_sha256_starts_ret(&shaCtx, 0) == 0 &&
        mbedtls_sha256_update_ret(&shaCtx, trParams.header, 10) == 0 &&
        mbedtls_sha256_update_ret(&shaCtx, frame, payloadLen) == 0) {
      uint8_t digest[32];
      if (mbedtls_sha256_finish_ret(&shaCtx, digest) == 0) {
        char hex[65];
        for (int i = 0; i < 32; i++) sprintf(hex + (i * 2), "%02x", digest[i]);
        hex[64] = '\0';
        if (String(hex) == expectedSha) {
          shaOk = true;
        }
      }
    }
    mbedtls_sha256_free(&shaCtx);
  }
  trParams.shaMatched = shaOk;

  // Render to EPD
  bool displayOk = false;
  if (shaOk && frame) {
    displayOk = displayFrameBuffer(frame, payloadLen);
  }
  trParams.displayOk = displayOk;

  if (frame) free(frame);
  http.end();

  // SINGLE AUTHORITATIVE DECISION BY FrameTransport_Evaluate (R4-02)
  FrameTransportResult trResult = FrameTransport_Evaluate(&trParams);
  if (trResult != FRAME_TRANSPORT_OK) {
    Serial.printf("FrameTransport rejected: %s\n", FrameTransportResult_ToString(trResult));
    return false;
  }

  lastFrameId = state.frameId;
  Serial.printf("display OK, frameId=%s\n", lastFrameId.c_str());
  return true;
}

void periodicPoll() {
  if (!isTimeReached(millis(), lastPollMs + REFRESH_INTERVAL_MS)) return;
  lastPollMs = millis();
  if (!connectWiFi()) return;

  StateInfo state;
  if (!fetchState(state)) return;

  if (state.frameSha256.isEmpty() || !isValidShaHex(state.frameSha256)) {
    Serial.println("periodicPoll reject: state.frameSha256 is missing or invalid");
    return;
  }

  String expectedSha = normalizeShaHex(state.frameSha256);
  if (fetchFrameAndDisplay(state, expectedSha)) {
    clearPendingMqttNotification();
  }
}

void handleMqttNotification() {
  if (!mqttState.publicationPending) return;
  if (!isTimeReached(millis(), mqttState.mqttRetryMs)) return;

  if (mqttState.pendingFrameId[0] == '\0' || strcmp(mqttState.pendingFrameId, lastFrameId.c_str()) == 0) {
    clearPendingMqttNotification();
    return;
  }

  bool wifiOk = connectWiFi();
  if (!wifiOk) {
    mqttState.mqttRetryMs = millis() + 5000;
    return;
  }

  StateInfo state;
  bool stateOk = fetchState(state);
  if (!stateOk) {
    mqttState.mqttRetryMs = millis() + 5000;
    return;
  }

  String stateSha = normalizeShaHex(state.frameSha256);
  bool fetchDisplayOk = false;

  if (state.frameId == String(mqttState.pendingFrameId) && stateSha == String(mqttState.pendingFrameSha256)) {
    fetchDisplayOk = fetchFrameAndDisplay(state, stateSha);
  }

  MqttNotificationEvalResult res = MqttPendingState_Evaluate(
    &mqttState, millis(), lastFrameId.c_str(), wifiOk, stateOk,
    state.frameId.c_str(), stateSha.c_str(), fetchDisplayOk
  );

  if (res == MQTT_EVAL_SUCCESS_RENDERED) {
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

  // schemaVersion is emitted by the server as a JSON number (2).
  // We accept v1 and v2 (numeric). String forms ("1"/"2") are also accepted
  // for tolerance, but a missing, 0, 3, or non-numeric value is rejected.
  int svNum = 0;
  bool svIsNum = extractJsonInt(jsonStr, "schemaVersion", svNum);
  String svStr = extractJsonString(jsonStr, "schemaVersion");
  bool svIsString1 = (svStr == "1");
  bool svIsString2 = (svStr == "2");
  bool svValid = (svIsNum && (svNum == 1 || svNum == 2)) || svIsString1 || svIsString2;
  if (!svValid) {
    Serial.printf("MQTT ignoring unknown schemaVersion: num=%d str=%s\n",
                  svNum, svStr.c_str());
    return;
  }

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

  if (msgFrameId == String(mqttState.pendingFrameId) || msgFrameId == lastFrameId) {
    Serial.printf("MQTT ignoring duplicate frameId: %s\n", msgFrameId.c_str());
    return;
  }

  // Validate frameSha256 format before accepting notification
  String msgSha = extractJsonString(jsonStr, "frameSha256");
  if (msgSha.isEmpty() || !isValidShaHex(msgSha)) {
    Serial.printf("MQTT ignoring invalid frameSha256: %s\n", msgSha.c_str());
    return;
  }

  // Normalize to lowercase
  msgSha = normalizeShaHex(msgSha);

  // Single authoritative pending state update (R4-03)
  bool ok = MqttPendingState_SetPending(
    &mqttState,
    msgFrameId.c_str(),
    extractJsonString(jsonStr, "snapshotId").c_str(),
    msgSha.c_str()
  );

  if (!ok) {
    Serial.println("MQTT notification rejected: invalid field lengths or format");
    return;
  }

  Serial.printf("MQTT notification received: frameId=%s sha256=%s\n",
                mqttState.pendingFrameId, String(mqttState.pendingFrameSha256).substring(0, 16).c_str());
}

void connectMqtt() {
  if (!mqttEnabled) return;
  if (mqttClient.connected()) return;

  if (!isTimeReached(millis(), mqttReconnectMs)) return;

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

  if (state.frameSha256.isEmpty() || !isValidShaHex(state.frameSha256)) {
    Serial.println("refreshOnce reject: missing or invalid frameSha256 in state");
    return;
  }

  String expectedSha = normalizeShaHex(state.frameSha256);
  if (!fetchFrameAndDisplay(state, expectedSha)) {
    Serial.println("refreshOnce frame fetch/display failed");
    return;
  }
}

void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println();
  Serial.println("NewsPhoto_esp32wf starting");
  Serial.printf("Content server: %s\n", CONTENT_BASE_URL);

  MqttPendingState_Init(&mqttState);

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
  if (mqttEnabled) {
    if (!mqttClient.connected()) {
      connectMqtt();
    }
    if (mqttClient.connected()) {
      mqttClient.loop();
    }
  }

  handleMqttNotification();
  periodicPoll();
  delay(100);
}
