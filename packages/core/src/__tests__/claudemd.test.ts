import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  composeCLAUDEmd,
  OPEN_MARKER,
  CLOSE_MARKER,
  USER_ZONE_OPEN,
  USER_ZONE_CLOSE,
} from '../claudemd/compose.js';
import {
  injectCLAUDEmd,
  removeCLAUDEmd,
  hasCLAUDEmdBlock,
  extractUserZone,
} from '../claudemd/inject.js';
import type { AgentMeta } from '../claudemd/types.js';
import type { FacadeConfig } from '../facades/types.js';

const testAgent: AgentMeta = {
  id: 'test-agent',
  name: 'TestAgent',
  activationPhrase: 'Hello, TestAgent!',
  deactivationPhrase: 'Goodbye, TestAgent!',
  activateCommand: 'test-agent_core op:activate params:{ projectPath: "." }',
  deactivateCommand: 'test-agent_core op:activate params:{ deactivate: true }',
};

const testFacades: FacadeConfig[] = [
  {
    name: 'test-agent_core',
    description: 'Core facade',
    ops: [
      { name: 'health', description: 'Health check', auth: 'read', handler: async () => ({}) },
      { name: 'search', description: 'Search vault', auth: 'read', handler: async () => ({}) },
      { name: 'capture', description: 'Capture', auth: 'write', handler: async () => ({}) },
    ],
  },
  {
    name: 'test-agent_design',
    description: 'Design facade',
    ops: [
      { name: 'check_contrast', description: 'Contrast', auth: 'read', handler: async () => ({}) },
      { name: 'validate_token', description: 'Validate', auth: 'read', handler: async () => ({}) },
    ],
  },
];

describe('composeCLAUDEmd', () => {
  it('produces content wrapped in versioned markers', () => {
    const result = composeCLAUDEmd(testAgent, testFacades);
    expect(result).toContain(OPEN_MARKER);
    expect(result).toContain(CLOSE_MARKER);
    expect(result).toContain('v1');
  });

  it('includes activation phrases', () => {
    const result = composeCLAUDEmd(testAgent, testFacades);
    expect(result).toContain('Hello, TestAgent!');
    expect(result).toContain('Goodbye, TestAgent!');
  });

  it('includes session start protocol', () => {
    const result = composeCLAUDEmd(testAgent, testFacades);
    expect(result).toContain('Session Start Protocol');
    expect(result).toContain('test-agent_core op:session_start');
  });

  it('generates facade reference table', () => {
    const result = composeCLAUDEmd(testAgent, testFacades);
    expect(result).toContain('| Facade | Key Ops |');
    expect(result).toContain('`test-agent_core`');
    expect(result).toContain('`test-agent_design`');
    expect(result).toContain('`health`');
    expect(result).toContain('`check_contrast`');
  });

  it('includes global instructions sorted by priority', () => {
    const agent: AgentMeta = {
      ...testAgent,
      globalInstructions: [
        { heading: 'Low Priority', content: 'Come last', priority: 90 },
        { heading: 'High Priority', content: 'Come first', priority: 10 },
      ],
    };
    const result = composeCLAUDEmd(agent, testFacades);
    const highIdx = result.indexOf('High Priority');
    const lowIdx = result.indexOf('Low Priority');
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it('includes facade behavioral rules', () => {
    const instructions = new Map([
      [
        'test-agent_core',
        {
          heading: 'Planning',
          rules: ['Always plan before coding', 'Wait for approval'],
          priority: 10,
        },
      ],
    ]);
    const result = composeCLAUDEmd(testAgent, testFacades, { facadeInstructions: instructions });
    expect(result).toContain('## Planning');
    expect(result).toContain('- Always plan before coding');
    expect(result).toContain('- Wait for approval');
  });

  it('includes user-safe zone when requested', () => {
    const result = composeCLAUDEmd(testAgent, testFacades, { includeUserZone: true });
    expect(result).toContain(USER_ZONE_OPEN);
    expect(result).toContain(USER_ZONE_CLOSE);
  });
});

describe('injectCLAUDEmd', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'soleri-claudemd-'));
    filePath = join(tempDir, 'CLAUDE.md');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates a new file if none exists', () => {
    const block = composeCLAUDEmd(testAgent, testFacades);
    const result = injectCLAUDEmd(filePath, block);
    expect(result.success).toBe(true);
    expect(result.action).toBe('injected');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain(OPEN_MARKER);
  });

  it('appends to existing file without markers', () => {
    writeFileSync(filePath, '# My Project\n\nSome user content.\n');
    const block = composeCLAUDEmd(testAgent, testFacades);
    const result = injectCLAUDEmd(filePath, block);
    expect(result.action).toBe('injected');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# My Project');
    expect(content).toContain(OPEN_MARKER);
  });

  it('replaces existing block', () => {
    const block1 = composeCLAUDEmd(testAgent, testFacades);
    writeFileSync(filePath, `# Header\n\n${block1}\n\n# Footer\n`);

    const newAgent = { ...testAgent, name: 'UpdatedAgent' };
    const block2 = composeCLAUDEmd(newAgent, testFacades);
    const result = injectCLAUDEmd(filePath, block2);

    expect(result.action).toBe('replaced');
    expect(result.diffDetected).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('UpdatedAgent');
    expect(content).not.toContain('TestAgent Mode');
    expect(content).toContain('# Header');
    expect(content).toContain('# Footer');
  });

  it('skips write when content is identical', () => {
    const block = composeCLAUDEmd(testAgent, testFacades);
    writeFileSync(filePath, block);
    const result = injectCLAUDEmd(filePath, block);
    expect(result.action).toBe('skipped');
    expect(result.diffDetected).toBe(false);
  });

  it('preserves user-safe zone content on regeneration', () => {
    const block1 = composeCLAUDEmd(testAgent, testFacades, { includeUserZone: true });
    // Simulate user adding custom content inside the zone
    const customContent = 'My custom instructions here';
    const withCustom = block1.replace(
      `${USER_ZONE_OPEN}\n\n${USER_ZONE_CLOSE}`,
      `${USER_ZONE_OPEN}\n${customContent}\n${USER_ZONE_CLOSE}`,
    );
    writeFileSync(filePath, withCustom);

    // Regenerate — should preserve user content
    const block2 = composeCLAUDEmd(testAgent, testFacades, { includeUserZone: true });
    const result = injectCLAUDEmd(filePath, block2);
    expect(result.success).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain(customContent);
  });

  it('migrates legacy unversioned markers', () => {
    const legacyBlock = '<!-- agent:mode -->\n\nOld content\n\n<!-- /agent:mode -->';
    writeFileSync(filePath, `# Header\n\n${legacyBlock}\n`);

    const block = composeCLAUDEmd(testAgent, testFacades);
    const result = injectCLAUDEmd(filePath, block);
    expect(result.action).toBe('replaced');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain(OPEN_MARKER); // v1 marker
    expect(content).not.toContain('Old content');
  });
});

