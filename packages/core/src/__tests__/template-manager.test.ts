import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseVariables, resolveIncludes } from '../prompts/parser.js';
import { TemplateManager } from '../prompts/template-manager.js';

// ─── parseVariables ───────────────────────────────────────────────────

describe('parseVariables', () => {
  it('extracts required variable', () => {
    const vars = parseVariables('Hello {{name}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toEqual({ name: 'name', required: true, defaultValue: undefined });
  });

  it('extracts variable with default', () => {
    const vars = parseVariables('Hello {{name:World}}');
    expect(vars).toHaveLength(1);
    expect(vars[0]).toEqual({ name: 'name', required: false, defaultValue: 'World' });
  });

  it('extracts multiple unique variables', () => {
    const vars = parseVariables('{{greeting}} {{name}}, welcome to {{place}}');
    expect(vars).toHaveLength(3);
    expect(vars.map((v) => v.name)).toEqual(['greeting', 'name', 'place']);
  });

  it('deduplicates same variable', () => {
    const vars = parseVariables('{{name}} and {{name}} again');
    expect(vars).toHaveLength(1);
  });

  it('handles empty default', () => {
    const vars = parseVariables('{{opt:}}');
    expect(vars[0]).toEqual({ name: 'opt', required: false, defaultValue: '' });
  });

  it('returns empty for no variables', () => {
    expect(parseVariables('plain text')).toEqual([]);
  });

  it('handles mixed required and optional', () => {
    const vars = parseVariables('{{required}} and {{optional:fallback}}');
    expect(vars).toHaveLength(2);
    expect(vars[0].required).toBe(true);
    expect(vars[1].required).toBe(false);
    expect(vars[1].defaultValue).toBe('fallback');
  });
});

// ─── resolveIncludes ──────────────────────────────────────────────────

describe('resolveIncludes', () => {
  it('resolves single include', () => {
    const result = resolveIncludes('before @include(header) after', (name) => {
      if (name === 'header') return 'HEADER';
      return '';
    });
    expect(result).toBe('before HEADER after');
  });

  it('resolves nested includes', () => {
    const result = resolveIncludes('start @include(a)', (name) => {
      if (name === 'a') return 'A @include(b)';
      if (name === 'b') return 'B';
      return '';
    });
    expect(result).toBe('start A B');
  });

  it('detects circular includes', () => {
    expect(() =>
      resolveIncludes('@include(a)', (name) => {
        if (name === 'a') return '@include(b)';
        if (name === 'b') return '@include(a)';
        return '';
      }),
    ).toThrow(/Circular include detected/);
  });

  it('throws on depth exceeding 10', () => {
    // Each level includes a unique name so cycle detection doesn't fire
    let counter = 0;
    expect(() =>
      resolveIncludes('@include(level0)', (name) => {
        counter++;
        return `@include(level${counter})`;
      }),
    ).toThrow(/Include depth exceeded/);
  });

  it('handles no includes', () => {
    const result = resolveIncludes('no includes here', () => '');
    expect(result).toBe('no includes here');
  });

  it('handles multiple includes', () => {
    const result = resolveIncludes('@include(a) + @include(b)', (name) => name.toUpperCase());
    expect(result).toBe('A + B');
  });
});

// ─── TemplateManager ──────────────────────────────────────────────────

describe('TemplateManager', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `templates-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('loads .prompt files from directory', () => {
    writeFileSync(join(tempDir, 'greeting.prompt'), 'Hello {{name}}!');
    writeFileSync(join(tempDir, 'farewell.prompt'), 'Goodbye {{name}}.');
    writeFileSync(join(tempDir, 'not-a-template.txt'), 'ignored');

    const mgr = new TemplateManager(tempDir);
    mgr.load();

    expect(mgr.listTemplates().sort()).toEqual(['farewell', 'greeting']);
  });

  it('handles nonexistent directory gracefully', () => {
    const mgr = new TemplateManager('/nonexistent/path');
    mgr.load(); // should not throw
    expect(mgr.listTemplates()).toEqual([]);
  });

  it('renders template with variables', () => {
    writeFileSync(join(tempDir, 'hello.prompt'), 'Hello {{name}}, you are {{role}}!');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    const result = mgr.render('hello', { name: 'Atlas', role: 'advisor' });
    expect(result).toBe('Hello Atlas, you are advisor!');
  });

  it('uses default values', () => {
    writeFileSync(join(tempDir, 'hello.prompt'), 'Hello {{name:World}}!');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    expect(mgr.render('hello', {})).toBe('Hello World!');
    expect(mgr.render('hello', { name: 'Custom' })).toBe('Hello Custom!');
  });

  it('throws on missing required variable in strict mode', () => {
    writeFileSync(join(tempDir, 'strict.prompt'), '{{required}}');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    expect(() => mgr.render('strict', {})).toThrow(/Missing required variable: required/);
  });

  it('leaves placeholder in non-strict mode', () => {
    writeFileSync(join(tempDir, 'lax.prompt'), 'Hello {{name}}!');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    const result = mgr.render('lax', {}, { strict: false });
    expect(result).toBe('Hello {{name}}!');
  });

  it('resolves @include directives', () => {
    writeFileSync(join(tempDir, 'header.prompt'), '--- HEADER ---');
    writeFileSync(join(tempDir, 'page.prompt'), '@include(header)\nContent here.');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    const result = mgr.render('page', {});
    expect(result).toBe('--- HEADER ---\nContent here.');
  });

  it('throws on missing include', () => {
    writeFileSync(join(tempDir, 'broken.prompt'), '@include(nonexistent)');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    expect(() => mgr.render('broken', {})).toThrow(/Include not found: nonexistent/);
  });

  it('throws on nonexistent template name', () => {
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    expect(() => mgr.render('missing', {})).toThrow(/Template not found: missing/);
  });

  it('getTemplate returns raw template', () => {
    writeFileSync(join(tempDir, 'raw.prompt'), 'Raw {{content}}');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    const tmpl = mgr.getTemplate('raw');
    expect(tmpl).not.toBeNull();
    expect(tmpl!.name).toBe('raw');
    expect(tmpl!.content).toBe('Raw {{content}}');
    expect(tmpl!.variables).toHaveLength(1);
  });

  it('getTemplate returns null for nonexistent', () => {
    const mgr = new TemplateManager(tempDir);
    mgr.load();
    expect(mgr.getTemplate('nope')).toBeNull();
  });

  it('variables in included templates get substituted', () => {
    writeFileSync(join(tempDir, 'partial.prompt'), 'I am {{name}}');
    writeFileSync(join(tempDir, 'main.prompt'), 'Hello: @include(partial)!');
    const mgr = new TemplateManager(tempDir);
    mgr.load();

    const result = mgr.render('main', { name: 'Atlas' });
    expect(result).toBe('Hello: I am Atlas!');
  });
});
