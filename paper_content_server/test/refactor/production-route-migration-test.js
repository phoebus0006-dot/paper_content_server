'use strict';

/**
 * Production route migration test — Phase A2.
 *
 * Verifies that P0 read-only routes work correctly after being
 * migrated from the monolithic handleRequest to the route registry.
 *
 * Routes validated:
 *   GET /health/live       → 200
 *   GET /health/ready      → 200 (with mocked readiness)
 *   GET /api/health.json   → 200 (with mocked readiness)
 *   GET /api/state.json    → 200 (with mocked publicationService)
 *   GET /api/frame.bin     → 200, frame length 192010, EPF1 header, SHA consistent
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// ── EPF1 constants ─────────────────────────────────────────────────────────
const EPF1_MAGIC = 'EPF1';
const EPF1_HEADER_LENGTH = 10;
const EPF1_PAYLOAD_LENGTH = 192000;
const EPF1_FRAME_LENGTH = 192010;
const EPF1_WIDTH = 800;
const EPF1_HEIGHT = 480;
const EPF1_PANEL_CODE = 49;
const EPF1_VERSION = 1;

// ── Helpers ───────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = require('net').createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Build a full EPF1 frame buffer (192010 bytes) */
function buildEpf1Frame() {
  const header = Buffer.alloc(EPF1_HEADER_LENGTH);
  header.write(EPF1_MAGIC, 0, 4, 'ascii');
  header.writeUInt16LE(EPF1_WIDTH, 4);
  header.writeUInt16LE(EPF1_HEIGHT, 6);
  header.writeUInt8(EPF1_PANEL_CODE, 8);
  header.writeUInt8(EPF1_VERSION, 9);

  const payload = Buffer.alloc(EPF1_PAYLOAD_LENGTH, 0x11);
  return Buffer.concat([header, payload]);
}

/** Build a minimal mock snapshot */
function buildMockSnapshot(frame, frameId) {
  const sha = crypto.createHash('sha256').update(frame).digest('hex');
  return {
    snapshotId: 'mock-snap-' + frameId,
    frameId: frameId,
    frame: frame,
    frameSha256: sha,
    frameLength: frame.length,
    mode: 'photo',
    payload: {
      slotKey: 'mock-slot',
    },
  };
}

/** Build a publicationService mock */
function buildMockPublicationService(snapshot) {
  const snap = snapshot;
  return {
    getActive: () => Promise.resolve(snap),
    loadSnapshot: (id) => Promise.resolve(snap),
    publish: () => Promise.resolve(snap),
  };
}

