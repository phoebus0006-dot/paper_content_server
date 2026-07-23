#include "frame_transport_policy.h"

// Note on terminal body evaluation policy (R3-04):
// Content-Length == 192010 is the primary protocol contract.
// Cumulative bytes read must exactly match (10-byte header + 192000-byte payload).
// streamHasExtraBytes (stream->available() > 0) is evaluated as a secondary diagnostic check
// after payload read to detect buffered extra data.

FrameTransportResult FrameTransport_Evaluate(const FrameTransportParams *params) {
  if (!params) return FRAME_TRANSPORT_CONTENT_LENGTH_MISSING;

  if (params->contentLength <= 0) {
    return FRAME_TRANSPORT_CONTENT_LENGTH_MISSING;
  }

  if (params->contentLength != 192010) {
    return FRAME_TRANSPORT_CONTENT_LENGTH_MISMATCH;
  }

  if (params->headerBytesRead != 10) {
    return FRAME_TRANSPORT_HEADER_READ_FAILED;
  }

  const uint8_t *h = params->header;
  if (h[0] != 'E' || h[1] != 'P' || h[2] != 'F' || h[3] != '1') {
    return FRAME_TRANSPORT_MAGIC_MISMATCH;
  }

  uint16_t width = (uint16_t)h[4] | ((uint16_t)h[5] << 8);
  uint16_t height = (uint16_t)h[6] | ((uint16_t)h[7] << 8);
  uint8_t panelIndex = h[8];
  uint8_t version = h[9];

  if (version != 1) {
    return FRAME_TRANSPORT_VERSION_UNSUPPORTED;
  }

  if (width != 800 || height != 480 || panelIndex != 49) {
    return FRAME_TRANSPORT_HEADER_MISMATCH;
  }

  if (params->payloadBytesRead != 192000) {
    return FRAME_TRANSPORT_PAYLOAD_READ_FAILED;
  }

  if (params->streamHasExtraBytes) {
    return FRAME_TRANSPORT_EXTRA_TRAILING_BYTES;
  }

  if (!params->shaMatched) {
    return FRAME_TRANSPORT_SHA_MISMATCH;
  }

  if (!params->displayOk) {
    return FRAME_TRANSPORT_DISPLAY_FAILED;
  }

  return FRAME_TRANSPORT_OK;
}

const char *FrameTransportResult_ToString(FrameTransportResult result) {
  switch (result) {
    case FRAME_TRANSPORT_OK: return "FRAME_TRANSPORT_OK";
    case FRAME_TRANSPORT_CONTENT_LENGTH_MISSING: return "FRAME_TRANSPORT_CONTENT_LENGTH_MISSING";
    case FRAME_TRANSPORT_CONTENT_LENGTH_MISMATCH: return "FRAME_TRANSPORT_CONTENT_LENGTH_MISMATCH";
    case FRAME_TRANSPORT_HEADER_READ_FAILED: return "FRAME_TRANSPORT_HEADER_READ_FAILED";
    case FRAME_TRANSPORT_MAGIC_MISMATCH: return "FRAME_TRANSPORT_MAGIC_MISMATCH";
    case FRAME_TRANSPORT_VERSION_UNSUPPORTED: return "FRAME_TRANSPORT_VERSION_UNSUPPORTED";
    case FRAME_TRANSPORT_HEADER_MISMATCH: return "FRAME_TRANSPORT_HEADER_MISMATCH";
    case FRAME_TRANSPORT_PAYLOAD_READ_FAILED: return "FRAME_TRANSPORT_PAYLOAD_READ_FAILED";
    case FRAME_TRANSPORT_EXTRA_TRAILING_BYTES: return "FRAME_TRANSPORT_EXTRA_TRAILING_BYTES";
    case FRAME_TRANSPORT_SHA_MISMATCH: return "FRAME_TRANSPORT_SHA_MISMATCH";
    case FRAME_TRANSPORT_DISPLAY_FAILED: return "FRAME_TRANSPORT_DISPLAY_FAILED";
    default: return "FRAME_TRANSPORT_UNKNOWN";
  }
}
