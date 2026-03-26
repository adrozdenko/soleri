/**
 * Hook pack validation framework.
 * Generates test fixtures, runs dry-run tests, reports false positives/negatives.
 */
import { execSync } from 'node:child_process';
import type { HookEvent } from './converter/template.js';

export interface TestFixture {
  name: string;
  event: HookEvent;
  payload: Record<string, unknown>;
  shouldMatch: boolean;
}

export interface DryRunResult {
  fixture: TestFixture;
  exitCode: number;
  stdout: string;
  matched: boolean;
}

export interface ValidationReport {
  total: number;
  passed: number;
  falsePositives: DryRunResult[];
  falseNegatives: DryRunResult[];
}

/**
 * Generate test fixtures for a hook event.
 * Returns 5 matching + 10 non-matching payloads.
 */
export function generateFixtures(
  event: HookEvent,
  toolMatcher?: string,
  filePatterns?: string[],
): TestFixture[] {
  const fixtures: TestFixture[] = [];

  if (event === 'PreToolUse' || event === 'PostToolUse') {
    const matchTools = toolMatcher ? toolMatcher.split('|').map((t) => t.trim()) : ['Write'];
    const matchPath = filePatterns?.[0] ?? '**/src/**';
    // Convert glob to a sample path
    const samplePath = matchPath
      .replace('**/', 'src/')
      .replace('**', 'components')
      .replace('*', 'file.tsx');

    // 5 matching fixtures
    for (let i = 0; i < 5; i++) {
      const tool = matchTools[i % matchTools.length];
      fixtures.push({
        name: `match-${tool}-${i}`,
        event,
        payload: {
          tool_name: tool,
          tool_input: {
            file_path: `${samplePath.replace('file.tsx', `file-${i}.tsx`)}`,
            command: `echo test-${i}`,
          },
        },
        shouldMatch: true,
      });
    }

    // 10 non-matching fixtures
    const nonMatchTools = [
      'Bash',
      'Read',
      'Glob',
      'Grep',
      'Agent',
      'WebSearch',
      'WebFetch',
      'TaskCreate',
      'Skill',
      'ToolSearch',
    ];
    for (let i = 0; i < 10; i++) {
      fixtures.push({
        name: `no-match-${nonMatchTools[i]}-${i}`,
        event,
        payload: {
          tool_name: nonMatchTools[i],
          tool_input: {
            file_path: `/unrelated/path/other-${i}.js`,
            command: `ls -la`,
          },
        },
        shouldMatch: false,
      });
    }
  } else {
    // PreCompact, Notification, Stop — simpler payloads
    // 5 matching (any invocation matches these events)
    for (let i = 0; i < 5; i++) {
      fixtures.push({
        name: `match-event-${i}`,
        event,
        payload: { session_id: `test-session-${i}`, context: `test context ${i}` },
        shouldMatch: true,
      });
    }
    // 10 non-matching (empty/malformed payloads)
    for (let i = 0; i < 10; i++) {
      fixtures.push({
        name: `no-match-empty-${i}`,
        event,
        payload: {},
        shouldMatch: false,
      });
    }
  }

  return fixtures;
}

/**
 * Run a hook script against a single fixture in dry-run mode.
 */
export function runSingleDryRun(scriptPath: string, fixture: TestFixture): DryRunResult {
  const input = JSON.stringify(fixture.payload);
  try {
    const stdout = execSync(`printf '%s' '${input.replace(/'/g, "'\\''")}' | sh "${scriptPath}"`, {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const matched = stdout.trim().length > 0 && stdout.includes('"continue"');
    return { fixture, exitCode: 0, stdout: stdout.trim(), matched };
  } catch (err: unknown) {
    const error = err as { status?: number; stdout?: string };
    return {
      fixture,
      exitCode: error.status ?? 1,
      stdout: (error.stdout as string) ?? '',
      matched: false,
    };
  }
}

/**
 * Run all fixtures against a script and produce a validation report.
 */
export function validateHookScript(scriptPath: string, fixtures: TestFixture[]): ValidationReport {
  const results = fixtures.map((f) => runSingleDryRun(scriptPath, f));

  const falsePositives = results.filter((r) => !r.fixture.shouldMatch && r.matched);
  const falseNegatives = results.filter((r) => r.fixture.shouldMatch && !r.matched);
  const passed = results.length - falsePositives.length - falseNegatives.length;

  return {
    total: results.length,
    passed,
    falsePositives,
    falseNegatives,
  };
}