/** Build a minimal runtime with mocked services */
function buildMockRuntime() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migration-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}', 'utf8');

  const frame = buildEpf1Frame();
  const snapshot = buildMockSnapshot(frame, 'photo:test-slot');

  // Re-test: state.json and frame.bin must agree on SHA
  const frameSha256 = crypto.createHash('sha256').update(frame).digest('hex');

  return {
    tmpDir,
    frame,
    snapshot,
    frameSha256,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────

async function run() {
  let pass = 0;
  let fail = 0;
  let exitCode = 0;

  function check(name, ok, detail) {
    if (ok) {
      console.log('PASS ' + name + (detail ? ': ' + detail : ''));
      pass++;
    } else {
      console.log('FAIL ' + name + (detail ? ': ' + detail : ''));
      fail++;
      exitCode = 1;
    }
  }

  const serverJs = path.join(__dirname, '..', '..', 'server.js');
  const { createHandler } = require(serverJs);

  const { tmpDir, frame, snapshot, frameSha256 } = buildMockRuntime();

  const pinStore = {
    _pins: new Map(),
    get: (k) => pinStore._pins.get(k) || null,
    pin: (k, v) => { pinStore._pins.set(k, v); },
    size: () => pinStore._pins.size,
  };

  const snapshotCache = {
    _store: new Map(),
    get: (id) => snapshotCache._store.get(id) || null,
    set: (id, v) => snapshotCache._store.set(id, v),
  };
  snapshotCache.set('mock-snap-photo:test-slot', snapshot);

  const runtime = {
    serverStartTime: Date.now(),
    cachedFrames: new Map(),
    pinStore,
    publicationService: buildMockPublicationService(snapshot),
    snapshotCache,
    operatingModeService: {
      getMode: () => 'AUTO',
      checkExpiry: () => false,
      exitOneShot: () => {},
    },
    overridePersistence: {
      saveOverride: () => {},
      loadOverride: () => null,
      clearOverride: () => {},
    },
    renderCount: 0,
    stateRequestCount: 0,
    frameRequestCount: 0,
    newsRefreshCount: 0,
    newsRefreshFailureCount: 0,
    boot: {
      apps: [],
      bootOrder: [],
      services: {},
      getState: () => 'ready',
    },
    config: {},
    DATA_DIR: tmpDir,
    TIMEZONE: 'UTC',
    imageIndex: [],
    libraryState: { currentTheme: null, currentKind: 'shot', patternIndex: 0 },
    snapshotStore: {},
    deviceRegistryService: {},
    feeds: [{ name: 'mock-feed', url: 'http://mock', enabled: true }],
  };

  const handler = createHandler(runtime);

  const port = await findFreePort();
  const httpServer = http.createServer(handler);
  await new Promise((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${port}`;

  try {
    // ── 1. GET /health/live ─────────────────────────────────────────────
    {
      const res = await get(`${base}/health/live`);
      check('/health/live status 200', res.status === 200);
      check('/health/live Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/health/live status=ok', body.status === 'ok');
      check('/health/live has pid', typeof body.pid === 'number');
      check('/health/live has uptimeSeconds', typeof body.uptimeSeconds === 'number');
    }

    // ── 2. GET /health/ready (should succeed with mocked boot) ──────────
    {
      const res = await get(`${base}/health/ready`);
      check('/health/ready status 200', res.status === 200);
      check('/health/ready Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/health/ready status=ready', body.status === 'ready');
    }

    // ── 3. GET /api/health.json ─────────────────────────────────────────
    {
      const res = await get(`${base}/api/health.json`);
      check('/api/health.json status 200', res.status === 200);
      check('/api/health.json Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/api/health.json has status', typeof body.status === 'string');
      check('/api/health.json has uptimeSeconds', typeof body.uptimeSeconds === 'number');
      check('/api/health.json has stateRequestCount', 'stateRequestCount' in body);
      check('/api/health.json has frameRequestCount', 'frameRequestCount' in body);
    }

    // ── 4. GET /api/state.json ──────────────────────────────────────────
    {
      const res = await get(`${base}/api/state.json`);
      check('/api/state.json status 200', res.status === 200);
      check('/api/state.json Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/api/state.json has snapshotId', typeof body.snapshotId === 'string');
      check('/api/state.json has frameUrl', typeof body.frameUrl === 'string');
      check('/api/state.json has operatingMode', typeof body.operatingMode === 'string');
      check('/api/state.json frameSha256 matches',
        body.frameSha256 === frameSha256, `expected ${frameSha256}, got ${body.frameSha256}`);
      check('/api/state.json frameLength correct', body.frameLength === EPF1_FRAME_LENGTH);
    }

    // ── 5. GET /api/frame.bin ───────────────────────────────────────────
    {
      const res = await get(`${base}/api/frame.bin`);
      check('/api/frame.bin status 200', res.status === 200);
      check('/api/frame.bin Content-Type application/octet-stream',
        /application\/octet-stream/.test(res.headers['content-type']));

      // Frame length
      check('/api/frame.bin Content-Length ' + EPF1_FRAME_LENGTH,
        res.body.length === EPF1_FRAME_LENGTH);

      // EPF1 magic header
      const magic = res.body.toString('ascii', 0, 4);
      check('/api/frame.bin EPF1 magic', magic === EPF1_MAGIC, `got "${magic}"`);

      // X-Frame-Id header
      check('/api/frame.bin has X-Frame-Id', typeof res.headers['x-frame-id'] === 'string');

      // SHA256 consistency check: SHA returned in header matches actual frame SHA
      if (res.headers['x-frame-sha256']) {
        const actualSha = crypto.createHash('sha256').update(res.body).digest('hex');
        check('/api/frame.bin X-Frame-Sha256 correct',
          res.headers['x-frame-sha256'] === actualSha);
      }

      // state.json frameSha256 matches frame.bin SHA
      const stateRes = await get(`${base}/api/state.json`);
      const stateBody = JSON.parse(stateRes.body.toString());
      const frameActualSha = crypto.createHash('sha256').update(res.body).digest('hex');
      check('/api/state.json + /api/frame.bin SHA agreement',
        stateBody.frameSha256 === frameActualSha);
    }

    console.log(`\n=== production-route-migration: ${pass} passed, ${fail} failed ===`);
  } finally {
    httpServer.close();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }

  process.exit(exitCode);
}

run().catch((err) => {
  console.error('Migration test crashed:', err);
  process.exit(1);
});
