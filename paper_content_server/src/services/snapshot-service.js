'use strict';

/**
 * Snapshot service — encapsulates business logic for snapshot operations.
 *
 * Design principles:
 *   - Does NOT depend on HTTP request/response objects
 *   - Does NOT depend on server.js internals
 *   - Does NOT directly use file system paths
 *   - Depends on SnapshotRepository for all data access
 *
 * Business logic includes:
 *   - ensureActiveSnapshot: override handling (ONE_SHOT, FOCUS_LOCK, LEGACY_ADMIN_OVERRIDE)
 *   - Client key extraction from HTTP request (stateless helper)
 *   - Hex preview generation (stateless helper)
 */

const crypto = require('crypto');

class SnapshotService {
  /**
   * @param {import('../repositories/snapshot-repository').SnapshotRepository} repository
   */
  constructor(repository) {
    this.repo = repository;
  }

  // ── Core business logic ─────────────────────────────────────────────────

  /**
   * Ensure an active snapshot exists for the given time.
   *
   * Handles override modes with expiry checking:
   *   - ONE_SHOT_OVERRIDE: check expiry; if expired, exit override and
   *     fall through to schedule publish; if still active, return current.
   *   - FOCUS_LOCK / LEGACY_ADMIN_OVERRIDE: return current snapshot
   *     unconditionally (persists until explicit DELETE).
   *   - AUTO: delegate to the publication service's active snapshot.
   *
   * @param {Date} now
   * @returns {Promise<object|null>} The active snapshot, or null if unavailable
   */
  async ensureActiveSnapshot(now) {
    if (!this.repo.hasPublicationService()) return null;

    const osMode = this.repo.getOperatingMode();

    if (osMode === 'ONE_SHOT_OVERRIDE') {
      if (this.repo.isOverrideExpired(now)) {
        // Expired — clear override and fall through to schedule
        this.repo.exitOneShot();
        this.repo.clearOverride();
      } else {
        // ONE_SHOT still active — return current, no republish
        return await this.repo.getActiveSnapshot();
      }
    } else if (osMode === 'FOCUS_LOCK' || osMode === 'LEGACY_ADMIN_OVERRIDE') {
      // Persists until explicit DELETE
      return await this.repo.getActiveSnapshot();
    }

    return await this.repo.getActiveSnapshot();
  }

  /**
   * Get the active snapshot without override handling.
   * @returns {Promise<object|null>}
   */
  async getActiveSnapshot() {
    return await this.repo.getActiveSnapshot();
  }

  /**
   * Find a pinned snapshot for a client, checking cache first.
   * @param {string} client
   * @returns {Promise<object|null>}
   */
  async findPinnedSnapshot(client) {
    const pinnedId = this.repo.getPinnedId(client);
    if (!pinnedId) return null;

    // Check cache first
    const cached = this.repo.getCachedSnapshot(pinnedId);
    if (cached) return cached;

    // Fall back to loading from publication service
    return await this.repo.loadSnapshot(pinnedId);
  }

  /**
   * Pin a client to a snapshot ID.
   * @param {string} client
   * @param {string} snapshotId
   */
  pinClient(client, snapshotId) {
    this.repo.pinClient(client, snapshotId);
  }

  /**
   * Get the current operating mode string.
   * @returns {string}
   */
  getOperatingMode() {
    return this.repo.getOperatingMode();
  }

  // ── Stateless helpers ───────────────────────────────────────────────────

  /**
   * Extract a client identifier from an HTTP request.
   * @param {import('http').IncomingMessage} req
   * @returns {string}
   */
  getClientKey(req) {
    return req.socket.remoteAddress || 'unknown';
  }

  /**
   * Generate a hex preview string from a buffer.
   * Delegates to epaperEpf1.hexPreview for consistent output.
   *
   * @param {Buffer} buf
   * @param {number} [bytes=32]
   * @returns {string}
   */
  hexPreview(buf, bytes) {
    // Lazy require to avoid circular/ephemeral dependencies
    const epaperEpf1 = require('../epaper/epf1');
    return epaperEpf1.hexPreview(buf, bytes || 32);
  }

  /**
   * Compute the SHA256 hex digest of a buffer.
   * @param {Buffer} buf
   * @returns {string}
   */
  sha256(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }
}

module.exports = { SnapshotService };
