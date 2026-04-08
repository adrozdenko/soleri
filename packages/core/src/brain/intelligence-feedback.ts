/**
 * Auto-build intelligence triggers based on feedback and session counts.
 * Extracted from BrainIntelligence to keep the coordinator thin.
 */

import type { PersistenceProvider } from '../persistence/types.js';
import {
  AUTO_BUILD_INTELLIGENCE_EVERY_N_FEEDBACK,
  AUTO_BUILD_INTELLIGENCE_EVERY_N_SESSIONS,
} from './intelligence-constants.js';

/**
 * Track completed sessions and auto-trigger buildIntelligence() every N sessions.
 */
export function maybeAutoBuildAfterSession(
  provider: PersistenceProvider,
  buildIntelligence: () => void,
): void {
  try {
    const row = provider.get<{ value: string }>(
      "SELECT value FROM brain_metadata WHERE key = 'sessions_since_last_build'",
    );
    const current = row ? parseInt(row.value, 10) : 0;
    const next = current + 1;

    if (next >= AUTO_BUILD_INTELLIGENCE_EVERY_N_SESSIONS) {
      buildIntelligence();
      provider.run(
        `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
         VALUES ('sessions_since_last_build', '0', datetime('now'))`,
      );
      // Reset feedback counter too — avoid double-trigger
      provider.run(
        `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
         VALUES ('feedback_since_last_build', '0', datetime('now'))`,
      );
    } else {
      provider.run(
        `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
         VALUES ('sessions_since_last_build', ?, datetime('now'))`,
        [String(next)],
      );
    }
  } catch {
    // Non-critical — don't break session end
  }
}

/**
 * Auto-rebuild intelligence after N feedback entries accumulate.
 * Called from facade after record_feedback / brain_feedback ops.
 */
export function maybeAutoBuildAfterFeedback(
  provider: PersistenceProvider,
  buildIntelligence: () => void,
): void {
  try {
    const row = provider.get<{ value: string }>(
      "SELECT value FROM brain_metadata WHERE key = 'feedback_since_last_build'",
    );
    const current = row ? parseInt(row.value, 10) : 0;
    const next = current + 1;

    if (next >= AUTO_BUILD_INTELLIGENCE_EVERY_N_FEEDBACK) {
      buildIntelligence();
      provider.run(
        `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
         VALUES ('feedback_since_last_build', '0', datetime('now'))`,
      );
      // Reset session counter too — avoid double-trigger
      provider.run(
        `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
         VALUES ('sessions_since_last_build', '0', datetime('now'))`,
      );
    } else {
      provider.run(
        `INSERT OR REPLACE INTO brain_metadata (key, value, updated_at)
         VALUES ('feedback_since_last_build', ?, datetime('now'))`,
        [String(next)],
      );
    }
  } catch {
    // Non-critical — don't block feedback recording
  }
}
