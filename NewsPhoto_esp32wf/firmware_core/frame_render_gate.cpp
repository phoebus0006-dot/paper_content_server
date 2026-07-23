#include "frame_render_gate.h"

FrameRenderResult FrameRenderGate_Execute(
    const FrameTransportParams *params,
    const uint8_t *frame,
    size_t frameLen,
    DisplayCallback displayCb,
    void *userData
) {
  FrameRenderResult result;
  result.displayAttempted = false;
  result.displaySuccess = false;
  result.lastFrameUpdated = false;
  result.transportResult = FrameTransport_Evaluate(params);

  if (result.transportResult != FRAME_TRANSPORT_OK) {
    return result;
  }

  if (displayCb && frame && frameLen == 192000) {
    result.displayAttempted = true;
    result.displaySuccess = displayCb(frame, frameLen, userData);
    if (result.displaySuccess) {
      result.lastFrameUpdated = true;
    }
  }

  return result;
}