describe('removeCLAUDEmd', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'soleri-claudemd-'));
    filePath = join(tempDir, 'CLAUDE.md');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes agent block and preserves surrounding content', () => {
    const block = composeCLAUDEmd(testAgent, testFacades);
    writeFileSync(filePath, `# Header\n\n${block}\n\n# Footer\n`);
    const result = removeCLAUDEmd(filePath);
    expect(result.action).toBe('removed');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Header');
    expect(content).toContain('# Footer');
    expect(content).not.toContain(OPEN_MARKER);
  });

  it('returns not_present when no block exists', () => {
    writeFileSync(filePath, '# Just a file\n');
    expect(removeCLAUDEmd(filePath).action).toBe('not_present');
  });

  it('returns not_present for missing file', () => {
    expect(removeCLAUDEmd(filePath).action).toBe('not_present');
  });
});

describe('hasCLAUDEmdBlock', () => {
  let tempDir: string;
  let filePath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'soleri-claudemd-'));
    filePath = join(tempDir, 'CLAUDE.md');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns true when block exists', () => {
    const block = composeCLAUDEmd(testAgent, testFacades);
    writeFileSync(filePath, block);
    expect(hasCLAUDEmdBlock(filePath)).toBe(true);
  });

  it('returns false when no block', () => {
    writeFileSync(filePath, '# No agent block\n');
    expect(hasCLAUDEmdBlock(filePath)).toBe(false);
  });

  it('returns false for missing file', () => {
    expect(hasCLAUDEmdBlock(filePath)).toBe(false);
  });
});

describe('extractUserZone', () => {
  it('extracts content between user zone markers', () => {
    const content = `Some stuff\n${USER_ZONE_OPEN}\nMy custom stuff\n${USER_ZONE_CLOSE}\nMore`;
    expect(extractUserZone(content)).toBe('My custom stuff');
  });

  it('returns null for empty zone', () => {
    const content = `${USER_ZONE_OPEN}\n\n${USER_ZONE_CLOSE}`;
    expect(extractUserZone(content)).toBeNull();
  });

  it('returns null when no zone markers', () => {
    expect(extractUserZone('just text')).toBeNull();
  });
});
