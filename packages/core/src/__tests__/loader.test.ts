import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadIntelligenceData } from '../intelligence/loader.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadIntelligenceData', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `loader-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should load valid entries from JSON files', () => {
    const bundle = {
      domain: 'testing',
      version: '1.0.0',
      entries: [
        {
          id: 'test-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Test Pattern',
          severity: 'warning',
          description: 'A test pattern.',
          tags: ['test'],
        },
      ],
    };
    writeFileSync(join(tempDir, 'testing.json'), JSON.stringify(bundle), 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('test-1');
  });

  it('should skip invalid entries', () => {
    const bundle = {
      domain: 'testing',
      version: '1.0.0',
      entries: [
        {
          id: '',
          type: 'pattern',
          title: '',
          severity: 'warning',
          description: 'Missing fields',
          tags: [],
        },
        {
          id: 'valid-1',
          type: 'pattern',
          domain: 'testing',
          title: 'Valid',
          severity: 'warning',
          description: 'Valid entry.',
          tags: ['a'],
        },
      ],
    };
    writeFileSync(join(tempDir, 'mixed.json'), JSON.stringify(bundle), 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe('valid-1');
  });

  it('should return empty array for missing directory', () => {
    const entries = loadIntelligenceData('/nonexistent/path');
    expect(entries).toEqual([]);
  });

  it('should skip non-JSON files', () => {
    writeFileSync(join(tempDir, 'readme.txt'), 'Not JSON', 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toEqual([]);
  });

  it('should handle malformed JSON gracefully', () => {
    writeFileSync(join(tempDir, 'bad.json'), '{not valid json', 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toEqual([]);
  });

  it('should handle bundle without entries array', () => {
    writeFileSync(
      join(tempDir, 'empty.json'),
      JSON.stringify({ domain: 'test', version: '1.0' }),
      'utf-8',
    );
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toEqual([]);
  });

  it('should load from multiple files', () => {
    const bundle1 = {
      domain: 'security',
      version: '1.0.0',
      entries: [
        {
          id: 'sec-1',
          type: 'pattern',
          domain: 'security',
          title: 'Security Pattern',
          severity: 'critical',
          description: 'A security pattern.',
          tags: ['security'],
        },
      ],
    };
    const bundle2 = {
      domain: 'performance',
      version: '1.0.0',
      entries: [
        {
          id: 'perf-1',
          type: 'rule',
          domain: 'performance',
          title: 'Performance Rule',
          severity: 'suggestion',
          description: 'A performance rule.',
          tags: ['perf'],
        },
      ],
    };
    writeFileSync(join(tempDir, 'security.json'), JSON.stringify(bundle1), 'utf-8');
    writeFileSync(join(tempDir, 'performance.json'), JSON.stringify(bundle2), 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toHaveLength(2);
  });

  it('should validate entry type field', () => {
    const bundle = {
      domain: 'testing',
      version: '1.0.0',
      entries: [
        {
          id: 'bad-type',
          type: 'invalid-type',
          domain: 'testing',
          title: 'Bad Type',
          severity: 'warning',
          description: 'Invalid type.',
          tags: [],
        },
      ],
    };
    writeFileSync(join(tempDir, 'bad-type.json'), JSON.stringify(bundle), 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toHaveLength(0);
  });

  it('should validate entry severity field', () => {
    const bundle = {
      domain: 'testing',
      version: '1.0.0',
      entries: [
        {
          id: 'bad-sev',
          type: 'pattern',
          domain: 'testing',
          title: 'Bad Severity',
          severity: 'invalid',
          description: 'Invalid severity.',
          tags: [],
        },
      ],
    };
    writeFileSync(join(tempDir, 'bad-sev.json'), JSON.stringify(bundle), 'utf-8');
    const entries = loadIntelligenceData(tempDir);
    expect(entries).toHaveLength(0);
  });
});
