// firmware_host_test.cpp — Host C++ unit tests for production ESP32 firmware core helpers
// Compiles directly against production C++ files in NewsPhoto_esp32wf/firmware_core/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

// R4-09: Verify headers support multiple inclusion without redefinition errors
#include "../../../NewsPhoto_esp32wf/firmware_core/time_utils.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/time_utils.h"

#include "../../../NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h"

#include "../../../NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h"

void test_time_utils() {
  assert(isTimeReached(1000, 500) == true);
  assert(isTimeReached(500, 500) == true);
  assert(isTimeReached(499, 500) == false);

  // uint32 overflow wrap safety
  uint32_t nearMax = 0xFFFFFFF0;
  uint32_t afterWrap = 0x00000010;
  uint32_t deadlineAfterWrap = 0x0000001A;

  assert(isTimeReached(nearMax, deadlineAfterWrap) == false);
  assert(isTimeReached(afterWrap, deadlineAfterWrap) == false);
  assert(isTimeReached(30, deadlineAfterWrap) == true);
  printf("PASS: test_time_utils\n");
}

void test_mqtt_pending_state() {
  MqttPendingState state;
  MqttPendingState_Init(&state);
  assert(state.publicationPending == false);
  assert(state.mqttRetryMs == 0);

  // Overlong or invalid SHA format rejection
  assert(MqttPendingState_SetPending(&state, "frame-100", "snap-100", "invalid-sha") == false);
  assert(state.publicationPending == false);

  const char *validSha1 = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  assert(MqttPendingState_SetPending(&state, "frame-100", "snap-100", validSha1) == true);
  assert(state.publicationPending == true);
  assert(state.mqttRetryMs == 0);

  // WiFi failure retains pending state and sets 5s retry deadline
  MqttNotificationEvalResult res1 = MqttPendingState_Evaluate(&state, 1000, "", false, true, NULL, NULL, false);
  assert(res1 == MQTT_EVAL_RETAIN_WIFI_FAILURE);
  assert(state.publicationPending == true);
  assert(state.mqttRetryMs == 6000);

  // Attempt before retry deadline -> WAIT
  MqttNotificationEvalResult res2 = MqttPendingState_Evaluate(&state, 3000, "", true, true, NULL, NULL, false);
  assert(res2 == MQTT_EVAL_WAIT_RETRY_DEADLINE);
  assert(state.publicationPending == true);

  // New notification resets retry deadline to 0 (does not inherit 5s backoff)
  const char *validSha2 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert(MqttPendingState_SetPending(&state, "frame-200", "snap-200", validSha2) == true);
  assert(state.mqttRetryMs == 0);
  assert(state.publicationPending == true);

  // Attempt immediately succeeds deadline check
  MqttNotificationEvalResult res3 = MqttPendingState_Evaluate(&state, 3500, "", true, true, "frame-200", validSha2, true);
  assert(res3 == MQTT_EVAL_SUCCESS_RENDERED);
  assert(state.publicationPending == false);
  assert(state.mqttRetryMs == 0);

  printf("PASS: test_mqtt_pending_state\n");
}

void test_frame_transport_policy() {
  FrameTransportParams p;
  memset(&p, 0, sizeof(p));

  // Valid 192010-byte frame params
  p.contentLength = 192010;
  p.headerBytesRead = 10;
  p.header[0] = 'E'; p.header[1] = 'P'; p.header[2] = 'F'; p.header[3] = '1';
  p.header[4] = 0x20; p.header[5] = 0x03; // width 800 (0x0320)
  p.header[6] = 0xE0; p.header[7] = 0x01; // height 480 (0x01E0)
  p.header[8] = 49;                       // panel 49
  p.header[9] = 1;                        // version 1
  p.payloadBytesRead = 192000;
  p.streamHasExtraBytes = false;
  p.shaMatched = true;
  p.displayOk = true;

  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_OK);

  // Content-Length missing
  p.contentLength = -1;
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_CONTENT_LENGTH_MISSING);

  // Content-Length mismatch (e.g. 192009 or 192011)
  p.contentLength = 192009;
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_CONTENT_LENGTH_MISMATCH);

  p.contentLength = 192010;
  p.headerBytesRead = 8; // Short header read
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_HEADER_READ_FAILED);

  p.headerBytesRead = 10;
  p.header[0] = 'X'; // Bad magic
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_MAGIC_MISMATCH);

  p.header[0] = 'E';
  p.header[9] = 2; // Unsupported version
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_VERSION_UNSUPPORTED);

  p.header[9] = 1;
  p.payloadBytesRead = 191999; // Short payload read
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_PAYLOAD_READ_FAILED);

  p.payloadBytesRead = 192000;
  p.streamHasExtraBytes = true; // Extra trailing bytes
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_EXTRA_TRAILING_BYTES);

  p.streamHasExtraBytes = false;
  p.shaMatched = false; // SHA mismatch
  assert(FrameTransport_Evaluate(&p) == FRAME_TRANSPORT_SHA_MISMATCH);

  printf("PASS: test_frame_transport_policy\n");
}

int main() {
  printf("Running Production Firmware C++ Host Tests...\n");
  test_time_utils();
  test_mqtt_pending_state();
  test_frame_transport_policy();
  printf("ALL FIRMWARE HOST C++ TESTS PASSED SUCCESSFULLY.\n");
  return 0;
}
