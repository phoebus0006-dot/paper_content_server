#include "config.h"

#include <HTTPClient.h>
#include <WiFi.h>

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
  refreshOnce();
  lastPollMs = millis();
}

void loop() {
  if (millis() - lastPollMs >= REFRESH_INTERVAL_MS) {
    lastPollMs = millis();
    refreshOnce();
  }
  delay(50);
}