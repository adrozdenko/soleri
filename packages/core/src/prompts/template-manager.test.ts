import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TemplateManager } from './template-manager.js';

describe('TemplateManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `tmpl-mgr-colocated-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns empty list before load is called', () => {
    const mgr = new TemplateManager(tempDir);
    expect(mgr.listTemplates()).toEqual([]);
  });

  it('loads only .prompt files, ignoring others', () => {
    writeFileSync(join(tempDir, 'a.prompt'), 'content a');
    writeFileSync(join(tempDir, 'b.txt'), 'content b');
    writeFileSync(join(tempDir, 'c.md'), 'content c');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.listTemplates()).toEqual(['a']);
  });

  it('handles nonexistent directory without throwing', () => {
    const mgr = new TemplateManager('/nonexistent/dir/xyz');
    mgr.load();
    expect(mgr.listTemplates()).toEqual([]);
  });

  it('renders template substituting all variables', () => {
    writeFileSync(join(tempDir, 'greet.prompt'), '{{greeting}}, {{name}}!');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.render('greet', { greeting: 'Hello', name: 'World' })).toBe('Hello, World!');
  });

  it('applies default values when variable not provided', () => {
    writeFileSync(join(tempDir, 'def.prompt'), '{{x:fallback}} {{y}}');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.render('def', { y: 'val' })).toBe('fallback val');
  });

  it('throws on missing required variable in strict mode', () => {
    writeFileSync(join(tempDir, 's.prompt'), '{{required}}');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(() => mgr.render('s', {})).toThrow(/Missing required variable: required/);
  });

  it('leaves placeholder in non-strict mode for missing variable', () => {
    writeFileSync(join(tempDir, 'ns.prompt'), 'Hello {{name}}!');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.render('ns', {}, { strict: false })).toBe('Hello {{name}}!');
  });

  it('throws when rendering a nonexistent template', () => {
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(() => mgr.render('missing', {})).toThrow(/Template not found: missing/);
  });

  it('resolves @include directives across templates', () => {
    writeFileSync(join(tempDir, 'header.prompt'), '=HEADER=');
    writeFileSync(join(tempDir, 'page.prompt'), '@include(header)\nBody');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.render('page', {})).toBe('=HEADER=\nBody');
  });

  it('throws on @include referencing nonexistent partial', () => {
    writeFileSync(join(tempDir, 'bad.prompt'), '@include(nope)');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(() => mgr.render('bad', {})).toThrow(/Include not found: nope/);
  });

  it('getTemplate returns template metadata or null', () => {
    writeFileSync(join(tempDir, 'meta.prompt'), '{{v}}');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    const t = mgr.getTemplate('meta');
    expect(t).not.toBeNull();
    expect(t!.name).toBe('meta');
    expect(t!.variables).toHaveLength(1);
    expect(t!.variables[0].name).toBe('v');

    expect(mgr.getTemplate('nonexistent')).toBeNull();
  });

  it('substitutes variables inside included partials', () => {
    writeFileSync(join(tempDir, 'part.prompt'), 'I am {{who}}');
    writeFileSync(join(tempDir, 'main.prompt'), 'Say: @include(part).');
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.render('main', { who: 'Atlas' })).toBe('Say: I am Atlas.');
  });
});
