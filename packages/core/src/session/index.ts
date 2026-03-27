// ─── Session Compaction ─────────────────────────────────────────────
export type {
  CompactionPolicy,
  CompactionResult,
  SessionState,
  HandoffNote,
} from './compaction-policy.js';
export { ENGINE_DEFAULTS } from './compaction-policy.js';

export { shouldCompact, parseDuration } from './compaction-evaluator.js';
export { resolvePolicy } from './policy-resolver.js';
export { renderHandoff } from './handoff-renderer.js';
