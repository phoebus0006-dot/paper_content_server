#ifndef FIRMWARE_FRAME_RENDER_GATE_H
#define FIRMWARE_FRAME_RENDER_GATE_H

#include "frame_transport_policy.h"

#ifdef __cplusplus
extern "C" {
#endif

typedef bool (*DisplayCallback)(const uint8_t *frame, size_t len, void *userData);

typedef struct {
  bool displayAttempted;
  bool displaySuccess;
  bool lastFrameUpdated;
  FrameTransportResult transportResult;
} FrameRenderResult;

FrameRenderResult FrameRenderGate_Execute(
    const FrameTransportParams *params,
    const uint8_t *frame,
    size_t frameLen,
    DisplayCallback displayCb,
    void *userData
);

#ifdef __cplusplus
}
#endif

#endif // FIRMWARE_FRAME_RENDER_GATE_H
