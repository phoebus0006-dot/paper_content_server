'use strict';

/**
 * Characterization test for the current HTTP surface of server.js.
 *
 * These tests capture the *existing* behaviour without modifying any
 * production code.  They use isolated fixtures (no real NAS data).
 *
 * Routes covered:
 *   GET /health/live
 *   GET /health/ready
 *   GET /api/health.json
 *   GET /api/state.json
 *   GET /api/frame.bin?panel=49
 *   GET /api/news.json
 *   GET /api/library.json
 *   GET /api/review.json
 *   GET /
 *   Unknown path → 404
 */

const assert = require('assert');
const http = require('http');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// ── Test infra -----------------------------------------------------------

/** Find a free TCP port on 127.0.0.1 */
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

/** Make a GET request and return { status, headers, body } */
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

/** Build a minimal runtime context with no real NAS dependencies */
function createMinimalRuntime() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'char-test-'));
  fs.writeFileSync(path.join(tmpDir, 'feeds.json'), '[]', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'config.json'), '{}', 'utf8');

  const runtime = {
    serverStartTime: Date.now(),
    DATA_DIR: tmpDir,
    cachedFrames: new Map(),
    pinStore: { get: () => null, pin: () => {}, size: () => 0 },
    publicationService: null,
    snapshotCache: { get: () => null },
    operatingModeService: { getMode: () => 'AUTO' },
    renderCount: 0,
    stateRequestCount: 0,
    frameRequestCount: 0,
    newsRefreshCount: 0,
    newsRefreshFailureCount: 0,
    config: {},
    boot: { apps: [], bootOrder: [], services: {} },
    imageIndex: [],
    libraryState: { currentTheme: null, currentKind: 'shot', patternIndex: 0 },
    imageApproval: null,
    newsTitleService: null,
    deviceRegistryService: null,
    adminStateService: null,
    assetRepository: null,
    assetSelectionService: null,
    overridePersistence: { saveOverride: () => {}, loadOverride: () => null, clearOverride: () => {} },
  };

  return { tmpDir, runtime };
}

// ── Tests -----------------------------------------------------------------

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
  const { handleRequest } = require(serverJs);

  // We'll use createHandler to get an isolated request handler
  const { createHandler } = require(serverJs);

  const { tmpDir, runtime } = createMinimalRuntime();
  const handler = createHandler(runtime);

  // Start a minimal HTTP server
  const port = await findFreePort();
  const httpServer = http.createServer(handler);
  await new Promise((resolve) => httpServer.listen(port, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${port}`;

  try {
    // ── GET /health/live ──────────────────────────────────────────────
    {
      const res = await get(`${base}/health/live`);
      check('/health/live status 200', res.status === 200);
      check('/health/live Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/health/live has status=ok', body.status === 'ok');
      check('/health/live has pid', typeof body.pid === 'number');
      check('/health/live has uptimeSeconds', typeof body.uptimeSeconds === 'number');
    }

    // ── GET /health/ready (no services → not ready) ──────────────────
    {
      const res = await get(`${base}/health/ready`);
      // Without a real boot, readiness evaluator should return not_ready
      check('/health/ready status 503', res.status === 503);
      check('/health/ready Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/health/ready has status field', typeof body.status === 'string');
    }

    // ── GET /api/health.json ──────────────────────────────────────────
    {
      const res = await get(`${base}/api/health.json`);
      check('/api/health.json status', res.status === 503 || res.status === 200);
      check('/api/health.json Content-Type', /application\/json/.test(res.headers['content-type']));
      const body = JSON.parse(res.body.toString());
      check('/api/health.json has status', typeof body.status === 'string');
      check('/api/health.json has uptimeSeconds', 'uptimeSeconds' in body);
    }

    // ── GET /api/state.json (no publicationService → 503) ────────────
    {
      const res = await get(`${base}/api/state.json`);
      check('/api/state.json status (no pub svc)', res.status === 503);
    }

    // ── GET /api/frame.bin?panel=49 (no publicationService → 503) ────
    {
      const res = await get(`${base}/api/frame.bin?panel=49`);
      check('/api/frame.bin status (no pub svc)', res.status === 503);
    }

    // ── GET /api/news.json (no real deps, but should respond) ────────
    {
      const res = await get(`${base}/api/news.json`);
      // With minimal runtime, news building may fail, so we accept 200 or 500
      check('/api/news.json responds', res.status === 200 || res.status === 500);
      if (res.status === 200) {
        check('/api/news.json Content-Type', /application\/json/.test(res.headers['content-type']));
        const body = JSON.parse(res.body.toString());
        check('/api/news.json has items', Array.isArray(body.items));
      }
    }

    // ── GET /api/library.json ─────────────────────────────────────────
    {
      const res = await get(`${base}/api/library.json`);
      check('/api/library.json responds', res.status === 200 || res.status === 500);
      if (res.status === 200) {
        check('/api/library.json Content-Type', /application\/json/.test(res.headers['content-type']));
        const body = JSON.parse(res.body.toString());
        check('/api/library.json has updatedAt', typeof body.updatedAt === 'string');
      }
    }

    // ── GET /api/review.json ──────────────────────────────────────────
    {
      const res = await get(`${base}/api/review.json`);
      check('/api/review.json responds', res.status === 200 || res.status === 500);
      if (res.status === 200) {
        check('/api/review.json Content-Type', /application\/json/.test(res.headers['content-type']));
        const body = JSON.parse(res.body.toString());
        check('/api/review.json has timestamp', typeof body.timestamp === 'string');
        check('/api/review.json has mode', 'mode' in body);
        check('/api/review.json has frameId', 'frameId' in body);
      }
    }

    // ── GET / (index) ─────────────────────────────────────────────────
    {
      const res = await get(`${base}/`);
      check('GET / status 200', res.status === 200);
      check('GET / Content-Type', /text\/html/.test(res.headers['content-type']));
      const html = res.body.toString();
      check('GET / contains title', html.includes('NewsPhoto Content Server'));
    }

    // ── Unknown path ──────────────────────────────────────────────────
    {
      const res = await get(`${base}/this-path-does-not-exist`);
      check('Unknown path returns 404', res.status === 404);
    }

    console.log(`\n=== Characterization: ${pass} passed, ${fail} failed ===`);
  } finally {
    httpServer.close();
    // Cleanup tmp dir
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }

  process.exit(exitCode);
}

run().catch((err) => {
  console.error('Characterization test crashed:', err);
  process.exit(1);
});
