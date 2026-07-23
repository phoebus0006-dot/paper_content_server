// firmware_host_test.cpp — Host C++ unit tests for production ESP32 firmware core helpers
// Compiles directly against production C++ files in NewsPhoto_esp32wf/firmware_core/

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <assert.h>

// R4-09, R5-01: Verify headers support multiple inclusion without redefinition errors
#include "../../../NewsPhoto_esp32wf/firmware_core/time_utils.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/time_utils.h"

#include "../../../NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/frame_transport_policy.h"

#include "../../../NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/mqtt_pending_state.h"

#include "../../../NewsPhoto_esp32wf/firmware_core/frame_render_gate.h"
#include "../../../NewsPhoto_esp32wf/firmware_core/frame_render_gate.h"

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

  // MqttPendingState_CanAttempt check
  MqttPendingDecision dec1 = MqttPendingState_CanAttempt(&state, 1000, "");
  assert(dec1 == MQTT_DECISION_ATTEMPT);

  // Wi-Fi temporary failure sets retry deadline
  MqttPendingState_OnTemporaryFailure(&state, 1000);
  assert(state.publicationPending == true);
  assert(state.mqttRetryMs == 6000);

  // Attempt before deadline -> WAIT_RETRY
  MqttPendingDecision dec2 = MqttPendingState_CanAttempt(&state, 3000, "");
  assert(dec2 == MQTT_DECISION_WAIT_RETRY);

  // New notification resets retry deadline to 0 (does not inherit previous 5s backoff)
  const char *validSha2 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert(MqttPendingState_SetPending(&state, "frame-200", "snap-200", validSha2) == true);
  assert(state.mqttRetryMs == 0);

  // Server state mismatch clears pending
  MqttPendingDecision dec3 = MqttPendingState_OnServerState(&state, "frame-999", validSha2);
  assert(dec3 == MQTT_DECISION_CLEAR_STALE_FRAME);
  assert(state.publicationPending == false);
  assert(state.mqttRetryMs == 0);

  // Re-set pending and test success transition
  assert(MqttPendingState_SetPending(&state, "frame-300", "snap-300", validSha2) == true);
  MqttPendingState_OnSuccess(&state);
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

typedef struct {
  int callCount;
  bool returnSuccess;
} FakeDisplayCtx;

static bool fakeDisplayCb(const uint8_t *frame, size_t len, void *userData) {
  (void)frame;
  (void)len;
  FakeDisplayCtx *ctx = (FakeDisplayCtx *)userData;
  if (ctx) {
    ctx->callCount++;
    return ctx->returnSuccess;
  }
  return true;
}

void test_frame_render_gate() {
  uint8_t dummyFrame[192000];
  memset(dummyFrame, 0x55, sizeof(dummyFrame));

  FrameTransportParams p;
  memset(&p, 0, sizeof(p));
  p.contentLength = 192010;
  p.headerBytesRead = 10;
  p.header[0] = 'E'; p.header[1] = 'P'; p.header[2] = 'F'; p.header[3] = '1';
  p.header[4] = 0x20; p.header[5] = 0x03;
  p.header[6] = 0xE0; p.header[7] = 0x01;
  p.header[8] = 49;
  p.header[9] = 1;
  p.payloadBytesRead = 192000;
  p.streamHasExtraBytes = false;
  p.shaMatched = false; // Invalid SHA

  FakeDisplayCtx ctx = { 0, true };

  // Case 1: Transport invalid -> display callback MUST NOT be invoked (R5-01, R5-07)
  FrameRenderResult res1 = FrameRenderGate_Execute(&p, dummyFrame, sizeof(dummyFrame), fakeDisplayCb, &ctx);
  assert(res1.transportResult == FRAME_TRANSPORT_SHA_MISMATCH);
  assert(res1.displayAttempted == false);
  assert(res1.displaySuccess == false);
  assert(res1.lastFrameUpdated == false);
  assert(ctx.callCount == 0);

  // Case 2: Transport valid -> display callback IS invoked exactly once
  p.shaMatched = true;
  FrameRenderResult res2 = FrameRenderGate_Execute(&p, dummyFrame, sizeof(dummyFrame), fakeDisplayCb, &ctx);
  assert(res2.transportResult == FRAME_TRANSPORT_OK);
  assert(res2.displayAttempted == true);
  assert(res2.displaySuccess == true);
  assert(res2.lastFrameUpdated == true);
  assert(ctx.callCount == 1);

  // Case 3: Transport valid, but display execution fails -> lastFrame NOT updated
  ctx.returnSuccess = false;
  FrameRenderResult res3 = FrameRenderGate_Execute(&p, dummyFrame, sizeof(dummyFrame), fakeDisplayCb, &ctx);
  assert(res3.transportResult == FRAME_TRANSPORT_OK);
  assert(res3.displayAttempted == true);
  assert(res3.displaySuccess == false);
  assert(res3.lastFrameUpdated == false);
  assert(ctx.callCount == 2);

  printf("PASS: test_frame_render_gate\n");
}

int main() {
  printf("Running Production Firmware C++ Host Tests...\n");
  test_time_utils();
  test_mqtt_pending_state();
  test_frame_transport_policy();
  test_frame_render_gate();
  printf("ALL FIRMWARE HOST C++ TESTS PASSED SUCCESSFULLY.\n");
  return 0;
}
