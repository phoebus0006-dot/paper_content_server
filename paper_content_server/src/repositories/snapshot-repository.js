'use strict';

/**
 * Snapshot repository — encapsulates data access for snapshot-related operations.
 *
 * Design principles:
 *   - Does NOT depend on HTTP request/response objects
 *   - Does NOT depend on server.js internals
 *   - Does NOT directly use file system paths
 *   - Does NOT format HTTP responses
 *
 * All data access goes through the runtime context (R) provided at construction.
 */

class SnapshotRepository {
  /**
   * @param {object} runtime - The application runtime context (R)
   */
  constructor(runtime) {
    this.R = runtime;
  }

  // ── Service availability ───────────────────────────────────────────────

  /** @returns {boolean} */
  hasPublicationService() {
    return !!this.R.publicationService;
  }

  // ── Active snapshot (schedule-based) ────────────────────────────────────

  /**
   * Get the currently active (published) snapshot.
   * @returns {Promise<object|null>}
   */
  async getActiveSnapshot() {
    if (!this.R.publicationService) return null;
    return await this.R.publicationService.getActive();
  }

  /**
   * Load a specific snapshot by ID.
   * @param {string} id
   * @returns {Promise<object|null>}
   */
  async loadSnapshot(id) {
    if (!this.R.publicationService || !id) return null;
    return await this.R.publicationService.loadSnapshot(id);
  }

  // ── Pin store (client pinning) ──────────────────────────────────────────

  /**
   * Get the snapshot ID pinned for a client.
   * @param {string} client
   * @returns {string|null}
   */
  getPinnedId(client) {
    if (!this.R.pinStore) return null;
    return this.R.pinStore.get(client) || null;
  }

  /**
   * Pin a client to a snapshot.
   * @param {string} client
   * @param {string} snapshotId
   */
  pinClient(client, snapshotId) {
    if (this.R.pinStore && snapshotId) {
      this.R.pinStore.pin(client, snapshotId);
    }
  }

  // ── Snapshot cache ──────────────────────────────────────────────────────

  /**
   * Get a snapshot from the in-memory cache.
   * @param {string} id
   * @returns {object|null}
   */
  getCachedSnapshot(id) {
    if (!this.R.snapshotCache || !id) return null;
    return this.R.snapshotCache.get(id) || null;
  }

  // ── Operating mode ──────────────────────────────────────────────────────

  /** @returns {string} */
  getOperatingMode() {
    return this.R.operatingModeService ? this.R.operatingModeService.getMode() : 'AUTO';
  }

  /**
   * Check whether the current ONE_SHOT override has expired.
   * @param {Date} now
   * @returns {boolean}
   */
  isOverrideExpired(now) {
    return this.R.operatingModeService ? this.R.operatingModeService.checkExpiry(now) : false;
  }

  /** Exit ONE_SHOT mode. */
  exitOneShot() {
    if (this.R.operatingModeService) {
      this.R.operatingModeService.exitOneShot();
    }
  }

  /** Clear persisted override state. */
  clearOverride() {
    if (this.R.overridePersistence) {
      try { this.R.overridePersistence.clearOverride(); } catch (e) { /* ignore */ }
    }
  }
}

module.exports = { SnapshotRepository };
