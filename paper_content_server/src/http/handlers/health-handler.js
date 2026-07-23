'use strict';

/**
 * P0 read-only health route handlers.
 *
 *   GET /health/live    — lightweight liveness probe
 *   GET /health/ready   — readiness probe (delegates to readiness-evaluator)
 *   GET /api/health.json — comprehensive health / status payload
 */

const path = require('path');
const fs = require('fs');
const { sendJson } = require('../response');

const evaluateReadiness = require('../../app/readiness-evaluator').evaluateReadiness;

/**
 * GET /health/live
 */
function handleHealthLive(req, res, ctx) {
  const R = ctx.R;
  sendJson(res, 200, {
    status: 'ok',
    pid: process.pid,
    uptimeSeconds: Math.floor((Date.now() - (R.serverStartTime || Date.now())) / 1000),
  });
}

/**
 * GET /health/ready
 */
function handleHealthReady(req, res, ctx) {
  const R = ctx.R;
  const readiness = evaluateReadiness(R, R.boot);
  if (!readiness.isReady) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ status: 'not_ready', issues: readiness.issues }, null, 2));
    return;
  }
  sendJson(res, 200, { status: 'ready', issues: [] });
}

/**
 * GET /api/health.json
 */
function handleHealthJson(req, res, ctx) {
  const R = ctx.R;
  const dataDir = (R && R.DATA_DIR) || ctx.DATA_DIR || 'data';
  const tz = (R && R.TIMEZONE) || ctx.TIMEZONE || 'UTC';
  const appConfig = ctx.APP_CONFIG || {};
  const buildSha = ctx.BUILD_GIT_SHA || null;

  const readiness = evaluateReadiness(R, R.boot);
  const uptime = Math.floor((Date.now() - (R.serverStartTime || Date.now())) / 1000);

  let hSnap = null;
  if (R.cachedFrames && R.cachedFrames.size > 0) {
    hSnap = Array.from(R.cachedFrames.values())[0].snapshot;
  }

  let hNewsCount = 0;
  try {
    const hLgPath = (R && R.LAST_GOOD_NEWS_FILE) || path.join(dataDir, 'last_good_news.json');
    if (fs.existsSync(hLgPath)) {
      const hLg = JSON.parse(fs.readFileSync(hLgPath, 'utf8'));
      if (hLg && hLg.items) hNewsCount = hLg.items.length;
    }
  } catch (e) { /* ignore */ }

  let hPhotoCount = 0;
  try {
    const hIdxPath = (R && R.IMAGE_INDEX_FILE) || path.join(dataDir, 'image_index.json');
    if (fs.existsSync(hIdxPath)) {
      hPhotoCount = JSON.parse(fs.readFileSync(hIdxPath, 'utf8')).length;
    }
  } catch (e) { /* ignore */ }

  var healthPayload = {
    status: readiness.isReady ? 'ok' : 'not_ready',
    readinessStatus: readiness.status,
    issues: readiness.issues,
    uptimeSeconds: uptime,
    timezone: tz,
    currentMode: hSnap ? hSnap.mode : null,
    currentSlot: hSnap ? hSnap.slotKey : null,
    frameId: hSnap ? hSnap.frameId : null,
    frameCacheEntries: R.cachedFrames ? R.cachedFrames.size : 0,
    frameRenderCount: R.renderCount || 0,
    newsItemCount: hNewsCount,
    photoCount: hPhotoCount,
    mqttEnabled: !!(appConfig.mqtt && appConfig.mqtt.enabled),
    translationProvider: (appConfig.translation && appConfig.translation.provider) || 'none',
    stateRequestCount: R.stateRequestCount || 0,
    frameRequestCount: R.frameRequestCount || 0,
    newsRefreshCount: R.newsRefreshCount || 0,
    newsRefreshFailureCount: R.newsRefreshFailureCount || 0,
    recentError: R.recentError || null,
    lastNewsRefreshAt: R.lastNewsRefreshAt || null,
    buildSha: buildSha,
    manualOverride: R.manualOverride || null,
    overrideExpiresAt: R.overrideExpiresAt || null,
    lastPublishedAt: R.lastPublishedAt || null,
  };

  if (!readiness.isReady) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(healthPayload, null, 2));
    return;
  }

  sendJson(res, 200, healthPayload);
}

module.exports = { handleHealthLive, handleHealthReady, handleHealthJson };
