#ifndef FIRMWARE_MQTT_PENDING_STATE_H
#define FIRMWARE_MQTT_PENDING_STATE_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  MQTT_DECISION_ATTEMPT = 0,
  MQTT_DECISION_NO_PENDING = 1,
  MQTT_DECISION_WAIT_RETRY = 2,
  MQTT_DECISION_CLEAR_ALREADY_RENDERED = 3,
  MQTT_DECISION_CLEAR_STALE_FRAME = 4,
  MQTT_DECISION_CLEAR_SHA_MISMATCH = 5
} MqttPendingDecision;

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

MqttPendingDecision MqttPendingState_CanAttempt(
    const MqttPendingState *state,
    uint32_t nowMs,
    const char *lastFrameId
);

void MqttPendingState_OnTemporaryFailure(
    MqttPendingState *state,
    uint32_t nowMs
);

MqttPendingDecision MqttPendingState_OnServerState(
    MqttPendingState *state,
    const char *serverFrameId,
    const char *serverSha
);

void MqttPendingState_OnSuccess(
    MqttPendingState *state
);

const char *MqttPendingDecision_ToString(MqttPendingDecision decision);

#ifdef __cplusplus
}
#endif

#endif // FIRMWARE_MQTT_PENDING_STATE_H
