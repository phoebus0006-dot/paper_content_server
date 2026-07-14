#line 1 "D:\\dev\\NewsPhoto_esp32wf\\config.h"
// NewsPhoto_esp32wf configuration — staging compile.
// config.h is gitignored — it will NOT be committed.
#ifndef NEWSPHOTO_CONFIG_H
#define NEWSPHOTO_CONFIG_H

#define WIFI_SSID "PLACEHOLDER_SSID"
#define WIFI_PASS "PLACEHOLDER_PASS"

// Staging server for testing
#define CONTENT_BASE_URL "http://192.168.1.49:18080"

#define MQTT_ENABLED "false"
#define MQTT_BROKER "192.168.1.49"
#define MQTT_DEVICE_ID "epaper-staging-01"

#define PANEL_INDEX 49

#define HTTP_TIMEOUT_MS 20000UL
#define REFRESH_INTERVAL_MS 60000UL

#define EPD_DIRECT_COLOR_TEST 0
#define EPD_IGNORE_BUSY 0
#define EPD_USE_HARDWARE_SPI 0

#endif
