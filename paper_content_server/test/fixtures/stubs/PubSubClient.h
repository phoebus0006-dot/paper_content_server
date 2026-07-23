/*
 * ============================================================================
 * TEST FIXTURE ONLY — DO NOT USE FOR PRODUCTION ARDUINO / ESP32 BUILDS
 * ============================================================================
 * This file is a stub implementation of PubSubClient intended EXCLUSIVELY
 * for local unit/mock tests. It MUST NOT be placed in any Arduino library
 * search path (such as /libraries or ~/Arduino/libraries) or included in
 * production firmware builds.
 *
 * Official Production Library: knolleary/PubSubClient @ 2.8.0
 * Arduino Library Manager ID: 89
 * Repository: https://github.com/knolleary/pubsubclient
 * ============================================================================
 */
#ifndef PUBSUBCLIENT_STUB_FIXTURE_H
#define PUBSUBCLIENT_STUB_FIXTURE_H

#include <Arduino.h>
#include <Client.h>

class PubSubClient {
private:
  Client *_client;
  const char *_server;
  uint16_t _port;
  bool _connected;
  int _state;
public:
  typedef void (*callback_t)(char*, uint8_t*, unsigned int);
  PubSubClient(Client &client) : _client(&client), _server(nullptr), _port(0), _connected(false), _state(-4) {}
  boolean connect(const char *id) { _connected = true; _state = 0; return true; }
  boolean connected() { return _connected; }
  int state() { return _state; }
  boolean subscribe(const char *topic) { (void)topic; return true; }
  boolean unsubscribe(const char *topic) { (void)topic; return true; }
  boolean publish(const char *topic, const char *payload) { (void)topic; (void)payload; return true; }
  boolean publish(const char *topic, const uint8_t *payload, unsigned int length) { (void)topic; (void)payload; (void)length; return true; }
  void setServer(const char *server, uint16_t port) { _server = server; _port = port; }
  void setCallback(callback_t cb) { (void)cb; }
  boolean loop() { return true; }
  void disconnect() { _connected = false; _state = -4; }
};

#endif // PUBSUBCLIENT_STUB_FIXTURE_H
