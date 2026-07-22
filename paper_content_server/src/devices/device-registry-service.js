// src/devices/device-registry-service.js
// Production-grade Device Registry & Heartbeat Service

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var { JsonStore } = require('../infra/json-store');

var DEVICE_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
var ONLINE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
var THROTTLE_WRITE_MS = 30 * 1000; // 30 seconds

var ALLOWED_HEARTBEAT_FIELDS = new Set([
  'firmwareVersion',
  'deviceReportedIp',
  'reportedIp',
  'rssi',
  'battery',
  'currentFrameId',
  'currentFrameSha256',
  'contentMode',
  'capabilities'
]);

var VALID_CONTENT_MODES = new Set(['news', 'photo', 'fallback', 'unknown']);

class AsyncMutex {
  constructor() {
    this._queue = Promise.resolve();
  }
  runExclusive(fn) {
    const res = this._queue.then(() => fn());
    this._queue = res.catch(() => {});
    return res;
  }
}

class DeviceRegistryService {
  constructor(options) {
    options = options || {};
    if (options.jsonStore) {
      this.jsonStore = options.jsonStore;
    } else if (options.filePath) {
      this.jsonStore = new JsonStore(options.filePath, { schemaVersion: 1 });
    } else {
      var dataDir = options.dataDir || path.join(__dirname, '..', '..', 'data');
      this.jsonStore = new JsonStore(path.join(dataDir, 'devices.json'), { schemaVersion: 1 });
    }

    this.clock = options.clock || {
      nowMs: () => Date.now(),
      nowIso: () => new Date().toISOString()
    };
    this.provisioningEnabled = options.provisioningEnabled ?? false;
    this.provisioningToken = options.provisioningToken || null;
    this.consumedProvisioningTokens = new Set();

    this.mutex = new AsyncMutex();
    this.memoryCache = null; // In-memory cache of devices array
    this.lastDiskWriteMs = 0;
    this.dirty = false;
    this.flushIntervalMs = options.flushIntervalMs || THROTTLE_WRITE_MS;
  }

  _getNowMs() {
    if (typeof this.clock.nowMs === 'function') return this.clock.nowMs();
    return Date.now();
  }

  _getNowIso() {
    if (typeof this.clock.nowIso === 'function') return this.clock.nowIso();
    return new Date(this._getNowMs()).toISOString();
  }

  _hashToken(token) {
    if (!token || typeof token !== 'string') return '';
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  _constantTimeCompare(hashA, hashB) {
    if (!hashA || !hashB || typeof hashA !== 'string' || typeof hashB !== 'string') {
      return false;
    }
    const bufA = Buffer.from(hashA, 'hex');
    const bufB = Buffer.from(hashB, 'hex');
    if (bufA.length !== bufB.length || bufA.length === 0) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  }

  _sanitizeDevice(device, nowMs) {
    if (!device) return null;
    const lastSeenMs = device.lastSeenAt ? Date.parse(device.lastSeenAt) : 0;
    const isOnline = !isNaN(lastSeenMs) && (nowMs - lastSeenMs < ONLINE_TIMEOUT_MS);

    const copy = Object.assign({}, device, {
      status: isOnline ? 'online' : 'offline'
    });
    delete copy.credentialHash;
    return copy;
  }

  async _loadRegistry() {
    if (this.memoryCache !== null) {
      return this.memoryCache;
    }

    const filePath = this.jsonStore.filePath;
    if (!fs.existsSync(filePath)) {
      this.memoryCache = [];
      return this.memoryCache;
    }

    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (ioErr) {
      const err = new Error('IO error reading device registry file');
      err.code = 'DEVICE_REGISTRY_IO_ERROR';
      throw err;
    }

    if (!raw || raw.trim() === '') {
      this.memoryCache = [];
      return this.memoryCache;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (jsonErr) {
      // Corrupt JSON handling: copy corrupt file to devices.json.corrupt-<timestamp>
      try {
        const corruptBackup = `${filePath}.corrupt-${Date.now()}`;
        fs.copyFileSync(filePath, corruptBackup);
      } catch (backupErr) {}

      const err = new Error('Device registry file is corrupt');
      err.code = 'DEVICE_REGISTRY_CORRUPT';
      throw err;
    }

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.devices)) {
      const err = new Error('Device registry schema invalid');
      err.code = 'DEVICE_REGISTRY_CORRUPT';
      throw err;
    }

    this.memoryCache = parsed.devices;
    return this.memoryCache;
  }

