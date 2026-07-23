#ifndef FIRMWARE_FRAME_TRANSPORT_POLICY_H
#ifndef FIRMWARE_FRAME_TRANSPORT_POLICY_H
#define FIRMWARE_FRAME_TRANSPORT_POLICY_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef enum {
  FRAME_TRANSPORT_OK = 0,
  FRAME_TRANSPORT_CONTENT_LENGTH_MISSING = 1,
  FRAME_TRANSPORT_CONTENT_LENGTH_MISMATCH = 2,
  FRAME_TRANSPORT_HEADER_READ_FAILED = 3,
  FRAME_TRANSPORT_MAGIC_MISMATCH = 4,
  FRAME_TRANSPORT_VERSION_UNSUPPORTED = 5,
  FRAME_TRANSPORT_HEADER_MISMATCH = 6,
  FRAME_TRANSPORT_PAYLOAD_READ_FAILED = 7,
  FRAME_TRANSPORT_EXTRA_TRAILING_BYTES = 8,
  FRAME_TRANSPORT_SHA_MISMATCH = 9,
  FRAME_TRANSPORT_DISPLAY_FAILED = 10
} FrameTransportResult;

typedef struct {
  int contentLength;
  size_t headerBytesRead;
  uint8_t header[10];
  size_t payloadBytesRead;
  bool streamHasExtraBytes;
  bool shaMatched;
  bool displayOk;
} FrameTransportParams;

FrameTransportResult FrameTransport_Evaluate(const FrameTransportParams *params);
const char *FrameTransportResult_ToString(FrameTransportResult result);

#ifdef __cplusplus
}
#endif

#endif // FIRMWARE_FRAME_TRANSPORT_POLICY_H
