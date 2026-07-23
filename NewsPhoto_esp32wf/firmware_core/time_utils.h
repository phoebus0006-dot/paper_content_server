#ifndef FIRMWARE_TIME_UTILS_H
#define FIRMWARE_TIME_UTILS_H

#include <stdint.h>
#include <stdbool.h>

#ifdef __cplusplus
extern "C" {
#endif

// Wrap-safe deadline evaluation: returns true if (nowMs - deadlineMs) >= 0 in 32-bit signed arithmetic
static inline bool isTimeReached(uint32_t nowMs, uint32_t deadlineMs) {
  return (int32_t)(nowMs - deadlineMs) >= 0;
}

#ifdef __cplusplus
}
#endif

#endif // FIRMWARE_TIME_UTILS_H
