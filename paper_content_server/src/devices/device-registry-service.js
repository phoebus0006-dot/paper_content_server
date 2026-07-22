// device-registry-service.js — E-Paper Device Management Service
// Manages device metadata, heartbeat status, and online/offline calculation

var { JsonStore } = require('../infra/json-store');
var path = require('path');

var ONLINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function DeviceRegistryService(options) {
  options = options || {};
  var jsonStore;
  if (options.jsonStore) {
    jsonStore = options.jsonStore;
  } else if (options.filePath) {
    jsonStore = new JsonStore(options.filePath, { schemaVersion: 1 });
  } else {
    var dataDir = options.dataDir || path.join(__dirname, '..', '..', 'data');
    jsonStore = new JsonStore(path.join(dataDir, 'devices.json'), { schemaVersion: 1 });
  }

  var clock = options.clock || { nowMs: function() { return Date.now(); } };

  function _getNowMs() {
    if (typeof clock.nowMs === 'function') return clock.nowMs();
    if (typeof clock.now === 'function') return clock.now();
    return Date.now();
  }

  function _calculateStatus(lastSeenIso) {
    if (!lastSeenIso) return 'offline';
    var lastSeenMs = new Date(lastSeenIso).getTime();
    if (isNaN(lastSeenMs)) return 'offline';
    var nowMs = _getNowMs();
    return (nowMs - lastSeenMs < ONLINE_TIMEOUT_MS) ? 'online' : 'offline';
  }

  function _readData() {
    return jsonStore.readOrDefault({ schemaVersion: 1, devices: [] });
  }

  function _writeData(data) {
    data.schemaVersion = 1;
    return jsonStore.write(data);
  }

  function listDevices() {
    return _readData().then(function(data) {
      var devices = Array.isArray(data.devices) ? data.devices : [];
      return devices.map(function(dev) {
        return Object.assign({}, dev, {
          status: _calculateStatus(dev.lastSeen)
        });
      });
    });
  }

  function getDevice(deviceId) {
    if (!deviceId) return Promise.resolve(null);
    return listDevices().then(function(devices) {
      var found = devices.find(function(d) { return d.deviceId === deviceId; });
      return found || null;
    });
  }

  function heartbeat(deviceId, payload) {
    if (!deviceId || typeof deviceId !== 'string') {
      return Promise.reject(new Error('deviceId is required'));
    }
    payload = payload || {};

    return _readData().then(function(data) {
      if (!Array.isArray(data.devices)) data.devices = [];

      var nowIso = new Date(_getNowMs()).toISOString();
      var existingIndex = data.devices.findIndex(function(d) { return d.deviceId === deviceId; });

      var firmware = payload.firmwareVersion || payload.firmware || '';
      var ip = payload.ip || payload.ipAddress || '';
      var currentFrame = payload.currentFrame !== undefined ? payload.currentFrame : '';
      var contentMode = payload.contentMode !== undefined ? payload.contentMode : '';
      var rssi = payload.rssi !== undefined ? payload.rssi : null;
      var battery = payload.battery !== undefined ? payload.battery : null;

      var updatedDevice;

      if (existingIndex >= 0) {
        var existing = data.devices[existingIndex];
        updatedDevice = Object.assign({}, existing, {
          deviceId: deviceId,
          name: payload.name || existing.name || ('Device ' + deviceId),
          type: payload.type || existing.type || 'esp32-epaper',
          firmware: firmware || existing.firmware || '',
          ip: ip || existing.ip || '',
          lastSeen: nowIso,
          status: 'online',
          capabilities: payload.capabilities || existing.capabilities || {},
          currentFrame: currentFrame !== '' ? currentFrame : (existing.currentFrame || ''),
          contentMode: contentMode !== '' ? contentMode : (existing.contentMode || ''),
          rssi: rssi !== null ? rssi : (existing.rssi !== undefined ? existing.rssi : null),
          battery: battery !== null ? battery : (existing.battery !== undefined ? existing.battery : null)
        });
        data.devices[existingIndex] = updatedDevice;
      } else {
        updatedDevice = {
          deviceId: deviceId,
          name: payload.name || ('Device ' + deviceId),
          type: payload.type || 'esp32-epaper',
          firmware: firmware,
          ip: ip,
          lastSeen: nowIso,
          status: 'online',
          capabilities: payload.capabilities || {},
          currentFrame: currentFrame,
          contentMode: contentMode,
          rssi: rssi,
          battery: battery
        };
        data.devices.push(updatedDevice);
      }

      return _writeData(data).then(function() {
        return updatedDevice;
      });
    });
  }

  function registerDevice(deviceData) {
    if (!deviceData || !deviceData.deviceId) {
      return Promise.reject(new Error('deviceId is required for registration'));
    }
    return heartbeat(deviceData.deviceId, deviceData);
  }

  return {
    listDevices: listDevices,
    getDevice: getDevice,
    heartbeat: heartbeat,
    registerDevice: registerDevice,
    _calculateStatus: _calculateStatus
  };
}

module.exports = { DeviceRegistryService: DeviceRegistryService, ONLINE_TIMEOUT_MS: ONLINE_TIMEOUT_MS };
