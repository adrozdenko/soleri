/**
 * Runtime adapter abstraction — dispatch work to any AI CLI.
 *
 * @module adapters
 */

// Types
export type {
  RuntimeAdapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterTokenUsage,
  AdapterSessionState,
  AdapterSessionCodec,
  AdapterEnvironmentTestResult,
} from './types.js';

// Registry
export { RuntimeAdapterRegistry } from './registry.js';

// Built-in adapters
export { ClaudeCodeRuntimeAdapter } from './claude-code-adapter.js';
