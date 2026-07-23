'use strict';

/**
 * Service boundary test — Phase A3.
 *
 * Validates that the new service/repository layer:
 *   1. Does NOT depend on HTTP request/response objects
 *   2. Does NOT depend on server.js internals
 *   3. Frame SHA remains consistent with original behaviour
 *   4. State JSON structure remains consistent
 *   5. Business logic (ensureActiveSnapshot) works correctly
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Constants ─────────────────────────────────────────────────────────────

const EPF1_FRAME_LENGTH = 192010;

// ── Helpers ───────────────────────────────────────────────────────────────

function buildEpf1Frame() {
  const EPF1_HEADER_LENGTH = 10;
  const EPF1_PAYLOAD_LENGTH = 192000;
  const header = Buffer.alloc(EPF1_HEADER_LENGTH);
  header.write('EPF1', 0, 4, 'ascii');
  header.writeUInt16LE(800, 4);
  header.writeUInt16LE(480, 6);
  header.writeUInt8(49, 8);
  header.writeUInt8(1, 9);
  const payload = Buffer.alloc(EPF1_PAYLOAD_LENGTH, 0x11);
  return Buffer.concat([header, payload]);
}

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
      imageDescription: 'A test image',
    },
  };
}

function buildMockPublicationService(snapshot) {
  return {
    getActive: function () { return Promise.resolve(snapshot); },
    loadSnapshot: function (id) { return Promise.resolve(snapshot || null); },
    publish: function () { return Promise.resolve(snapshot); },
  };
}

function buildMockRuntime(snapshot) {
  return {
    publicationService: snapshot ? buildMockPublicationService(snapshot) : null,
    pinStore: {
      _pins: new Map(),
      get: function (k) { return this._pins.get(k) || null; },
      pin: function (k, v) { this._pins.set(k, v); },
      size: function () { return this._pins.size; },
    },
    snapshotCache: {
      _store: new Map(),
      get: function (id) { return this._store.get(id) || null; },
      set: function (id, v) { this._store.set(id, v); },
    },
    operatingModeService: {
      getMode: function () { return 'AUTO'; },
      checkExpiry: function () { return false; },
      exitOneShot: function () {},
    },
    overridePersistence: {
      saveOverride: function () {},
      loadOverride: function () { return null; },
      clearOverride: function () {},
    },
  };
}

let pass = 0;
let fail = 0;
let exitCode = 0;

function check(name, ok) {
  if (ok) {
    console.log('PASS ' + name);
    pass++;
  } else {
    console.log('FAIL ' + name);
    fail++;
    exitCode = 1;
  }
}

// ── Load modules under test ────────────────────────────────────────────────

const { SnapshotRepository } = require('../../src/repositories/snapshot-repository');
const { SnapshotService } = require('../../src/services/snapshot-service');

// ── Main test runner ───────────────────────────────────────────────────────

async function main() {
  // ═════════════════════════════════════════════════════════════════════
  // 1. Dependency boundary checks
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── Service/Repository dependency boundaries ──\n');

  const srcRoot = path.join(__dirname, '..', '..', 'src');

  // Check services/ directory
  const servicesDir = path.join(srcRoot, 'services');
  if (fs.existsSync(servicesDir)) {
    const serviceFiles = fs.readdirSync(servicesDir).filter(function (f) { return f.endsWith('.js'); });
    for (let i = 0; i < serviceFiles.length; i++) {
      const content = fs.readFileSync(path.join(servicesDir, serviceFiles[i]), 'utf8');
      const rel = path.join('src/services', serviceFiles[i]);

      check(rel + ': must not depend on src/http/',
        !/require\(['"]\.\.\/http\//.test(content));
      check(rel + ': must not require server.js',
        !/require\(['"](\.\.\/)*server['"]\)/.test(content));
      check(rel + ': must not call res.* methods directly',
        !/\bres\.(writeHead|end|setHeader)\b/.test(content));
    }
  }

  // Check repositories/ directory
  const reposDir = path.join(srcRoot, 'repositories');
  if (fs.existsSync(reposDir)) {
    const repoFiles = fs.readdirSync(reposDir).filter(function (f) { return f.endsWith('.js'); });
    for (let i = 0; i < repoFiles.length; i++) {
      const content = fs.readFileSync(path.join(reposDir, repoFiles[i]), 'utf8');
      const rel = path.join('src/repositories', repoFiles[i]);

      check(rel + ': must not require server.js',
        !/require\(['"](\.\.\/)*server['"]\)/.test(content));
      check(rel + ': must not depend on src/http/',
        !/require\(['"]\.\.\/http\//.test(content));
      check(rel + ': must not call res.* methods directly',
        !/\bres\.(writeHead|end|setHeader)\b/.test(content));
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 2. Synchronous helper tests
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── Synchronous helpers ──\n');

  const frame = buildEpf1Frame();
  const snapshot = buildMockSnapshot(frame, 'photo:test-slot');
  const frameSha256 = crypto.createHash('sha256').update(frame).digest('hex');

  const runtime = buildMockRuntime(snapshot);
  const repo = new SnapshotRepository(runtime);
  const service = new SnapshotService(repo);

  // hasPublicationService
  check('repo.hasPublicationService() === true', repo.hasPublicationService() === true);

  // hexPreview — returns space-separated hex bytes
  const preview = service.hexPreview(frame, 4);
  check('hexPreview returns string', typeof preview === 'string');
  check('hexPreview is non-empty', preview.length > 0);
  // First byte 'E' = 0x45
  check('hexPreview starts with 45',
    preview.indexOf('45') === 0);

  // sha256
  const sha = service.sha256(frame);
  check('sha256 returns 64-char hex', /^[a-f0-9]{64}$/.test(sha));
  check('sha256 matches expected', sha === frameSha256);

  // getClientKey
  check('getClientKey returns remoteAddress',
    service.getClientKey({ socket: { remoteAddress: '127.0.0.1' } }) === '127.0.0.1');
  check('getClientKey fallback to unknown',
    service.getClientKey({ socket: {} }) === 'unknown');

  // getOperatingMode
  check('getOperatingMode returns AUTO', service.getOperatingMode() === 'AUTO');

  // ═════════════════════════════════════════════════════════════════════
  // 3. Async service behaviour tests
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── Async service behaviour ──\n');

  // 3a. ensureActiveSnapshot with publication service
  {
    const snap = await service.ensureActiveSnapshot(new Date());
    check('ensureActiveSnapshot returns snapshot', snap !== null);
    if (snap) {
      check('snapshot.snapshotId matches', snap.snapshotId === 'mock-snap-photo:test-slot');
      check('snapshot.frameSha256 matches', snap.frameSha256 === frameSha256);
      check('snapshot.frameLength matches', snap.frameLength === EPF1_FRAME_LENGTH);
    }
  }

  // 3b. ensureActiveSnapshot without publication service
  {
    const runtime2 = buildMockRuntime(null);
    runtime2.publicationService = null;
    const repo2 = new SnapshotRepository(runtime2);
    const service2 = new SnapshotService(repo2);
    check('no pub svc: hasPublicationService() === false',
      repo2.hasPublicationService() === false);
    const snap = await service2.ensureActiveSnapshot(new Date());
    check('no pub svc: ensureActiveSnapshot returns null', snap === null);
  }

  // 3c. pinClient + findPinnedSnapshot
  {
    const snap = snapshot;
    service.pinClient('192.168.1.1', snap.snapshotId);
    const found = await service.findPinnedSnapshot('192.168.1.1');
    check('findPinnedSnapshot returns snapshot after pin', found !== null);
    if (found) {
      check('findPinnedSnapshot snapshotId matches', found.snapshotId === snap.snapshotId);
    }
    const notFound = await service.findPinnedSnapshot('no-such-client');
    check('findPinnedSnapshot returns null for unknown client', notFound === null);
  }

  // 3d. findPinnedSnapshot with cache miss — load from publication service
  {
    runtime.snapshotCache._store.clear();
    runtime.pinStore._pins.set('cached-client', snapshot.snapshotId);
    const found = await service.findPinnedSnapshot('cached-client');
    check('findPinnedSnapshot loads from pub svc on cache miss', found !== null);
    if (found) {
      check('findPinnedSnapshot loaded snapshotId matches',
        found.snapshotId === snapshot.snapshotId);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // 4. ONE_SHOT override handling
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── ONE_SHOT override handling ──\n');

  // 4a. ONE_SHOT not expired — returns current, no exit/clear
  {
    let exitCalled = false;
    let clearCalled = false;

    const ro = buildMockRuntime(snapshot);
    ro.operatingModeService = {
      getMode: function () { return 'ONE_SHOT_OVERRIDE'; },
      checkExpiry: function () { return false; },
      exitOneShot: function () { exitCalled = true; },
    };
    ro.overridePersistence = {
      saveOverride: function () {},
      loadOverride: function () { return null; },
      clearOverride: function () { clearCalled = true; },
    };

    const svc = new SnapshotService(new SnapshotRepository(ro));
    const snap = await svc.ensureActiveSnapshot(new Date());
    check('ONE_SHOT not expired: returns snapshot', snap !== null);
    check('ONE_SHOT not expired: exitOneShot NOT called', !exitCalled);
    check('ONE_SHOT not expired: clearOverride NOT called', !clearCalled);
  }

  // 4b. ONE_SHOT expired — exit + clear, then returns snapshot
  {
    let exitCalled = false;
    let clearCalled = false;

    const ro = buildMockRuntime(snapshot);
    ro.operatingModeService = {
      getMode: function () { return 'ONE_SHOT_OVERRIDE'; },
      checkExpiry: function () { return true; },
      exitOneShot: function () { exitCalled = true; },
    };
    ro.overridePersistence = {
      saveOverride: function () {},
      loadOverride: function () { return null; },
      clearOverride: function () { clearCalled = true; },
    };

    const svc = new SnapshotService(new SnapshotRepository(ro));
    const snap = await svc.ensureActiveSnapshot(new Date());
    check('ONE_SHOT expired: returns snapshot', snap !== null);
    check('ONE_SHOT expired: exitOneShot called', exitCalled);
    check('ONE_SHOT expired: clearOverride called', clearCalled);
  }

  // 4c. FOCUS_LOCK — returns snapshot unconditionally
  {
    const ro = buildMockRuntime(snapshot);
    ro.operatingModeService = {
      getMode: function () { return 'FOCUS_LOCK'; },
      exitOneShot: function () {},
    };

    const svc = new SnapshotService(new SnapshotRepository(ro));
    const snap = await svc.ensureActiveSnapshot(new Date());
    check('FOCUS_LOCK: returns snapshot', snap !== null);
  }

  // 4d. LEGACY_ADMIN_OVERRIDE — returns snapshot unconditionally
  {
    const ro = buildMockRuntime(snapshot);
    ro.operatingModeService = {
      getMode: function () { return 'LEGACY_ADMIN_OVERRIDE'; },
      exitOneShot: function () {},
    };

    const svc = new SnapshotService(new SnapshotRepository(ro));
    const snap = await svc.ensureActiveSnapshot(new Date());
    check('LEGACY_ADMIN_OVERRIDE: returns snapshot', snap !== null);
  }

  // ═════════════════════════════════════════════════════════════════════
  // 5. State JSON shape consistency
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n── State JSON shape ──\n');

  {
    const activeSnap = await service.ensureActiveSnapshot(new Date());
    check('state: ensureActiveSnapshot works', activeSnap !== null);
    if (activeSnap) {
      const body = {
        ...activeSnap.payload,
        snapshotId: activeSnap.snapshotId,
        panelIndex: 49,
        operatingMode: service.getOperatingMode(),
        frameUrl: 'http://localhost/api/frame.bin?panel=49',
        frameSha256: activeSnap.frameSha256,
        frameLength: activeSnap.frameLength,
      };

      var expectedKeys = [
        'slotKey', 'imageDescription',
        'snapshotId', 'panelIndex', 'operatingMode',
        'frameUrl', 'frameSha256', 'frameLength',
      ];
      for (var i = 0; i < expectedKeys.length; i++) {
        check('state body has key: ' + expectedKeys[i],
          expectedKeys[i] in body);
      }

      check('state.operatingMode === AUTO', body.operatingMode === 'AUTO');
      check('state.frameSha256 is 64-char hex', /^[a-f0-9]{64}$/.test(body.frameSha256));
      check('state.frameLength === ' + EPF1_FRAME_LENGTH, body.frameLength === EPF1_FRAME_LENGTH);
    }
  }

  // ═════════════════════════════════════════════════════════════════════
  // Summary
  // ═════════════════════════════════════════════════════════════════════
  console.log('\n=== service-boundary: ' + pass + ' passed, ' + fail + ' failed ===');
  process.exit(exitCode);
}

main().catch(function (err) {
  console.error('service-boundary test crashed:', err);
  process.exit(1);
});
