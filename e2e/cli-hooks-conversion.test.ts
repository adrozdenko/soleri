/**
 * E2E Test: CLI Hooks Conversion Commands
 *
 * Tests the @soleri/cli hooks subcommands non-interactively:
 * - soleri hooks convert (skill-to-hook conversion)
 * - soleri hooks test (validation against fixtures)
 * - soleri hooks promote (action level graduation up)
 * - soleri hooks demote (action level graduation down)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const CLI_BIN = join(import.meta.dirname, '..', 'packages', 'cli', 'dist', 'main.js');

function runCli(args: string[], options: { cwd?: string; env?: Record<string, string> } = {}) {
  try {
    const result = execFileSync('node', [CLI_BIN, ...args], {
      cwd: options.cwd ?? process.cwd(),
      stdio: 'pipe',
      timeout: 60_000,
      env: { ...process.env, ...options.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    return { stdout: result.toString(), stderr: '', exitCode: 0 };
  } catch (err) {
    const error = err as { stdout?: Buffer; stderr?: Buffer; status?: number };
    return {
      stdout: error.stdout?.toString() ?? '',
      stderr: error.stderr?.toString() ?? '',
      exitCode: error.status ?? 1,
    };
  }
}

describe('E2E: cli-hooks-conversion', () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = join(tmpdir(), `soleri-e2e-hooks-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // ─── hooks convert ───────────────────────────────────────────────

  describe('hooks convert', () => {
    it('should create manifest.json and script file with --project flag', () => {
      const result = runCli(
        [
          'hooks',
          'convert',
          'test-hook-a',
          '--event',
          'PreToolUse',
          '--matcher',
          'Write|Edit',
          '--message',
          'Check guidelines before editing',
          '--project',
        ],
        { cwd: tmpDir },
      );
      expect(result.exitCode).toBe(0);

      const packDir = join(tmpDir, '.soleri', 'hook-packs', 'test-hook-a');
      expect(existsSync(join(packDir, 'manifest.json'))).toBe(true);
      expect(existsSync(join(packDir, 'scripts', 'test-hook-a.sh'))).toBe(true);
    });

    it('manifest should have correct name, event, and action fields', () => {
      const manifestPath = join(
        tmpDir,
        '.soleri',
        'hook-packs',
        'test-hook-a',
        'manifest.json',
      );
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

      expect(manifest.name).toBe('test-hook-a');
      expect(manifest.actionLevel).toBe('remind');
      expect(manifest.lifecycleHooks).toBeDefined();
      expect(manifest.lifecycleHooks[0].event).toBe('PreToolUse');
      expect(manifest.lifecycleHooks[0].matcher).toBe('Write|Edit');
    });

    it('generated script should be executable (file mode)', () => {
      const scriptPath = join(
        tmpDir,
        '.soleri',
        'hook-packs',
        'test-hook-a',
        'scripts',
        'test-hook-a.sh',
      );
      const stat = statSync(scriptPath);
      // Check owner execute bit is set (0o100)
      expect(stat.mode & 0o111).toBeGreaterThan(0);
    });

    it('generated script should contain #!/bin/sh and tool matcher', () => {
      const scriptPath = join(
        tmpDir,
        '.soleri',
        'hook-packs',
        'test-hook-a',
        'scripts',
        'test-hook-a.sh',
      );
      const content = readFileSync(scriptPath, 'utf-8');

      expect(content).toContain('#!/bin/sh');
      expect(content).toContain('Write|Edit');
      expect(content).toContain('TOOL_NAME');
    });

    it('should support --action warn flag', () => {
      const result = runCli(
        [
          'hooks',
          'convert',
          'test-hook-warn',
          '--event',
          'PreToolUse',
          '--matcher',
          'Bash',
          '--action',
          'warn',
          '--message',
          'Be careful with shell commands',
          '--project',
        ],
        { cwd: tmpDir },
      );
      expect(result.exitCode).toBe(0);

      const manifest = JSON.parse(
        readFileSync(
          join(tmpDir, '.soleri', 'hook-packs', 'test-hook-warn', 'manifest.json'),
          'utf-8',
        ),
      );
      expect(manifest.actionLevel).toBe('warn');

      const script = readFileSync(
        join(tmpDir, '.soleri', 'hook-packs', 'test-hook-warn', 'scripts', 'test-hook-warn.sh'),
        'utf-8',
      );
      expect(script).toContain('WARNING');
    });

    it('should fail with error for invalid --event value', () => {
      const result = runCli(
        [
          'hooks',
          'convert',
          'test-hook-bad-event',
          '--event',
          'InvalidEvent',
          '--message',
          'Test message',
          '--project',
        ],
        { cwd: tmpDir },
      );
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Invalid event');
    });

    it('should fail with error when --message is missing', () => {
      const result = runCli(
        [
          'hooks',
          'convert',
          'test-hook-no-msg',
          '--event',
          'PreToolUse',
        ],
        { cwd: tmpDir },
      );
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/required|missing/);
    });

    it('should support --pattern flag for file matching', () => {
      const result = runCli(
        [
          'hooks',
          'convert',
          'test-hook-pattern',
          '--event',
          'PreToolUse',
          '--matcher',
          'Write',
          '--pattern',
          '**/marketing/**',
          '--message',
          'Check marketing guidelines',
          '--project',
        ],
        { cwd: tmpDir },
      );
      expect(result.exitCode).toBe(0);

      const script = readFileSync(
        join(
          tmpDir,
          '.soleri',
          'hook-packs',
          'test-hook-pattern',
          'scripts',
          'test-hook-pattern.sh',
        ),
        'utf-8',
      );
      expect(script).toContain('FILE_PATH');
      expect(script).toContain('marketing');
    });
  });

  // ─── hooks test ──────────────────────────────────────────────────

  describe('hooks test', () => {
    it('should run against built-in safety pack and produce output', () => {
      const result = runCli(['hooks', 'test', 'safety']);
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      expect(output).toMatch(/Results.*\d+\/\d+.*passed/);
    });

    it('should fail with error for unknown pack name', () => {
      const result = runCli(['hooks', 'test', 'nonexistent-pack-xyz']);
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('Unknown pack');
    });

    it('should test a locally converted pack with scripts', () => {
      // First create a pack via convert
      runCli(
        [
          'hooks',
          'convert',
          'test-hook-for-test',
          '--event',
          'PreToolUse',
          '--matcher',
          'Write',
          '--message',
          'Test hook for validation',
          '--project',
        ],
        { cwd: tmpDir },
      );

      // Now test it — cwd must be tmpDir so getPack finds local pack
      const result = runCli(['hooks', 'test', 'test-hook-for-test'], { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      const output = result.stdout;
      expect(output).toMatch(/Results.*\d+\/\d+.*passed/);
    });
  });

  // ─── hooks promote / demote ──────────────────────────────────────

  describe('hooks promote and demote', () => {
    const packName = 'grad-test-pack';
    let gradDir: string;

    beforeAll(() => {
      // Create a local pack in tmpDir/.soleri/hook-packs/ so getPack finds it
      gradDir = join(tmpDir, '.soleri', 'hook-packs', packName);
      const scriptsDir = join(gradDir, 'scripts');
      mkdirSync(scriptsDir, { recursive: true });

      const manifest = {
        name: packName,
        version: '1.0.0',
        description: 'Graduation test pack',
        hooks: [],
        scripts: [{ name: packName, file: `${packName}.sh`, targetDir: 'hooks' }],
        lifecycleHooks: [
          {
            event: 'PreToolUse',
            matcher: 'Write',
            type: 'command',
            command: `sh ~/.claude/hooks/${packName}.sh`,
            timeout: 10,
          },
        ],
        actionLevel: 'remind',
      };

      writeFileSync(join(gradDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      writeFileSync(join(scriptsDir, `${packName}.sh`), '#!/bin/sh\nexit 0\n');
    });

    it('promote should change actionLevel from remind to warn', () => {
      const result = runCli(['hooks', 'promote', packName], { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('remind');
      expect(result.stdout).toContain('warn');

      const manifest = JSON.parse(readFileSync(join(gradDir, 'manifest.json'), 'utf-8'));
      expect(manifest.actionLevel).toBe('warn');
    });

    it('promote again should change actionLevel from warn to block', () => {
      const result = runCli(['hooks', 'promote', packName], { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('warn');
      expect(result.stdout).toContain('block');

      const manifest = JSON.parse(readFileSync(join(gradDir, 'manifest.json'), 'utf-8'));
      expect(manifest.actionLevel).toBe('block');
    });

    it('promote at block should fail with error', () => {
      const result = runCli(['hooks', 'promote', packName], { cwd: tmpDir });
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('maximum level');
    });

    it('demote should change actionLevel from block to warn', () => {
      const result = runCli(['hooks', 'demote', packName], { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('block');
      expect(result.stdout).toContain('warn');

      const manifest = JSON.parse(readFileSync(join(gradDir, 'manifest.json'), 'utf-8'));
      expect(manifest.actionLevel).toBe('warn');
    });

    it('demote again should change actionLevel from warn to remind', () => {
      const result = runCli(['hooks', 'demote', packName], { cwd: tmpDir });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('warn');
      expect(result.stdout).toContain('remind');

      const manifest = JSON.parse(readFileSync(join(gradDir, 'manifest.json'), 'utf-8'));
      expect(manifest.actionLevel).toBe('remind');
    });

    it('demote at remind should fail with error', () => {
      const result = runCli(['hooks', 'demote', packName], { cwd: tmpDir });
      expect(result.exitCode).not.toBe(0);
      const output = result.stdout + result.stderr;
      expect(output).toContain('minimum level');
    });

    it('promote/demote should fail for unknown pack', () => {
      const promoteResult = runCli(['hooks', 'promote', 'nonexistent-pack-abc'], { cwd: tmpDir });
      expect(promoteResult.exitCode).not.toBe(0);
      expect(promoteResult.stdout + promoteResult.stderr).toContain('Unknown');

      const demoteResult = runCli(['hooks', 'demote', 'nonexistent-pack-abc'], { cwd: tmpDir });
      expect(demoteResult.exitCode).not.toBe(0);
      expect(demoteResult.stdout + demoteResult.stderr).toContain('Unknown');
    });
  });
});
