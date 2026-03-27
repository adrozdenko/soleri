/**
 * ClaudeCodeRuntimeAdapter — RuntimeAdapter implementation for Claude Code CLI.
 *
 * Thin wrapper around a dispatch function (actual child process spawning is #411).
 * Provides environment detection, session codec, and skill sync.
 */

import { execSync } from 'node:child_process';
import { platform } from 'node:os';

import type {
  RuntimeAdapter,
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterSessionState,
  AdapterSessionCodec,
  AdapterEnvironmentTestResult,
} from './types.js';
import type { SkillEntry } from '../skills/sync-skills.js';

// ─── Types ───────────────────────────────────────────────────────────

/** Shape of Claude Code session data */
interface ClaudeCodeSessionData {
  sessionId: string;
  cwd: string;
}

/** Dispatch function signature — injected via constructor */
export type ClaudeCodeDispatchFn = (
  prompt: string,
  workspace: string,
  config?: Record<string, unknown>,
) => Promise<{
  exitCode: number;
  output?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}>;

// ─── Session Codec ───────────────────────────────────────────────────

const claudeCodeSessionCodec: AdapterSessionCodec = {
  serialize(state: AdapterSessionState): string {
    return JSON.stringify(state);
  },

  deserialize(serialized: string): AdapterSessionState {
    return JSON.parse(serialized) as AdapterSessionState;
  },

  getDisplayId(state: AdapterSessionState): string {
    const data = state.data as unknown as ClaudeCodeSessionData;
    return data.sessionId ?? 'unknown';
  },
};

// ─── Adapter ─────────────────────────────────────────────────────────

export class ClaudeCodeRuntimeAdapter implements RuntimeAdapter {
  readonly type = 'claude-code' as const;
  readonly sessionCodec = claudeCodeSessionCodec;

  private readonly dispatch: ClaudeCodeDispatchFn | undefined;

  constructor(dispatch?: ClaudeCodeDispatchFn) {
    this.dispatch = dispatch;
  }

  // ── Execute ──────────────────────────────────────────────────────

  async execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
    if (!this.dispatch) {
      return {
        exitCode: 1,
        summary: 'No dispatch function configured — cannot execute.',
      };
    }

    ctx.onLog?.(`[claude-code] Executing run ${ctx.runId} in ${ctx.workspace}`);

    const result = await this.dispatch(ctx.prompt, ctx.workspace, ctx.config);

    const executionResult: AdapterExecutionResult = {
      exitCode: result.exitCode,
      provider: 'anthropic',
      summary: result.output,
    };

    if (result.usage) {
      executionResult.usage = {
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        totalTokens: (result.usage.inputTokens ?? 0) + (result.usage.outputTokens ?? 0),
      };
    }

    // Propagate session state if the incoming context had one
    if (ctx.session) {
      executionResult.sessionState = ctx.session;
    }

    return executionResult;
  }

  // ── Environment Test ─────────────────────────────────────────────

  async testEnvironment(): Promise<AdapterEnvironmentTestResult> {
    try {
      const cmd = platform() === 'win32' ? 'where claude' : 'which claude';
      const cliPath = execSync(cmd, { encoding: 'utf-8', timeout: 5_000 }).trim();

      // Try to get version
      let version: string | undefined;
      try {
        version = execSync('claude --version', {
          encoding: 'utf-8',
          timeout: 5_000,
        }).trim();
      } catch {
        // Version detection is optional — CLI may not support --version
      }

      return {
        available: true,
        version,
        details: { path: cliPath },
      };
    } catch (err) {
      return {
        available: false,
        error: err instanceof Error ? err.message : 'Claude CLI not found in PATH',
      };
    }
  }

  // ── Skill Sync ───────────────────────────────────────────────────

  async syncSkills(skills: SkillEntry[]): Promise<void> {
    if (skills.length === 0) return;

    try {
      // Dynamic import to avoid hard failure if sync-skills is unavailable
      const { syncSkillsToClaudeCode } = await import('../skills/sync-skills.js');

      // syncSkillsToClaudeCode expects directories, but we have individual
      // SkillEntry items. Extract unique parent directories from source paths.
      const dirs = [
        ...new Set(
          skills.map((s) => {
            // sourcePath is typically <dir>/<skill-name>/SKILL.md — go up two levels
            const parts = s.sourcePath.split('/');
            // Remove filename and skill folder to get the skills root dir
            return parts.slice(0, -2).join('/');
          }),
        ),
      ];

      syncSkillsToClaudeCode(dirs);
    } catch {
      // Graceful degradation — skill sync is optional
    }
  }
}
