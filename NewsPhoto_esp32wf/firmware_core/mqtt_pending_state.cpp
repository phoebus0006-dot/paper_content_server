#include "mqtt_pending_state.h"
#include "time_utils.h"
#include <string.h>
#include <ctype.h>

static void safe_strcpy(char *dst, const char *src, size_t dstSize) {
  if (!dst || dstSize == 0) return;
  if (!src) {
    dst[0] = '\0';
    return;
  }
  strncpy(dst, src, dstSize - 1);
  dst[dstSize - 1] = '\0';
}

static bool isValidSha64(const char *sha) {
  if (!sha || strlen(sha) != 64) return false;
  for (int i = 0; i < 64; i++) {
    if (!isxdigit((unsigned char)sha[i])) return false;
  }
  return true;
}

void MqttPendingState_Init(MqttPendingState *state) {
  if (!state) return;
  state->publicationPending = false;
  state->pendingFrameId[0] = '\0';
  state->pendingSnapshotId[0] = '\0';
  state->pendingFrameSha256[0] = '\0';
  state->mqttRetryMs = 0;
}

void MqttPendingState_Clear(MqttPendingState *state) {
  if (!state) return;
  state->publicationPending = false;
  state->pendingFrameId[0] = '\0';
  state->pendingSnapshotId[0] = '\0';
  state->pendingFrameSha256[0] = '\0';
  state->mqttRetryMs = 0;
}

bool MqttPendingState_SetPending(MqttPendingState *state, const char *frameId, const char *snapshotId, const char *sha256) {
  if (!state) return false;
  if (!frameId || frameId[0] == '\0' || strlen(frameId) >= sizeof(state->pendingFrameId)) {
    return false;
  }
  if (snapshotId && strlen(snapshotId) >= sizeof(state->pendingSnapshotId)) {
    return false;
  }
  if (!isValidSha64(sha256)) {
    return false;
  }

  safe_strcpy(state->pendingFrameId, frameId, sizeof(state->pendingFrameId));
  safe_strcpy(state->pendingSnapshotId, snapshotId, sizeof(state->pendingSnapshotId));
  safe_strcpy(state->pendingFrameSha256, sha256, sizeof(state->pendingFrameSha256));
  state->publicationPending = true;
  state->mqttRetryMs = 0; // Reset retry deadline for new notification
  return true;
}

MqttNotificationEvalResult MqttPendingState_Evaluate(
    MqttPendingState *state,
    uint32_t nowMs,
    const char *lastFrameId,
    bool wifiOk,
    bool fetchStateOk,
    const char *serverFrameId,
    const char *serverFrameSha256,
    bool fetchAndDisplayOk
) {
  if (!state || !state->publicationPending) return MQTT_EVAL_NO_PENDING;

  if (!isTimeReached(nowMs, state->mqttRetryMs)) {
    return MQTT_EVAL_WAIT_RETRY_DEADLINE;
  }

  if (state->pendingFrameId[0] == '\0' || (lastFrameId && strcmp(state->pendingFrameId, lastFrameId) == 0)) {
    MqttPendingState_Clear(state);
    return MQTT_EVAL_CLEAR_ALREADY_RENDERED;
  }

  if (!wifiOk) {
    state->mqttRetryMs = nowMs + 5000;
    return MQTT_EVAL_RETAIN_WIFI_FAILURE;
  }

  if (!fetchStateOk) {
    state->mqttRetryMs = nowMs + 5000;
    return MQTT_EVAL_RETAIN_STATE_FAILURE;
  }

  if (!serverFrameId || strcmp(serverFrameId, state->pendingFrameId) != 0) {
    MqttPendingState_Clear(state);
    return MQTT_EVAL_CLEAR_STALE_FRAME;
  }

  if (!serverFrameSha256 || strcmp(serverFrameSha256, state->pendingFrameSha256) != 0) {
    MqttPendingState_Clear(state);
    return MQTT_EVAL_CLEAR_SHA_MISMATCH;
  }

  if (fetchAndDisplayOk) {
    MqttPendingState_Clear(state);
    return MQTT_EVAL_SUCCESS_RENDERED;
  } else {
    state->mqttRetryMs = nowMs + 5000;
    return MQTT_EVAL_RETAIN_FETCH_FAILURE;
  }
}

const char *MqttNotificationEvalResult_ToString(MqttNotificationEvalResult result) {
  switch (result) {
    case MQTT_EVAL_NO_PENDING: return "MQTT_EVAL_NO_PENDING";
    case MQTT_EVAL_WAIT_RETRY_DEADLINE: return "MQTT_EVAL_WAIT_RETRY_DEADLINE";
    case MQTT_EVAL_CLEAR_ALREADY_RENDERED: return "MQTT_EVAL_CLEAR_ALREADY_RENDERED";
    case MQTT_EVAL_RETAIN_WIFI_FAILURE: return "MQTT_EVAL_RETAIN_WIFI_FAILURE";
    case MQTT_EVAL_RETAIN_STATE_FAILURE: return "MQTT_EVAL_RETAIN_STATE_FAILURE";
    case MQTT_EVAL_CLEAR_STALE_FRAME: return "MQTT_EVAL_CLEAR_STALE_FRAME";
    case MQTT_EVAL_CLEAR_SHA_MISMATCH: return "MQTT_EVAL_CLEAR_SHA_MISMATCH";
    case MQTT_EVAL_RETAIN_FETCH_FAILURE: return "MQTT_EVAL_RETAIN_FETCH_FAILURE";
    case MQTT_EVAL_SUCCESS_RENDERED: return "MQTT_EVAL_SUCCESS_RENDERED";
    default: return "MQTT_EVAL_UNKNOWN";
  }
}
