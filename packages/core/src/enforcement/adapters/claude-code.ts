/**
 * Claude Code host adapter — translates enforcement rules to Claude Code hooks.
 *
 * Maps:
 * - pre-tool-use → PreToolUse hooks in settings.json
 * - pre-commit → UserPromptSubmit hook checking git commit
 * - pre-compact → PreCompact hook
 * - session-start → SessionStart hook
 */

import type {
  EnforcementConfig,
  EnforcementTrigger,
  HostAdapter,
  HostAdapterResult,
} from '../types.js';

const TRIGGER_TO_EVENT: Partial<Record<EnforcementTrigger, string>> = {
  'pre-tool-use': 'PreToolUse',
  'post-tool-use': 'PostToolUse',
  'pre-compact': 'PreCompact',
  'session-start': 'SessionStart',
};

export class ClaudeCodeAdapter implements HostAdapter {
  readonly host = 'claude-code';

  supports(trigger: EnforcementTrigger): boolean {
    return trigger in TRIGGER_TO_EVENT || trigger === 'pre-commit';
  }

  translate(config: EnforcementConfig): HostAdapterResult {
    const hooks: Array<{ event: string; command: string; ruleId: string }> = [];
    const hookFiles: Array<{ path: string; content: string; ruleId: string }> = [];
    const skipped: Array<{ ruleId: string; reason: string }> = [];

    for (const rule of config.rules) {
      if (!this.supports(rule.trigger)) {
        skipped.push({ ruleId: rule.id, reason: `Trigger '${rule.trigger}' not supported` });
        continue;
      }

      if (rule.trigger === 'pre-commit') {
        // Pre-commit uses a hookify-style .local.md file
        hookFiles.push({
          path: `.claude/hookify.${rule.id}.local.md`,
          content: this.generateHookFile(rule.id, rule.description, rule.pattern, rule.message),
          ruleId: rule.id,
        });
        continue;
      }

      const event = TRIGGER_TO_EVENT[rule.trigger];
      if (!event) {
        skipped.push({ ruleId: rule.id, reason: `No event mapping for '${rule.trigger}'` });
        continue;
      }

      if (rule.pattern) {
        // Pattern-based hook
        hooks.push({
          event,
          command: this.generatePatternCommand(rule.id, rule.pattern, rule.action, rule.message),
          ruleId: rule.id,
        });
      } else {
        // Simple event hook
        hooks.push({
          event,
          command: `echo "[${rule.id}] ${rule.message}"`,
          ruleId: rule.id,
        });
      }
    }

    const files: Array<{ path: string; content: string }> = [];

    // Generate settings.json hooks section
    if (hooks.length > 0) {
      const settingsHooks = hooks.map((h) => ({
        event: h.event,
        command: h.command,
      }));
      files.push({
        path: '.claude/settings.json',
        content: JSON.stringify({ hooks: settingsHooks }, null, 2),
      });
    }

    // Add hookify files
    for (const hf of hookFiles) {
      files.push({ path: hf.path, content: hf.content });
    }

    return { host: this.host, files, skipped };
  }

  private generatePatternCommand(
    ruleId: string,
    pattern: string,
    action: string,
    message: string,
  ): string {
    if (action === 'block') {
      return `grep -rn '${pattern}' "$TOOL_INPUT" 2>/dev/null && echo "BLOCKED [${ruleId}]: ${message}" && exit 1 || exit 0`;
    }
    return `grep -rn '${pattern}' "$TOOL_INPUT" 2>/dev/null && echo "WARNING [${ruleId}]: ${message}" || true`;
  }

  private generateHookFile(
    id: string,
    description: string,
    pattern?: string,
    message?: string,
  ): string {
    const lines = [
      '---',
      `name: ${id}`,
      `description: ${description}`,
      '---',
      '',
      `# ${id}`,
      '',
      description,
      '',
    ];
    if (pattern) {
      lines.push(`Pattern: \`${pattern}\``);
    }
    if (message) {
      lines.push('', message);
    }
    return lines.join('\n');
  }
}
