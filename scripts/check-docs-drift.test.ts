/**
 * Tests for the doc-drift checker (#779). Each detector is exercised with
 * synthetic source + doc fixtures so a real source change cannot mask a
 * regression in the matcher itself.
 */

import { describe, it, expect } from 'vitest';
import {
  extractStringArrayConst,
  findValuesLines,
  checkEnumDrift,
  listCliCommands,
  findDocCommandSections,
  checkCliCommandDrift,
  extractFullProfileModules,
  findModuleCountClaims,
  checkModuleCountDrift,
  extractProfileModule,
  findProfileTableRows,
  checkProfileModuleDrift,
  runAllDetectors,
} from './check-docs-drift.js';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('extractStringArrayConst', () => {
  it('extracts a flat string-array as-const declaration', () => {
    const src = `export const TONES = ['precise', 'mentor', 'pragmatic'] as const;`;
    expect(extractStringArrayConst(src, 'TONES')).toEqual(['precise', 'mentor', 'pragmatic']);
  });

  it('extracts a multi-line declaration', () => {
    const src = `export const ENGINE_PROFILES = [
  'minimal',
  'standard',
  'full',
] as const;`;
    expect(extractStringArrayConst(src, 'ENGINE_PROFILES')).toEqual([
      'minimal',
      'standard',
      'full',
    ]);
  });

  it('returns null for unknown identifier', () => {
    const src = `export const TONES = ['a'] as const;`;
    expect(extractStringArrayConst(src, 'MISSING')).toBeNull();
  });
});

describe('findValuesLines', () => {
  it('extracts backtick-quoted enum values from "**Values:**" lines', () => {
    const doc = `
intro
- **Values:** \`precise\` | \`mentor\` | \`pragmatic\`
- **Default:** \`pragmatic\`
`;
    const out = findValuesLines(doc);
    expect(out).toHaveLength(1);
    expect(out[0].values).toEqual(['precise', 'mentor', 'pragmatic']);
  });

  it('returns empty when no values line is present', () => {
    expect(findValuesLines('plain text only')).toEqual([]);
  });
});

describe('checkEnumDrift', () => {
  const schema = `
export const TONES = ['precise', 'mentor', 'pragmatic'] as const;
export const ENGINE_PROFILES = ['minimal', 'standard', 'full'] as const;
export const SETUP_TARGETS = ['claude', 'codex', 'opencode', 'both', 'all'] as const;
`;

  it('reports drift when doc adds an enum value not in source', () => {
    const doc = `### tone
- **Values:** \`precise\` | \`mentor\` | \`pragmatic\` | \`extra\`
`;
    const drifts = checkEnumDrift(schema, 'docs/x.md', doc);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].detector).toBe('enum:TONES');
    expect(drifts[0].expected).toBe('mentor | pragmatic | precise');
    expect(drifts[0].actual).toBe('extra | mentor | pragmatic | precise');
  });

  it('reports drift when doc drops an enum value present in source', () => {
    const doc = `### tone
- **Values:** \`precise\` | \`mentor\`
`;
    const drifts = checkEnumDrift(schema, 'docs/x.md', doc);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].detector).toBe('enum:TONES');
  });

  it('passes when doc matches source exactly', () => {
    const doc = `- **Values:** \`precise\` | \`mentor\` | \`pragmatic\``;
    expect(checkEnumDrift(schema, 'docs/x.md', doc)).toEqual([]);
  });

  it('ignores unrelated values lines (no overlap with any tracked enum)', () => {
    const doc = `- **Values:** \`red\` | \`green\` | \`blue\``;
    expect(checkEnumDrift(schema, 'docs/x.md', doc)).toEqual([]);
  });
});

describe('listCliCommands', () => {
  it('returns ts files without the .ts suffix and excludes test files', () => {
    const dir = join(REPO_ROOT, 'packages/cli/src/commands');
    const cmds = listCliCommands(dir);
    expect(cmds.length).toBeGreaterThan(5);
    expect(cmds.every((c) => !c.endsWith('.test'))).toBe(true);
    // Cross-check against on-disk listing (sanity)
    const raw = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(cmds.length).toBe(raw.length);
  });
});

describe('findDocCommandSections', () => {
  it('only collects ### sections under ## Commands, stops at next H2', () => {
    const doc = `# Title
## Install
### irrelevant
## Commands
### create
### list
### dev
## Other
### shouldnotcount
`;
    const out = findDocCommandSections(doc);
    expect([...out.commands].sort()).toEqual(['create', 'dev', 'list']);
    expect(out.firstLine).toBeGreaterThan(0);
  });
});

describe('checkCliCommandDrift', () => {
  it('reports when a source command is missing from docs', () => {
    const doc = `## Commands
### create
### list
`;
    const drifts = checkCliCommandDrift(['create', 'list', 'dev'], 'docs/cli.md', doc);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].detector).toBe('cli:commands');
    expect(drifts[0].expected).toContain('dev');
    expect(drifts[0].actual).not.toContain('dev');
  });

  it('reports when docs claim a command not in source', () => {
    const doc = `## Commands
### create
### list
### ghost
`;
    const drifts = checkCliCommandDrift(['create', 'list'], 'docs/cli.md', doc);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].actual).toContain('ghost');
  });

  it('passes when sets match exactly', () => {
    const doc = `## Commands
### create
### list
`;
    expect(checkCliCommandDrift(['create', 'list'], 'docs/cli.md', doc)).toEqual([]);
  });
});

