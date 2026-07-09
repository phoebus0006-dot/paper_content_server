// NewsPhoto_esp32wf configuration template.
// Copy to config.h and fill in your values before uploading.
// config.h is gitignored — it will NOT be committed.
#ifndef NEWSPHOTO_CONFIG_EXAMPLE_H
#define NEWSPHOTO_CONFIG_EXAMPLE_H

#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASS "YOUR_WIFI_PASSWORD"

// Replace with your content server LAN IP and port.
#define CONTENT_BASE_URL "http://YOUR_SERVER_IP:8787"

// Current working HAT wiring:
// BUSY=7, RST=8, DC=9, CS=10, DIN/MOSI=11, SCLK=13
#define PANEL_INDEX 49

#define HTTP_TIMEOUT_MS 20000UL
#define REFRESH_INTERVAL_MS 60000UL

// Keep the official Waveshare 7.3E driver and use the direct-HAT pinout.
#define EPD_DIRECT_COLOR_TEST 0
#define EPD_IGNORE_BUSY 0
#define EPD_USE_HARDWARE_SPI 0

#endif
