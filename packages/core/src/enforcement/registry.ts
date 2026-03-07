/**
 * Enforcement registry — manages rules and adapters.
 */

import type {
  EnforcementConfig,
  EnforcementRule,
  HostAdapter,
  HostAdapterResult,
} from './types.js';

export class EnforcementRegistry {
  private rules: EnforcementRule[] = [];
  private adapters = new Map<string, HostAdapter>();

  addRule(rule: EnforcementRule): void {
    // Replace if same ID exists
    this.rules = this.rules.filter((r) => r.id !== rule.id);
    this.rules.push(rule);
  }

  addRules(rules: EnforcementRule[]): void {
    for (const rule of rules) {
      this.addRule(rule);
    }
  }

  removeRule(id: string): boolean {
    const before = this.rules.length;
    this.rules = this.rules.filter((r) => r.id !== id);
    return this.rules.length < before;
  }

  getRule(id: string): EnforcementRule | undefined {
    return this.rules.find((r) => r.id === id);
  }

  getRules(): EnforcementRule[] {
    return [...this.rules];
  }

  getEnabledRules(): EnforcementRule[] {
    return this.rules.filter((r) => r.enabled !== false);
  }

  getConfig(): EnforcementConfig {
    return { rules: this.getEnabledRules() };
  }

  registerAdapter(adapter: HostAdapter): void {
    this.adapters.set(adapter.host, adapter);
  }

  getAdapter(host: string): HostAdapter | undefined {
    return this.adapters.get(host);
  }

  listAdapters(): string[] {
    return [...this.adapters.keys()];
  }

  /** Translate rules for a specific host */
  translate(host: string): HostAdapterResult {
    const adapter = this.adapters.get(host);
    if (!adapter) {
      return {
        host,
        files: [],
        skipped: this.getEnabledRules().map((r) => ({
          ruleId: r.id,
          reason: `No adapter registered for host: ${host}`,
        })),
      };
    }
    return adapter.translate(this.getConfig());
  }

  /** Translate rules for all registered adapters */
  translateAll(): HostAdapterResult[] {
    return [...this.adapters.keys()].map((host) => this.translate(host));
  }
}
