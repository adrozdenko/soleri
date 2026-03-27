/**
 * Subagent runtime engine — spawn, manage, and aggregate results
 * from child agent processes.
 *
 * @module subagent
 */

// Types
export type {
  SubagentTask,
  SubagentStatus,
  SubagentResult,
  DispatchOptions,
  AggregatedResult,
  ClaimInfo,
  WorktreeInfo,
  TrackedProcess,
} from './types.js';

// Components
export { TaskCheckout } from './task-checkout.js';
export { WorkspaceResolver } from './workspace-resolver.js';
export { ConcurrencyManager } from './concurrency-manager.js';
export { OrphanReaper } from './orphan-reaper.js';
export { aggregate as aggregateResults } from './result-aggregator.js';

// Dispatcher
export { SubagentDispatcher } from './dispatcher.js';