describe('extractFullProfileModules', () => {
  it('parses the full profile array from registry source', () => {
    const src = `export const PROFILE_MODULES = {
  minimal: ['vault', 'admin'],
  full: ['vault', 'plan', 'brain', 'memory', 'admin'],
} as const;`;
    expect(extractFullProfileModules(src)).toEqual(['vault', 'plan', 'brain', 'memory', 'admin']);
  });
});

describe('findModuleCountClaims', () => {
  it('captures every "All N modules" line', () => {
    const doc = `text
| \`full\` | All 22 modules | description |
note: All 5 modules used elsewhere
`;
    expect(findModuleCountClaims(doc)).toEqual([
      { line: 2, count: 22 },
      { line: 3, count: 5 },
    ]);
  });
});

describe('checkModuleCountDrift', () => {
  it('flags when claimed count diverges from source length', () => {
    const drifts = checkModuleCountDrift(
      ['vault', 'admin', 'plan'],
      'docs/x.md',
      `| \`full\` | All 22 modules | … |`,
    );
    expect(drifts).toHaveLength(1);
    expect(drifts[0].expected).toBe('All 3 modules');
    expect(drifts[0].actual).toBe('All 22 modules');
  });

  it('passes when count matches', () => {
    expect(
      checkModuleCountDrift(
        ['vault', 'admin', 'plan'],
        'docs/x.md',
        `| \`full\` | All 3 modules | … |`,
      ),
    ).toEqual([]);
  });
});

describe('extractProfileModule + findProfileTableRows', () => {
  it('extracts each named profile array', () => {
    const src = `export const PROFILE_MODULES = {
  minimal: ['vault', 'admin', 'control', 'orchestrate'],
  standard: ['vault', 'plan', 'admin'],
  full: ['vault', 'plan', 'brain'],
} as const;`;
    expect(extractProfileModule(src, 'minimal')).toEqual([
      'vault',
      'admin',
      'control',
      'orchestrate',
    ]);
    expect(extractProfileModule(src, 'standard')).toEqual(['vault', 'plan', 'admin']);
  });

  it('finds profile rows in a markdown table', () => {
    const doc = `| Profile | Modules | Best for |
| ------- | ------- | -------- |
| \`minimal\` | vault, admin, control, orchestrate | bots |
| \`standard\` | + plan, brain, memory | dev agents |
| \`full\` | All 22 modules | default |
`;
    const rows = findProfileTableRows(doc);
    const minimal = rows.find((r) => r.profile === 'minimal');
    const standard = rows.find((r) => r.profile === 'standard');
    expect(minimal?.modules).toEqual(['vault', 'admin', 'control', 'orchestrate']);
    expect(standard?.modules).toEqual(['plan', 'brain', 'memory']);
  });
});

describe('checkProfileModuleDrift', () => {
  const registry = `export const PROFILE_MODULES = {
  minimal: ['vault', 'admin', 'control', 'orchestrate'],
  standard: ['vault', 'admin', 'control', 'orchestrate', 'plan', 'brain', 'memory'],
  full: ['vault', 'admin', 'control', 'orchestrate', 'plan', 'brain', 'memory', 'dream'],
} as const;`;

  it('flags when minimal cell diverges from source', () => {
    const doc = `| \`minimal\` | vault, admin, control | bots |`;
    const drifts = checkProfileModuleDrift(registry, 'docs/x.md', doc);
    expect(drifts).toHaveLength(1);
    expect(drifts[0].detector).toBe('engine:profile:minimal');
  });

  it('treats "+ delta" notation in standard as additive over minimal', () => {
    const doc = `| \`minimal\` | vault, admin, control, orchestrate | bots |
| \`standard\` | + plan, brain, memory | dev |`;
    const drifts = checkProfileModuleDrift(registry, 'docs/x.md', doc);
    expect(drifts).toEqual([]);
  });

  it('flags when standard delta drops a real addition', () => {
    const doc = `| \`standard\` | + plan, brain | dev |`;
    const drifts = checkProfileModuleDrift(registry, 'docs/x.md', doc);
    const standardDrift = drifts.find((d) => d.detector === 'engine:profile:standard');
    expect(standardDrift).toBeDefined();
    expect(standardDrift!.expected).toContain('memory');
  });
});

describe('runAllDetectors against live docs (regression)', () => {
  it('current main is drift-free — adding a doc claim or shipping code without doc update should fail this', () => {
    const drifts = runAllDetectors();
    if (drifts.length > 0) {
      // Print the report so a failing CI run is readable
      console.error(JSON.stringify(drifts, null, 2));
    }
    expect(drifts).toEqual([]);
  });
});
