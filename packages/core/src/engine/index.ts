/**
 * Soleri Knowledge Engine — MCP Server Entry Point
 *
 * This is the standalone knowledge engine that file-tree agents connect to.
 * It reads agent.yaml, initializes the runtime, and registers all tools.
 *
 * Usage:
 *   npx @soleri/engine --agent ./agent.yaml
 *
 * Or in .mcp.json:
 *   { "command": "npx", "args": ["@soleri/engine", "--agent", "./agent.yaml"] }
 *
 * Binary entry point: ./bin/soleri-engine.ts
 */

export { registerEngine } from './register-engine.js';
export type { EngineRegistrationOptions, EngineRegistrationResult } from './register-engine.js';
export { createCoreOps } from './core-ops.js';
export type { AgentIdentityConfig } from './core-ops.js';
export { ENGINE_MODULE_MANIFEST, CORE_KEY_OPS } from './module-manifest.js';
export type { ModuleManifestEntry } from './module-manifest.js';
