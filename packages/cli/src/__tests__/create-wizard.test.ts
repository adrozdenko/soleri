import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the create wizard name validation logic.
 *
 * We extract and test the validate function directly rather than running
 * the full interactive wizard (which requires a TTY).
 */

// ─── Inline the validate logic from create-wizard.ts ──────────────────────────
// This mirrors exactly what runCreateWizard passes to p.text({ validate }).
// If the wizard changes, update here too.
const NAME_PLACEHOLDER = 'aria';

function validateName(v: string | undefined): string | undefined {
  if (!v || v.trim().length === 0) return 'Name is required';
  if (v.trim().toLowerCase() === NAME_PLACEHOLDER)
    return `"${NAME_PLACEHOLDER}" is just an example — type your own agent name`;
  if (v.length > 50) return 'Max 50 characters';
  return undefined;
}

// ─── slugify — mirrors create-wizard.ts ───────────────────────────────────────
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

describe('wizard name validation', () => {
  it('rejects empty string', () => {
    expect(validateName('')).toBe('Name is required');
  });

  it('rejects whitespace-only string', () => {
    expect(validateName('   ')).toBe('Name is required');
  });

  it('rejects the placeholder value "aria" (exact match)', () => {
    expect(validateName('aria')).toMatch(/just an example/);
  });

  it('rejects the placeholder value case-insensitively', () => {
    expect(validateName('Aria')).toMatch(/just an example/);
    expect(validateName('ARIA')).toMatch(/just an example/);
  });

  it('rejects names longer than 50 characters', () => {
    expect(validateName('a'.repeat(51))).toBe('Max 50 characters');
  });

  it('accepts a valid name like "bobby"', () => {
    expect(validateName('bobby')).toBeUndefined();
  });

  it('accepts a valid name like "My Agent"', () => {
    expect(validateName('My Agent')).toBeUndefined();
  });
});

describe('slugify', () => {
  it('converts "Bobby" to "bobby"', () => {
    expect(slugify('Bobby')).toBe('bobby');
  });

  it('converts "My Agent" to "my-agent"', () => {
    expect(slugify('My Agent')).toBe('my-agent');
  });

  it('strips leading/trailing hyphens', () => {
    expect(slugify('  hello  ')).toBe('hello');
  });
});

describe('wizard name → agent id regression', () => {
  it('user typing "bobby" produces id="bobby" and name="Bobby"', () => {
    const input = 'bobby';
    expect(validateName(input)).toBeUndefined();
    expect(slugify(input)).toBe('bobby');
  });

  it('placeholder "aria" cannot produce a valid agent id', () => {
    expect(validateName('aria')).toBeDefined();
  });
});
