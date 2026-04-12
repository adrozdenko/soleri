import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface FlagDefinition {
  description: string;
  defaultValue: boolean;
}

/** Built-in flags with defaults */
const BUILT_IN_FLAGS: Record<string, FlagDefinition> = {
  'auth-enforcement': {
    description: 'Enforce auth levels in facade dispatch',
    defaultValue: false,
  },
  'hot-reload': { description: 'Enable hot reload of vault and config', defaultValue: true },
  'search-feedback': {
    description: 'Record search feedback for brain learning',
    defaultValue: true,
  },
  telemetry: { description: 'Collect op-level telemetry metrics', defaultValue: true },
  'agency-mode': { description: 'Enable proactive agent behavior', defaultValue: false },
  'embedding-enabled': {
    description: 'Enable vector embedding provider for hybrid search',
    defaultValue: false,
  },
};

export class FeatureFlags {
  private flags: Map<string, boolean> = new Map();
  private readonly filePath: string | null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;

    // 1. Apply defaults
    for (const [name, def] of Object.entries(BUILT_IN_FLAGS)) {
      this.flags.set(name, def.defaultValue);
    }

    // 2. Load from file (if exists)
    if (this.filePath && existsSync(this.filePath)) {
      try {
        const data = JSON.parse(readFileSync(this.filePath, 'utf-8'));
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'boolean') {
            this.flags.set(key, value);
          }
        }
      } catch {
        // Corrupt file — use defaults
      }
    }

    // 3. Environment variable overrides: SOLERI_FLAG_AUTH_ENFORCEMENT=true
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('SOLERI_FLAG_')) {
        const flagName = key.slice('SOLERI_FLAG_'.length).toLowerCase().replace(/_/g, '-');
        this.flags.set(flagName, value === 'true' || value === '1');
      }
    }
  }

  isEnabled(flag: string): boolean {
    return this.flags.get(flag) ?? false;
  }

  set(flag: string, enabled: boolean): void {
    this.flags.set(flag, enabled);
    this.persist();
  }

  getAll(): Record<string, { enabled: boolean; description: string; source: string }> {
    const result: Record<string, { enabled: boolean; description: string; source: string }> = {};
    for (const [name, enabled] of this.flags) {
      const builtIn = BUILT_IN_FLAGS[name];
      const envKey = `SOLERI_FLAG_${name.replace(/-/g, '_').toUpperCase()}`;
      const hasEnv = process.env[envKey] !== undefined;
      result[name] = {
        enabled,
        description: builtIn?.description ?? 'Custom flag',
        source: hasEnv ? 'env' : builtIn ? 'default' : 'runtime',
      };
    }
    return result;
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      const dir = dirname(this.filePath);
      mkdirSync(dir, { recursive: true });
      const obj: Record<string, boolean> = {};
      for (const [k, v] of this.flags) {
        obj[k] = v;
      }
      writeFileSync(this.filePath, JSON.stringify(obj, null, 2) + '\n');
    } catch {
      // Non-critical — flags still work in-memory
    }
  }
}
