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
  /** Intent phrases that map to this module's ops — used for dynamic tool routing */
  intentSignals?: Record<string, string>;
}

/**
 * Canonical list of engine modules.
 * Order here determines order in generated tool tables.
 */
export const ENGINE_MODULE_MANIFEST: ModuleManifestEntry[] = [
  {
    suffix: 'vault',
    description: 'Knowledge management — search, CRUD, capture, sharing scope.',
    keyOps: ['search_intelligent', 'capture_knowledge', 'capture_quick'],
    intentSignals: {
      'search knowledge': 'search_intelligent',
      'find pattern': 'search_intelligent',
      'best practice': 'search_intelligent',
      'save this': 'capture_knowledge',
      'remember this': 'capture_knowledge',
      'capture this': 'capture_quick',
    },
  },
  {
    suffix: 'plan',
    description: 'Plan lifecycle — create, approve, execute, reconcile, complete, grading.',
    keyOps: ['create_plan', 'approve_plan', 'plan_split', 'plan_reconcile'],
    intentSignals: {
      'plan this': 'create_plan',
      'break this down': 'create_plan',
      'approve the plan': 'approve_plan',
      'split into tasks': 'plan_split',
      'how did it go': 'plan_reconcile',
    },
  },
  {
    suffix: 'brain',
    description: 'Learning system — intelligence pipeline, strengths, feedback, sessions.',
    keyOps: ['recommend', 'strengths', 'feedback'],
    intentSignals: {
      'what works': 'recommend',
      recommendations: 'recommend',
      'pattern strengths': 'strengths',
      'give feedback': 'feedback',
    },
  },
  {
    suffix: 'memory',
    description: 'Session & cross-project memory — capture, search, dedup, promote.',
    keyOps: ['memory_search', 'memory_capture', 'session_capture'],
    intentSignals: {
      'recall past work': 'memory_search',
      'what did we do': 'memory_search',
      'last time': 'memory_search',
      'wrap up session': 'session_capture',
      'summarize session': 'session_capture',
    },
  },
  {
    suffix: 'admin',
    description: 'Infrastructure — health, config, telemetry, tokens, LLM, prompts.',
    keyOps: ['admin_health', 'admin_tool_list', 'admin_diagnostic'],
    intentSignals: {
      'health check': 'admin_health',
      'system status': 'admin_health',
      'what tools exist': 'admin_tool_list',
      'run diagnostics': 'admin_diagnostic',
    },
  },
  {
    suffix: 'curator',
    description: 'Quality — duplicate detection, contradictions, grooming, health audit.',
    keyOps: ['curator_groom', 'curator_status', 'curator_health'],
    intentSignals: {
      'clean up vault': 'curator_groom',
      'find duplicates': 'curator_groom',
      'vault quality': 'curator_status',
      'audit knowledge': 'curator_health',
    },
  },
  {
    suffix: 'loop',
    description: 'Iterative validation loops — start, iterate, cancel, complete, history.',
    keyOps: ['loop_start', 'loop_status', 'loop_cancel'],
    intentSignals: {
      'start a loop': 'loop_start',
      'iterate on this': 'loop_start',
      'loop status': 'loop_status',
      'stop the loop': 'loop_cancel',
    },
  },
  {
    suffix: 'orchestrate',
    description:
      'Execution orchestration — project registration, playbooks, plan/execute/complete.',
    keyOps: ['orchestrate_plan', 'orchestrate_execute', 'orchestrate_complete'],
    intentSignals: {
      'do this task': 'orchestrate_plan',
      'build this': 'orchestrate_plan',
      'execute the plan': 'orchestrate_execute',
      'finish up': 'orchestrate_complete',
    },
  },
  {
    suffix: 'control',
    description: 'Agent behavior — identity, intent routing, morphing, guidelines, governance.',
    keyOps: ['route_intent', 'morph', 'get_behavior_rules'],
    intentSignals: {
      'what should I do': 'route_intent',
      'change persona': 'morph',
      'behavior rules': 'get_behavior_rules',
    },
  },
  {
    suffix: 'context',
    description: 'Context analysis — entity extraction, knowledge retrieval, confidence scoring.',
    keyOps: ['context_extract_entities', 'context_retrieve_knowledge', 'context_analyze'],
    intentSignals: {
      'extract entities': 'context_extract_entities',
      'get context': 'context_retrieve_knowledge',
      'analyze this': 'context_analyze',
    },
  },
  {
    suffix: 'agency',
    description: 'Proactive intelligence — file watching, pattern surfacing, warnings.',
    keyOps: ['agency_scan_file', 'agency_surface_patterns', 'agency_warnings'],
    intentSignals: {
      'scan this file': 'agency_scan_file',
      'surface patterns': 'agency_surface_patterns',
      'any warnings': 'agency_warnings',
    },
  },
  {
    suffix: 'chat',
    description: 'Chat transport — session management, response chunking, authentication.',
    keyOps: ['chat_send', 'chat_history', 'chat_session'],
    intentSignals: {
      'send message': 'chat_send',
      'chat history': 'chat_history',
      'start chat': 'chat_session',
    },
  },
  {
    suffix: 'operator',
    description: 'Operator profile — personality learning, signals, adaptation.',
    keyOps: ['profile_get', 'signal_accumulate', 'synthesis_check'],
    intentSignals: {
      'who am I': 'profile_get',
      'my profile': 'profile_get',
      'learn my style': 'signal_accumulate',
    },
  },
  {
    suffix: 'archive',
    description: 'Archival, lifecycle, and knowledge maintenance.',
    keyOps: ['vault_archive', 'vault_restore', 'vault_optimize', 'knowledge_audit'],
    intentSignals: {
      'archive entries': 'vault_archive',
      'restore archived': 'vault_restore',
      'optimize vault': 'vault_optimize',
      'knowledge audit': 'knowledge_audit',
    },
  },
  {
    suffix: 'sync',
    description: 'Git, Obsidian, and pack sync operations.',
    keyOps: ['vault_git_push', 'vault_git_pull', 'obsidian_sync'],
    intentSignals: {
      'push vault': 'vault_git_push',
      'pull vault': 'vault_git_pull',
      'sync obsidian': 'obsidian_sync',
    },
  },
  {
    suffix: 'review',
    description: 'Knowledge review workflow.',
    keyOps: ['vault_submit_review', 'vault_approve', 'vault_reject'],
    intentSignals: {
      'submit for review': 'vault_submit_review',
      'approve entry': 'vault_approve',
      'reject entry': 'vault_reject',
    },
  },
  {
    suffix: 'intake',
    description: 'Content ingestion — books, URLs, text, batch import.',
    keyOps: ['intake_ingest_book', 'ingest_url', 'ingest_text', 'ingest_batch'],
    intentSignals: {
      'ingest a book': 'intake_ingest_book',
      'import from URL': 'ingest_url',
      'ingest text': 'ingest_text',
      'batch import': 'ingest_batch',
    },
  },
  {
    suffix: 'links',
    description: 'Entry linking — create, traverse, suggest, orphan detection.',
    keyOps: ['link_entries', 'traverse', 'suggest_links', 'get_orphans'],
    intentSignals: {
      'link entries': 'link_entries',
      'explore connections': 'traverse',
      'suggest links': 'suggest_links',
      'find orphans': 'get_orphans',
    },
  },
  {
    suffix: 'branching',
    description: 'Vault branching — create, list, merge, delete branches.',
    keyOps: ['vault_branch', 'vault_branch_list', 'vault_merge_branch'],
    intentSignals: {
      'create branch': 'vault_branch',
      'list branches': 'vault_branch_list',
      'merge branch': 'vault_merge_branch',
    },
  },
  {
    suffix: 'tier',
    description: 'Multi-vault tiers — connect, disconnect, search across sources.',
    keyOps: ['vault_connect_source', 'vault_search_all', 'vault_list_sources'],
    intentSignals: {
      'connect source': 'vault_connect_source',
      'search all vaults': 'vault_search_all',
      'list sources': 'vault_list_sources',
    },
  },
];

/** Core facade ops (always present, not in ENGINE_MODULES) */
export const CORE_KEY_OPS = ['health', 'identity', 'session_start', 'activate'];

/** Engine major version — used for compatibility checks against domain packs. */
export const ENGINE_MAJOR_VERSION = 9;
