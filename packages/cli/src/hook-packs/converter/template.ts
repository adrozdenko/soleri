/**
 * Conversion template for skill-to-hook conversion.
 * Generates POSIX shell scripts and pack manifests for converted hooks.
 */

import type { HookPackManifest, HookPackLifecycleHook, HookPackScript } from '../registry.js';

/** Supported Claude Code hook events */
export type HookEvent = 'PreToolUse' | 'PostToolUse' | 'PreCompact' | 'Notification' | 'Stop';

/** Action levels for graduated enforcement */
export type ActionLevel = 'remind' | 'warn' | 'block';

/** Configuration for generating a converted hook */
export interface HookConversionConfig {
  /** Hook pack name (kebab-case) */
  name: string;
  /** Claude Code hook event to trigger on */
  event: HookEvent;
  /** Tool name matcher (e.g., 'Write|Edit', 'Bash') — only for PreToolUse/PostToolUse */
  toolMatcher?: string;
  // File glob patterns to match (e.g., ['**/marketing/**', '**/*.tsx'])
  filePatterns?: string[];
  /** Action level: remind (default), warn, or block */
  action: ActionLevel;
  /** Context message to inject when the hook fires */
  message: string;
  /** Optional description for the pack */
  description?: string;
}

export const HOOK_EVENTS: HookEvent[] = [
  'PreToolUse',
  'PostToolUse',
  'PreCompact',
  'Notification',
  'Stop',
];
export const ACTION_LEVELS: ActionLevel[] = ['remind', 'warn', 'block'];

/**
 * Generate a POSIX shell script for a converted hook.
 * Reads JSON from stdin, matches tool/file patterns, outputs action JSON.
 */
export function generateHookScript(config: HookConversionConfig): string {
  const lines: string[] = [
    '#!/bin/sh',
    `# Converted hook: ${config.name} (Soleri Hook Pack)`,
    `# Event: ${config.event} | Action: ${config.action}`,
    '#',
    `# ${config.message}`,
    '#',
    '# Dependencies: jq (required)',
    '# POSIX sh compatible.',
    '',
    'set -eu',
    '',
    'INPUT=$(cat)',
    '',
  ];

  if (config.event === 'PreToolUse' || config.event === 'PostToolUse') {
    // Tool-based hooks read tool_name and tool_input from stdin
    lines.push('# Extract tool name and input from stdin JSON');
    lines.push("TOOL_NAME=$(printf '%s' \"$INPUT\" | jq -r '.tool_name // empty' 2>/dev/null)");
    lines.push('');

    // Tool matcher
    if (config.toolMatcher) {
      lines.push('# Check tool name matcher');
      lines.push(`case "$TOOL_NAME" in`);
      // Split on | for case pattern matching
      const tools = config.toolMatcher.split('|').map((t) => t.trim());
      lines.push(`  ${tools.join('|')}) ;; # matched`);
      lines.push('  *) exit 0 ;; # not a matching tool');
      lines.push('esac');
      lines.push('');
    }

    // File pattern matching
    if (config.filePatterns && config.filePatterns.length > 0) {
      lines.push('# Extract file path from tool input');
      lines.push(
        "FILE_PATH=$(printf '%s' \"$INPUT\" | jq -r '.tool_input.file_path // .tool_input.command // empty' 2>/dev/null)",
      );
      lines.push('');
      lines.push('# Check file patterns');
      lines.push('MATCHED=false');
      for (const pattern of config.filePatterns) {
        // Convert glob to grep-compatible regex
        const regex = pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
        lines.push(`printf '%s' "$FILE_PATH" | grep -qE '${regex}' && MATCHED=true`);
      }
      lines.push('');
      lines.push('if [ "$MATCHED" = false ]; then');
      lines.push('  exit 0');
      lines.push('fi');
      lines.push('');
    }
  }

  // Output the action
  const escapedMessage = config.message.replace(/'/g, "'\\''");

  if (config.action === 'block') {
    lines.push('# Block the operation');
    lines.push('jq -n \\');
    lines.push(`  --arg msg '${escapedMessage}' \\`);
    lines.push("  '{");
    lines.push('    continue: false,');
    lines.push('    stopReason: ("BLOCKED: " + $msg)');
    lines.push("  }'");
  } else if (config.action === 'warn') {
    lines.push('# Warn — allow but inject context');
    lines.push('jq -n \\');
    lines.push(`  --arg msg '${escapedMessage}' \\`);
    lines.push("  '{");
    lines.push('    continue: true,');
    lines.push('    message: ("WARNING: " + $msg)');
    lines.push("  }'");
  } else {
    // remind (default)
    lines.push('# Remind — inject context without blocking');
    lines.push('jq -n \\');
    lines.push(`  --arg msg '${escapedMessage}' \\`);
    lines.push("  '{");
    lines.push('    continue: true,');
    lines.push('    message: ("REMINDER: " + $msg)');
    lines.push("  }'");
  }

  return lines.join('\n') + '\n';
}

/**
 * Generate a HookPackManifest for a converted hook.
 */
export function generateManifest(config: HookConversionConfig): HookPackManifest {
  const script: HookPackScript = {
    name: config.name,
    file: `${config.name}.sh`,
    targetDir: 'hooks',
  };

  const lifecycleHook: HookPackLifecycleHook = {
    event: config.event,
    matcher: config.toolMatcher ?? '',
    type: 'command',
    command: `sh ~/.claude/hooks/${config.name}.sh`,
    timeout: 10,
    statusMessage: config.message,
  };

  return {
    name: config.name,
    version: '1.0.0',
    description: config.description ?? config.message,
    hooks: [],
    scripts: [script],
    lifecycleHooks: [lifecycleHook],
    actionLevel: config.action,
  };
}
