/**
 * OpsRegistry — live catalogue of every op registered with the MCP server.
 *
 * Populated during `registerEngine()` as each facade's ops are iterated.
 * Read by `admin_tool_list scope:'all'` to return ground truth — not a
 * hand-curated manifest, not an internal injection — the actual live set.
 *
 * This is the bulletproof source of truth. If an op is wired into a facade,
 * it's in the registry. If it's in the registry, it's callable via MCP.
 *
 * Replaces the previous "ENGINE_MODULE_MANIFEST as source of truth" model
 * which diverged silently from the real engine surface (77 key-ops shown
 * vs. 150+ actually registered).
 */

export interface RegisteredOp {
  /** Op name, e.g. 'admin_health', 'vault_search_intelligent' */
  name: string;
  /** Human-readable description from the OpDefinition */
  description: string;
  /** Auth level: 'read' | 'write' | 'admin' */
  auth: string;
  /** Facade that owns this op, e.g. 'vault', 'brain' (no agent prefix) */
  facade: string;
  /** MCP tool name, e.g. 'ernesto_vault' (with agent prefix) */
  toolName: string;
  /** 'user' (default) or 'internal' (hidden from MCP tool descriptions) */
  visibility: 'user' | 'internal';
}

export interface OpsRegistryListOptions {
  /** Include ops marked as internal. Default: false. */
  includeInternal?: boolean;
}

/**
 * Map-backed registry of registered ops. Populated during registerEngine();
 * read by admin_tool_list and other introspection ops.
 *
 * Not thread-safe — intended for single-process MCP server lifecycle where
 * registration happens at boot before request handling begins.
 */
export class OpsRegistry {
  private ops = new Map<string, RegisteredOp>();
  private facades = new Set<string>();

  /**
   * Register one op. Overwrites by name if already present (idempotent).
   */
  add(
    toolName: string,
    facade: string,
    op: {
      name: string;
      description?: string;
      auth: string;
      visibility?: 'user' | 'internal';
    },
  ): void {
    this.ops.set(op.name, {
      name: op.name,
      description: op.description ?? '',
      auth: op.auth,
      facade,
      toolName,
      visibility: op.visibility ?? 'user',
    });
    this.facades.add(facade);
  }

  /**
   * Register an entire batch of ops for one tool/facade at once.
   */
  addAll(
    toolName: string,
    facade: string,
    ops: Array<{
      name: string;
      description?: string;
      auth: string;
      visibility?: 'user' | 'internal';
    }>,
  ): void {
    for (const op of ops) this.add(toolName, facade, op);
  }

  /**
   * Look up a single op by name. Returns undefined if not registered.
   */
  get(opName: string): RegisteredOp | undefined {
    return this.ops.get(opName);
  }

  /**
   * List every registered op. Excludes internal ops by default.
   */
  list(options: OpsRegistryListOptions = {}): RegisteredOp[] {
    const all = Array.from(this.ops.values());
    return options.includeInternal ? all : all.filter((o) => o.visibility !== 'internal');
  }

  /**
   * Group ops by facade suffix. Excludes internal ops by default.
   * Returns entries sorted by facade name for deterministic output.
   */
  byFacade(options: OpsRegistryListOptions = {}): Record<string, string[]> {
    const result: Record<string, string[]> = {};
    for (const op of this.list(options)) {
      if (!result[op.facade]) result[op.facade] = [];
      result[op.facade].push(op.name);
    }
    // Sort op names within each facade for deterministic output
    for (const facade of Object.keys(result)) {
      result[facade].sort();
    }
    return result;
  }

  /**
   * List facade suffixes in sorted order.
   */
  facadeList(): string[] {
    return Array.from(this.facades).sort();
  }

  /**
   * Count of registered ops. Excludes internal by default.
   */
  count(options: OpsRegistryListOptions = {}): number {
    return this.list(options).length;
  }

  /**
   * Count of distinct facades.
   */
  facadeCount(): number {
    return this.facades.size;
  }

  /**
   * Check if an op is registered.
   */
  has(opName: string): boolean {
    return this.ops.has(opName);
  }

  /**
   * Clear all registered ops. Useful for testing.
   */
  clear(): void {
    this.ops.clear();
    this.facades.clear();
  }
}
