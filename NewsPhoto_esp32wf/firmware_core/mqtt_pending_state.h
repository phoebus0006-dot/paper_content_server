#ifndef FIRMWARE_MQTT_PENDING_STATE_H
#define FIRMWARE_MQTT_PENDING_STATE_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  MQTT_EVAL_NO_PENDING = 0,
  MQTT_EVAL_WAIT_RETRY_DEADLINE = 1,
  MQTT_EVAL_CLEAR_ALREADY_RENDERED = 2,
  MQTT_EVAL_RETAIN_WIFI_FAILURE = 3,
  MQTT_EVAL_RETAIN_STATE_FAILURE = 4,
  MQTT_EVAL_CLEAR_STALE_FRAME = 5,
  MQTT_EVAL_CLEAR_SHA_MISMATCH = 6,
  MQTT_EVAL_RETAIN_FETCH_FAILURE = 7,
  MQTT_EVAL_SUCCESS_RENDERED = 8
} MqttNotificationEvalResult;

typedef struct {
  bool publicationPending;
  char pendingFrameId[64];
  char pendingSnapshotId[64];
  char pendingFrameSha256[65];
  uint32_t mqttRetryMs;
} MqttPendingState;

void MqttPendingState_Init(MqttPendingState *state);
void MqttPendingState_Clear(MqttPendingState *state);
bool MqttPendingState_SetPending(MqttPendingState *state, const char *frameId, const char *snapshotId, const char *sha256);

MqttNotificationEvalResult MqttPendingState_Evaluate(
    MqttPendingState *state,
    uint32_t nowMs,
    const char *lastFrameId,
    bool wifiOk,
    bool fetchStateOk,
    const char *serverFrameId,
    const char *serverFrameSha256,
    bool fetchAndDisplayOk
);

const char *MqttNotificationEvalResult_ToString(MqttNotificationEvalResult result);

#ifdef __cplusplus
}
#endif

#endif // FIRMWARE_MQTT_PENDING_STATE_H