  async _saveRegistry(force = false) {
    if (!this.dirty && !force) return;

    const nowMs = this._getNowMs();
    if (!force && (nowMs - this.lastDiskWriteMs < this.flushIntervalMs)) {
      return; // Throttled
    }

    const payload = {
      schemaVersion: 1,
      devices: (this.memoryCache || []).map(dev => {
        const copy = Object.assign({}, dev);
        delete copy.status; // Do NOT persist calculated status string to disk!
        return copy;
      })
    };

    try {
      await this.jsonStore.write(payload);
      this.lastDiskWriteMs = nowMs;
      this.dirty = false;
    } catch (err) {
      const ioErr = new Error('Failed to write device registry file: ' + err.message);
      ioErr.code = 'DEVICE_REGISTRY_IO_ERROR';
      throw ioErr;
    }
  }

  async flush() {
    return this.mutex.runExclusive(async () => {
      await this._saveRegistry(true);
    });
  }

  // ── Provisioning & Registration ──────────────────────────────────────────

  async registerDevice(params, options) {
    options = options || {};
    return this.mutex.runExclusive(async () => {
      if (!this.provisioningEnabled) {
        const err = new Error('Device provisioning is disabled');
        err.code = 'PROVISIONING_DISABLED';
        throw err;
      }

      const token = options.provisioningToken || params.provisioningToken;
      if (!token || token !== this.provisioningToken || this.consumedProvisioningTokens.has(token)) {
        const err = new Error('Invalid or consumed provisioning token');
        err.code = 'INVALID_PROVISIONING_TOKEN';
        throw err;
      }

      const deviceId = params.deviceId;
      if (!deviceId || typeof deviceId !== 'string' || !DEVICE_ID_REGEX.test(deviceId)) {
        const err = new Error('Invalid deviceId format');
        err.code = 'INVALID_DEVICE_ID';
        throw err;
      }

      const devices = await this._loadRegistry();
      const existing = devices.find(d => d.deviceId === deviceId);

      // Generate random 256-bit device token
      const deviceToken = crypto.randomBytes(32).toString('hex');
      const credentialHash = this._hashToken(deviceToken);
      const nowIso = this._getNowIso();

      let deviceRecord;
      if (existing) {
        existing.name = params.name || existing.name || deviceId;
        existing.type = params.type || existing.type || 'esp32-epaper';
        existing.firmwareVersion = params.firmwareVersion || existing.firmwareVersion || '1.0.0';
        existing.capabilities = params.capabilities || existing.capabilities || {};
        existing.updatedAt = nowIso;
        existing.credentialHash = credentialHash;
        deviceRecord = existing;
      } else {
        deviceRecord = {
          deviceId: deviceId,
          name: params.name || deviceId,
          type: params.type || 'esp32-epaper',
          firmwareVersion: params.firmwareVersion || '1.0.0',
          observedIp: options.observedIp || null,
          deviceReportedIp: params.deviceReportedIp || params.reportedIp || null,
          rssi: params.rssi ?? null,
          battery: params.battery ?? null,
          lastSeenAt: nowIso,
          createdAt: nowIso,
          updatedAt: nowIso,
          capabilities: params.capabilities || {},
          currentFrameId: null,
          currentFrameSha256: null,
          contentMode: 'unknown',
          credentialHash: credentialHash
        };
        devices.push(deviceRecord);
      }

      this.dirty = true;
      await this._saveRegistry(true); // Immediate write on registration

      return {
        success: true,
        deviceId: deviceId,
        deviceToken: deviceToken // Returned ONLY ONCE upon registration
      };
    });
  }

  // ── Heartbeat ─────────────────────────────────────────────────────────────

