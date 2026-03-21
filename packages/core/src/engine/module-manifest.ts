/**
 * Soleri Engine Module Manifest
 *
 * Single source of truth for engine module names, descriptions, and key ops.
 * Used by register-engine.ts at runtime and by @soleri/forge for template generation.
 *
 * This file is intentionally dependency-free so it can be imported by any package.
 */

export interface ModuleManifestEntry {
  /** Suffix for tool name: {agentId}_{suffix} */
  suffix: string;
  /** Human-readable description */
  description: string;
  /** Representative ops shown in placeholder tables (max 4) */
  keyOps: string[];
  /** If true, module requires a runtime condition to register */
  conditional?: boolean;
}

/**
 * Canonical list of engine modules.
 * Order here determines order in generated tool tables.
 */
export const ENGINE_MODULE_MANIFEST: ModuleManifestEntry[] = [
  {
    suffix: 'vault',
    description: 'Knowledge management — search, CRUD, import/export, intake, archival.',
    keyOps: ['search_intelligent', 'capture_knowledge', 'capture_quick'],
  },
  {
    suffix: 'plan',
    description: 'Plan lifecycle — create, approve, execute, reconcile, complete, grading.',
    keyOps: ['create_plan', 'approve_plan', 'plan_split', 'plan_reconcile'],
  },
  {
    suffix: 'brain',
    description: 'Learning system — intelligence pipeline, strengths, feedback, sessions.',
    keyOps: ['recommend', 'strengths', 'feedback'],
  },
  {
    suffix: 'memory',
    description: 'Session & cross-project memory — capture, search, dedup, promote.',
    keyOps: ['memory_search', 'memory_capture', 'session_capture'],
  },
  {
    suffix: 'admin',
    description: 'Infrastructure — health, config, telemetry, tokens, LLM, prompts.',
    keyOps: ['admin_health', 'admin_tool_list', 'admin_diagnostic'],
  },
  {
    suffix: 'curator',
    description: 'Quality — duplicate detection, contradictions, grooming, health audit.',
    keyOps: ['curator_groom', 'curator_status', 'curator_health'],
  },
  {
    suffix: 'loop',
    description: 'Iterative validation loops — start, iterate, cancel, complete, history.',
    keyOps: ['loop_start', 'loop_status', 'loop_cancel'],
  },
  {
    suffix: 'orchestrate',
    description:
      'Execution orchestration — project registration, playbooks, plan/execute/complete.',
    keyOps: ['orchestrate_plan', 'orchestrate_execute', 'orchestrate_complete'],
  },
  {
    suffix: 'control',
    description: 'Agent behavior — identity, intent routing, morphing, guidelines, governance.',
    keyOps: ['route_intent', 'morph', 'get_behavior_rules'],
  },
  {
    suffix: 'context',
    description: 'Context analysis — entity extraction, knowledge retrieval, confidence scoring.',
    keyOps: ['context_extract_entities', 'context_retrieve_knowledge', 'context_analyze'],
  },
  {
    suffix: 'agency',
    description: 'Proactive intelligence — file watching, pattern surfacing, warnings.',
    keyOps: ['agency_scan_file', 'agency_surface_patterns', 'agency_warnings'],
  },
  {
    suffix: 'chat',
    description: 'Chat transport — session management, response chunking, authentication.',
    keyOps: ['chat_send', 'chat_history', 'chat_session'],
  },
];

/** Core facade ops (always present, not in ENGINE_MODULES) */
export const CORE_KEY_OPS = ['health', 'identity', 'session_start', 'activate'];

/** Engine major version — used for compatibility checks against domain packs. */
export const ENGINE_MAJOR_VERSION = 9;
