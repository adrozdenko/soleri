import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  injectCLAUDEmd,
  removeCLAUDEmd,
  hasCLAUDEmdBlock,
  extractUserZone,
} from './inject.js';
import {
  OPEN_MARKER,
  CLOSE_MARKER,
  USER_ZONE_OPEN,
  USER_ZONE_CLOSE,
} from './compose.js';

function block(content: string): string {
  return `${OPEN_MARKER}\n${content}\n${CLOSE_MARKER}`;
}

describe('extractUserZone', () => {
  it('returns trimmed inner content', () => {
    const input = `prefix\n${USER_ZONE_OPEN}\n  hello world  \n${USER_ZONE_CLOSE}\nsuffix`;
    expect(extractUserZone(input)).toBe('hello world');
  });

  it('returns null when zone is empty', () => {
    expect(extractUserZone(`${USER_ZONE_OPEN}\n  \n${USER_ZONE_CLOSE}`)).toBeNull();
  });

  it('returns null when no open marker', () => {
    expect(extractUserZone(`no markers here ${USER_ZONE_CLOSE}`)).toBeNull();
  });

  it('returns null when close marker precedes open', () => {
    expect(extractUserZone(`${USER_ZONE_CLOSE} before ${USER_ZONE_OPEN}`)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractUserZone('')).toBeNull();
  });
});

describe('injectCLAUDEmd', () => {
  let dir: string;
  let fp: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'inject-'));
    fp = join(dir, 'CLAUDE.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a new file when none exists', () => {
    const res = injectCLAUDEmd(fp, block('new'));
    expect(res).toEqual({ success: true, action: 'injected', message: expect.any(String) });
    expect(readFileSync(fp, 'utf-8')).toContain('new');
  });

  it('appends block to existing file without markers', () => {
    writeFileSync(fp, '# Existing\n');
    const res = injectCLAUDEmd(fp, block('appended'));
    expect(res.action).toBe('injected');
    const content = readFileSync(fp, 'utf-8');
    expect(content).toContain('# Existing');
    expect(content).toContain('appended');
  });

  it('replaces existing block and reports diff', () => {
    writeFileSync(fp, `before\n${block('old')}\nafter`);
    const res = injectCLAUDEmd(fp, block('new'));
    expect(res.action).toBe('replaced');
    expect(res.diffDetected).toBe(true);
    const content = readFileSync(fp, 'utf-8');
    expect(content).toContain('new');
    expect(content).not.toContain('old');
    expect(content).toContain('before');
    expect(content).toContain('after');
  });

  it('skips write when block is identical', () => {
    const b = block('same');
    writeFileSync(fp, b);
    const res = injectCLAUDEmd(fp, b);
    expect(res.action).toBe('skipped');
    expect(res.diffDetected).toBe(false);
  });

  it('preserves user zone content on replacement', () => {
    const existing =
      `${OPEN_MARKER}\n` +
      `${USER_ZONE_OPEN}\nmy custom stuff\n${USER_ZONE_CLOSE}\n` +
      `${CLOSE_MARKER}`;
    writeFileSync(fp, existing);

    const newBlock =
      `${OPEN_MARKER}\nupdated body\n` +
      `${USER_ZONE_OPEN}\n\n${USER_ZONE_CLOSE}\n` +
      `${CLOSE_MARKER}`;
    const res = injectCLAUDEmd(fp, newBlock);
    expect(res.success).toBe(true);
    expect(readFileSync(fp, 'utf-8')).toContain('my custom stuff');
  });

  it('migrates legacy <!-- agent:mode --> markers', () => {
    writeFileSync(fp, '<!-- agent:mode -->\nlegacy\n<!-- /agent:mode -->');
    const res = injectCLAUDEmd(fp, block('migrated'));
    expect(res.action).toBe('replaced');
    const content = readFileSync(fp, 'utf-8');
    expect(content).toContain(OPEN_MARKER);
    expect(content).not.toContain('legacy');
  });

  it('migrates legacy <!-- salvador:mode --> markers', () => {
    writeFileSync(fp, '<!-- salvador:mode -->\nold sal\n<!-- /salvador:mode -->');
    const res = injectCLAUDEmd(fp, block('new engine'));
    expect(res.action).toBe('replaced');
    expect(readFileSync(fp, 'utf-8')).toContain('new engine');
  });

  it('returns error result on write failure', () => {
    // Point to a directory — writeFileSync will fail
    const res = injectCLAUDEmd(dir, block('fail'));
    expect(res.success).toBe(false);
    expect(res.action).toBe('error');
    expect(res.message).toContain('Injection failed');
  });
});

describe('removeCLAUDEmd', () => {
  let dir: string;
  let fp: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'remove-'));
    fp = join(dir, 'CLAUDE.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes block and keeps surrounding text', () => {
    writeFileSync(fp, `# Head\n\n${block('body')}\n\n# Foot\n`);
    const res = removeCLAUDEmd(fp);
    expect(res.action).toBe('removed');
    const content = readFileSync(fp, 'utf-8');
    expect(content).toContain('# Head');
    expect(content).toContain('# Foot');
    expect(content).not.toContain(OPEN_MARKER);
  });

  it('returns not_present when file has no block', () => {
    writeFileSync(fp, 'plain text');
    expect(removeCLAUDEmd(fp).action).toBe('not_present');
  });

  it('returns not_present when file does not exist', () => {
    expect(removeCLAUDEmd(fp).action).toBe('not_present');
  });

  it('removes legacy markers too', () => {
    writeFileSync(fp, '<!-- agent:mode -->\nold\n<!-- /agent:mode -->');
    const res = removeCLAUDEmd(fp);
    expect(res.action).toBe('removed');
    expect(readFileSync(fp, 'utf-8')).not.toContain('old');
  });

  it('returns error on write failure', () => {
    const res = removeCLAUDEmd(join(dir, 'nonexistent-dir', 'file.md'));
    // file does not exist so returns not_present (not an error)
    expect(res.action).toBe('not_present');
  });
});

describe('hasCLAUDEmdBlock', () => {
  let dir: string;
  let fp: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'has-'));
    fp = join(dir, 'CLAUDE.md');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns true when current markers present', () => {
    writeFileSync(fp, block('content'));
    expect(hasCLAUDEmdBlock(fp)).toBe(true);
  });

  it('returns true for legacy markers', () => {
    writeFileSync(fp, '<!-- agent:mode -->\nx\n<!-- /agent:mode -->');
    expect(hasCLAUDEmdBlock(fp)).toBe(true);
  });

  it('returns false for plain file', () => {
    writeFileSync(fp, 'no markers');
    expect(hasCLAUDEmdBlock(fp)).toBe(false);
  });

  it('returns false for missing file', () => {
    expect(hasCLAUDEmdBlock(join(dir, 'nope.md'))).toBe(false);
  });
});