  async heartbeat(deviceId, payload, options) {
    options = options || {};
    return this.mutex.runExclusive(async () => {
      if (!deviceId || typeof deviceId !== 'string' || !DEVICE_ID_REGEX.test(deviceId)) {
        const err = new Error('Invalid deviceId format');
        err.code = 'INVALID_DEVICE_ID';
        throw err;
      }

      payload = payload || {};

      // Whitelist validation: reject unknown fields
      for (const key of Object.keys(payload)) {
        if (!ALLOWED_HEARTBEAT_FIELDS.has(key)) {
          const err = new Error(`Unallowed field in heartbeat payload: ${key}`);
          err.code = 'UNALLOWED_FIELD';
          throw err;
        }
      }

      // Detailed field validations
      if (payload.firmwareVersion !== undefined) {
        if (typeof payload.firmwareVersion !== 'string' || payload.firmwareVersion.length === 0 || payload.firmwareVersion.length > 64) {
          const err = new Error('Invalid firmwareVersion');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      const reportedIpVal = payload.deviceReportedIp !== undefined ? payload.deviceReportedIp : payload.reportedIp;
      if (reportedIpVal !== undefined && reportedIpVal !== null) {
        if (typeof reportedIpVal !== 'string' || reportedIpVal.length > 64) {
          const err = new Error('Invalid deviceReportedIp');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      if (payload.rssi !== undefined && payload.rssi !== null) {
        if (!Number.isInteger(payload.rssi) || payload.rssi < -127 || payload.rssi > 0) {
          const err = new Error('Invalid rssi value (must be integer between -127 and 0)');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      if (payload.battery !== undefined && payload.battery !== null) {
        if (typeof payload.battery !== 'number' || payload.battery < 0 || payload.battery > 100) {
          const err = new Error('Invalid battery value (must be number between 0 and 100)');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      if (payload.currentFrameId !== undefined && payload.currentFrameId !== null) {
        if (typeof payload.currentFrameId !== 'string' || payload.currentFrameId.length > 128) {
          const err = new Error('Invalid currentFrameId');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      if (payload.currentFrameSha256 !== undefined && payload.currentFrameSha256 !== null) {
        if (typeof payload.currentFrameSha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(payload.currentFrameSha256)) {
          const err = new Error('Invalid currentFrameSha256 (must be 64 hex characters)');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      if (payload.contentMode !== undefined && payload.contentMode !== null) {
        if (!VALID_CONTENT_MODES.has(payload.contentMode)) {
          const err = new Error('Invalid contentMode');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }
      if (payload.capabilities !== undefined && payload.capabilities !== null) {
        if (typeof payload.capabilities !== 'object' || JSON.stringify(payload.capabilities).length > 4096) {
          const err = new Error('Invalid capabilities (must be object <= 4096 bytes)');
          err.code = 'INVALID_HEARTBEAT_PAYLOAD';
          throw err;
        }
      }

      const devices = await this._loadRegistry();
      const device = devices.find(d => d.deviceId === deviceId);

      if (!device) {
        const err = new Error(`Device ${deviceId} is not registered`);
        err.code = 'DEVICE_NOT_REGISTERED';
        throw err;
      }

      // Device authentication check
      const deviceToken = options.deviceToken || payload.deviceToken;
      const incomingHash = this._hashToken(deviceToken);

      if (!this._constantTimeCompare(incomingHash, device.credentialHash)) {
        const err = new Error('Invalid or missing device token');
        err.code = 'UNAUTHORIZED';
        throw err;
      }

      const nowIso = this._getNowIso();
      const observedIp = options.observedIp || null;

      // Check if critical fields changed
      let criticalChange = false;
      if (payload.firmwareVersion !== undefined && payload.firmwareVersion !== device.firmwareVersion) {
        device.firmwareVersion = payload.firmwareVersion;
        criticalChange = true;
      }
      const newReportedIp = payload.deviceReportedIp !== undefined ? payload.deviceReportedIp : payload.reportedIp;
      if (newReportedIp !== undefined && newReportedIp !== device.deviceReportedIp) {
        device.deviceReportedIp = newReportedIp;
        criticalChange = true;
      }
      if (payload.rssi !== undefined && payload.rssi !== device.rssi) {
        device.rssi = payload.rssi;
        criticalChange = true;
      }
      if (payload.battery !== undefined && payload.battery !== device.battery) {
        device.battery = payload.battery;
        criticalChange = true;
      }
      if (payload.currentFrameId !== undefined && payload.currentFrameId !== device.currentFrameId) {
        device.currentFrameId = payload.currentFrameId;
        criticalChange = true;
      }
      if (payload.currentFrameSha256 !== undefined && payload.currentFrameSha256 !== device.currentFrameSha256) {
        device.currentFrameSha256 = payload.currentFrameSha256;
        criticalChange = true;
      }
      if (payload.contentMode !== undefined && payload.contentMode !== device.contentMode) {
        device.contentMode = payload.contentMode;
        criticalChange = true;
      }
      if (payload.capabilities !== undefined && JSON.stringify(payload.capabilities) !== JSON.stringify(device.capabilities)) {
        device.capabilities = payload.capabilities;
        criticalChange = true;
      }
      if (observedIp && observedIp !== device.observedIp) {
        device.observedIp = observedIp;
        criticalChange = true;
      }

      device.lastSeenAt = nowIso;
      if (criticalChange) {
        device.updatedAt = nowIso;
      }

      this.dirty = true;
      if (criticalChange) {
        await this._saveRegistry(true); // Immediate write on critical field change
      } else {
        await this._saveRegistry(false); // Throttled write for lastSeenAt-only updates
      }

      return this._sanitizeDevice(device, this._getNowMs());
    });
  }

  // ── Queries ───────────────────────────────────────────────────────────────

  async listDevices() {
    return this.mutex.runExclusive(async () => {
      const devices = await this._loadRegistry();
      const nowMs = this._getNowMs();
      return devices.map(d => this._sanitizeDevice(d, nowMs));
    });
  }

  async getDevice(deviceId) {
    if (!deviceId || typeof deviceId !== 'string') return null;
    return this.mutex.runExclusive(async () => {
      const devices = await this._loadRegistry();
      const found = devices.find(d => d.deviceId === deviceId);
      if (!found) return null;
      return this._sanitizeDevice(found, this._getNowMs());
    });
  }
}

module.exports = { DeviceRegistryService };
