/**
 * OpenCode host adapter — translates enforcement rules to OpenCode plugin config.
 *
 * Maps:
 * - pre-tool-use → tool.execute.before
 * - post-tool-use → tool.execute.after
 * - pre-compact → session.compacted
 * - session-start → session.created
 *
 * Unsupported: pre-commit, on-save (no OpenCode hook equivalents).
 */

import type {
  EnforcementConfig,
  EnforcementTrigger,
  HostAdapter,
  HostAdapterResult,
} from '../types.js';

const TRIGGER_TO_EVENT: Partial<Record<EnforcementTrigger, string>> = {
  'pre-tool-use': 'tool.execute.before',
  'post-tool-use': 'tool.execute.after',
  'pre-compact': 'session.compacted',
  'session-start': 'session.created',
};

interface HookHandler {
  event: string;
  ruleId: string;
  pattern?: string;
  action: string;
  message: string;
}

export class OpenCodeAdapter implements HostAdapter {
  readonly host = 'opencode';

  supports(trigger: EnforcementTrigger): boolean {
    return trigger in TRIGGER_TO_EVENT;
  }

  translate(config: EnforcementConfig): HostAdapterResult {
    const handlers: HookHandler[] = [];
    const skipped: Array<{ ruleId: string; reason: string }> = [];

    for (const rule of config.rules) {
      if (!this.supports(rule.trigger)) {
        skipped.push({
          ruleId: rule.id,
          reason: `Trigger '${rule.trigger}' not supported by OpenCode`,
        });
        continue;
      }

      const event = TRIGGER_TO_EVENT[rule.trigger];
      if (!event) {
        skipped.push({
          ruleId: rule.id,
          reason: `No event mapping for '${rule.trigger}'`,
        });
        continue;
      }

      handlers.push({
        event,
        ruleId: rule.id,
        pattern: rule.pattern,
        action: rule.action,
        message: rule.message,
      });
    }

    const files: Array<{ path: string; content: string }> = [];

    if (handlers.length > 0) {
      files.push({
        path: '.opencode/plugins/soleri-enforcement.ts',
        content: this.generatePluginFile(handlers),
      });
    }

    return { host: this.host, files, skipped };
  }

  private generatePluginFile(handlers: HookHandler[]): string {
    // Group handlers by event
    const byEvent = new Map<string, HookHandler[]>();
    for (const h of handlers) {
      const existing = byEvent.get(h.event) ?? [];
      existing.push(h);
      byEvent.set(h.event, existing);
    }

    const hookEntries: string[] = [];

    for (const [event, eventHandlers] of Array.from(byEvent.entries())) {
      const checks = eventHandlers.map((h) => this.generateCheck(h)).join('\n');
      hookEntries.push(`  '${event}': (ctx) => {\n${checks}\n  }`);
    }

    const lines = [
      '/**',
      ' * Soleri enforcement plugin for OpenCode.',
      ' * Auto-generated — do not edit manually.',
      ' */',
      '',
      'export default {',
      '  hooks: {',
      hookEntries.join(',\n'),
      '  },',
      '};',
      '',
    ];

    return lines.join('\n');
  }

  private generateCheck(handler: HookHandler): string {
    const indent = '    ';

    if (!handler.pattern) {
      // No pattern — always fires
      return this.generateActionCode(indent, handler.ruleId, handler.action, handler.message);
    }

    // Pattern-based check
    const lines = [
      `${indent}// Rule: ${handler.ruleId}`,
      `${indent}if (/${handler.pattern}/.test(JSON.stringify(ctx.input ?? ''))) {`,
      this.generateActionCode(`${indent}  `, handler.ruleId, handler.action, handler.message),
      `${indent}}`,
    ];
    return lines.join('\n');
  }

  private generateActionCode(
    indent: string,
    ruleId: string,
    action: string,
    message: string,
  ): string {
    switch (action) {
      case 'block':
        return `${indent}throw new Error('[${ruleId}] BLOCKED: ${message}');`;
      case 'warn':
        return `${indent}console.warn('[${ruleId}] WARNING: ${message}');`;
      case 'suggest':
        return `${indent}console.info('[${ruleId}] SUGGESTION: ${message}');`;
      default:
        return `${indent}console.warn('[${ruleId}] ${message}');`;
    }
  }
}
