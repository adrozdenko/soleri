import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ImpactAnalyzer } from './impact-analyzer.js';

const TMP = join(import.meta.dirname ?? __dirname, '__impact_test_tmp__');

function setup() {
  mkdirSync(join(TMP, 'src', 'utils'), { recursive: true });
  mkdirSync(join(TMP, 'src', 'components'), { recursive: true });
  mkdirSync(join(TMP, 'src', '__tests__'), { recursive: true });
}

function teardown() {
  try {
    rmSync(TMP, { recursive: true, force: true });
  } catch { /* ignore */ }
}

describe('ImpactAnalyzer', () => {
  let analyzer: ImpactAnalyzer;

  beforeEach(() => {
    analyzer = new ImpactAnalyzer();
    setup();
  });

  afterEach(() => {
    teardown();
  });

  // ─── No modified files → low risk, empty consumers ─────────

  it('returns low risk with empty consumers when no files modified', () => {
    const report = analyzer.analyzeImpact([], TMP);

    expect(report.riskLevel).toBe('low');
    expect(report.affectedConsumers).toHaveLength(0);
    expect(report.untestedConsumers).toHaveLength(0);
    expect(report.scopeViolations).toHaveLength(0);
    expect(report.recommendations).toHaveLength(0);
  });

  // ─── 1 modified file with 0 consumers → low risk ───────────

  it('returns low risk when modified file has no consumers', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'helper.ts'), 'export function help() {}');
    writeFileSync(join(TMP, 'src', 'components', 'button.ts'), 'export const Button = 1;');

    const report = analyzer.analyzeImpact(['src/utils/helper.ts'], TMP);

    expect(report.riskLevel).toBe('low');
    expect(report.affectedConsumers).toHaveLength(0);
  });

  // ─── 1 modified file with 3 consumers → medium risk ────────

  it('returns medium risk when modified file has 3 consumers', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'format.ts'), 'export function format() {}');
    writeFileSync(
      join(TMP, 'src', 'components', 'a.ts'),
      "import { format } from '../utils/format';",
    );
    writeFileSync(
      join(TMP, 'src', 'components', 'b.ts'),
      "import { format } from '../utils/format';",
    );
    writeFileSync(
      join(TMP, 'src', 'components', 'c.ts'),
      "const f = require('../utils/format');",
    );

    const report = analyzer.analyzeImpact(['src/utils/format.ts'], TMP);

    expect(report.riskLevel).toBe('medium');
    expect(report.affectedConsumers).toHaveLength(3);
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  // ─── 1 modified file with 7 consumers → high risk ──────────

  it('returns high risk when modified file has 7 consumers', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'core.ts'), 'export const core = 1;');

    for (let i = 0; i < 7; i++) {
      writeFileSync(
        join(TMP, 'src', 'components', `comp${i}.ts`),
        `import { core } from '../utils/core';`,
      );
    }

    const report = analyzer.analyzeImpact(['src/utils/core.ts'], TMP);

    expect(report.riskLevel).toBe('high');
    expect(report.affectedConsumers.length).toBeGreaterThanOrEqual(6);
  });

  // ─── Scope violation detection ──────────────────────────────

  it('detects scope violations when files are outside plan scope', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'misc.ts'), 'export const x = 1;');

    const report = analyzer.analyzeImpact(
      ['src/utils/misc.ts', 'src/components/button.ts'],
      TMP,
      ['components'],
    );

    expect(report.scopeViolations).toContain('src/utils/misc.ts');
    expect(report.scopeViolations).not.toContain('src/components/button.ts');
  });

  it('returns no scope violations when no planScope provided', () => {
    const report = analyzer.analyzeImpact(['src/utils/misc.ts'], TMP);
    expect(report.scopeViolations).toHaveLength(0);
  });

  // ─── Recommendation generation ─────────────────────────────

  it('generates recommendations for consumers without tests', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'shared.ts'), 'export const shared = 1;');
    writeFileSync(
      join(TMP, 'src', 'components', 'widget.ts'),
      "import { shared } from '../utils/shared';",
    );

    const report = analyzer.analyzeImpact(['src/utils/shared.ts'], TMP);

    expect(report.recommendations.length).toBeGreaterThan(0);
    const recText = report.recommendations.join(' ');
    expect(recText).toContain('widget');
  });

  it('includes scope violation in recommendations', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'oops.ts'), 'export const x = 1;');

    const report = analyzer.analyzeImpact(
      ['src/utils/oops.ts'],
      TMP,
      ['components'],
    );

    const recText = report.recommendations.join(' ');
    expect(recText).toContain('Scope violation');
  });

  // ─── Untested consumers detection ──────────────────────────

  it('separates test files from untested consumers', () => {
    writeFileSync(join(TMP, 'src', 'utils', 'api.ts'), 'export const api = 1;');
    writeFileSync(
      join(TMP, 'src', 'components', 'page.ts'),
      "import { api } from '../utils/api';",
    );
    writeFileSync(
      join(TMP, 'src', '__tests__', 'api.test.ts'),
      "import { api } from '../utils/api';",
    );

    const report = analyzer.analyzeImpact(['src/utils/api.ts'], TMP);

    // Test file should not be in untestedConsumers
    expect(report.untestedConsumers.every((f) => !f.includes('.test.'))).toBe(true);
    // page.ts (non-test) should be in untestedConsumers
    expect(report.untestedConsumers.some((f) => f.includes('page'))).toBe(true);
  });

  // ─── Graceful when project path doesn't exist ──────────────

  it('returns low risk when project path does not exist', () => {
    const report = analyzer.analyzeImpact(
      ['src/foo.ts'],
      '/nonexistent/path/12345',
    );

    expect(report.riskLevel).toBe('low');
    expect(report.affectedConsumers).toHaveLength(0);
    expect(report.modifiedFiles).toEqual(['src/foo.ts']);
  });
});
