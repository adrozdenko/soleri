/**
 * Component code validator — checks for design system violations.
 *
 * Ported from Salvador MCP src/tools/validate-component-code.ts with improvements:
 * - Pure function (no intelligence singleton dependency)
 * - Configurable violation patterns
 * - Deduplication built-in
 */

export interface Violation {
  type: string;
  severity: 'error' | 'warning' | 'info';
  pattern: string;
  issue: string;
  fix: string;
  found: string;
  line?: number;
  column?: number;
  autoFix?: string;
}

export interface ViolationPattern {
  pattern: string;
  issue: string;
  fix: string;
  severity?: 'error' | 'warning' | 'info';
  autoFix?: string;
}

export interface ValidationResult {
  valid: boolean;
  score: number;
  grade: string;
  violations: Violation[];
  counts: { errors: number; warnings: number; infos: number };
  summary: string;
}

const SEVERITY_WEIGHTS = { error: 15, warning: 5, info: 1 };

function findLocation(
  code: string,
  _found: string,
  index: number,
): { line: number; column: number } {
  const before = code.slice(0, index);
  const line = (before.match(/\n/g) || []).length + 1;
  const lastNewline = before.lastIndexOf('\n');
  const column = index - lastNewline;
  return { line, column };
}

// ---------------------------------------------------------------------------
// Violation checkers
// ---------------------------------------------------------------------------

export function checkPatternViolations(code: string, patterns: ViolationPattern[]): Violation[] {
  const violations: Violation[] = [];
  for (const v of patterns) {
    try {
      const regex = new RegExp(v.pattern, 'g');
      let match;
      while ((match = regex.exec(code)) !== null) {
        const loc = findLocation(code, match[0], match.index);
        violations.push({
          type: 'token-violation',
          severity: v.severity || 'error',
          pattern: v.pattern,
          issue: v.issue,
          fix: v.fix,
          found: match[0],
          line: loc.line,
          column: loc.column,
          autoFix: v.autoFix,
        });
      }
    } catch {
      // Invalid regex — skip
    }
  }
  return violations;
}

export function checkSpacingViolations(code: string): Violation[] {
  const violations: Violation[] = [];
  const pattern =
    /(?:gap|p|m|px|py|mx|my|mt|mb|ml|mr|pt|pb|pl|pr|space-[xy])-\[\d+(?:px|rem|em)\]/g;
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const loc = findLocation(code, match[0], match.index);
    violations.push({
      type: 'spacing-violation',
      severity: 'error',
      pattern: 'Arbitrary spacing values',
      issue: 'Off-grid spacing — values must be from the scale: 4-8-12-16-20-24-32-40-48',
      fix: 'Use Tailwind spacing tokens (gap-1 to gap-12, p-1 to p-12)',
      found: match[0],
      line: loc.line,
      column: loc.column,
    });
  }
  return violations;
}

export function checkTypographyViolations(code: string): Violation[] {
  const violations: Violation[] = [];

  const textSizePattern = /text-\[\d+(?:px|rem|em)\]/g;
  let match;
  while ((match = textSizePattern.exec(code)) !== null) {
    const loc = findLocation(code, match[0], match.index);
    violations.push({
      type: 'typography-violation',
      severity: 'error',
      pattern: 'Arbitrary text size',
      issue: 'Breaking typography scale',
      fix: 'Use text-xs, text-sm, text-base, text-lg, text-xl, text-2xl, text-3xl',
      found: match[0],
      line: loc.line,
      column: loc.column,
    });
  }

  const fontWeightPattern = /font-\[\d+\]/g;
  while ((match = fontWeightPattern.exec(code)) !== null) {
    const loc = findLocation(code, match[0], match.index);
    violations.push({
      type: 'typography-violation',
      severity: 'error',
      pattern: 'Arbitrary font weight',
      issue: 'Breaking font weight scale',
      fix: 'Use font-normal (400), font-medium (500), font-semibold (600), font-bold (700)',
      found: match[0],
      line: loc.line,
      column: loc.column,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main validator
// ---------------------------------------------------------------------------

export function validateComponentCode(
  code: string,
  options: {
    checkType?: 'all' | 'tokens' | 'spacing' | 'typography' | 'accessibility';
    commonViolations?: ViolationPattern[];
    forbiddenTokens?: ViolationPattern[];
    accessibilityViolations?: ViolationPattern[];
  } = {},
): ValidationResult {
  const {
    checkType = 'all',
    commonViolations = [],
    forbiddenTokens = [],
    accessibilityViolations = [],
  } = options;
  const allViolations: Violation[] = [];

  if (checkType === 'all' || checkType === 'tokens') {
    allViolations.push(...checkPatternViolations(code, commonViolations));
    allViolations.push(...checkPatternViolations(code, forbiddenTokens));
  }
  if (checkType === 'all' || checkType === 'spacing') {
    allViolations.push(...checkSpacingViolations(code));
  }
  if (checkType === 'all' || checkType === 'typography') {
    allViolations.push(...checkTypographyViolations(code));
  }
  if (checkType === 'all' || checkType === 'accessibility') {
    allViolations.push(...checkPatternViolations(code, accessibilityViolations));
  }

  // Deduplicate
  const seen = new Set<string>();
  const violations = allViolations.filter((v) => {
    const key = `${v.pattern}:${v.line}:${v.found}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  violations.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return order[a.severity] - order[b.severity] || (a.line ?? 0) - (b.line ?? 0);
  });

  const counts = {
    errors: violations.filter((v) => v.severity === 'error').length,
    warnings: violations.filter((v) => v.severity === 'warning').length,
    infos: violations.filter((v) => v.severity === 'info').length,
  };

  const penalty = violations.reduce((sum, v) => sum + SEVERITY_WEIGHTS[v.severity], 0);
  const score = Math.max(0, 100 - penalty);

  const grade =
    score >= 95
      ? 'A+'
      : score >= 90
        ? 'A'
        : score >= 85
          ? 'A-'
          : score >= 80
            ? 'B+'
            : score >= 75
              ? 'B'
              : score >= 70
                ? 'B-'
                : score >= 65
                  ? 'C+'
                  : score >= 60
                    ? 'C'
                    : score >= 55
                      ? 'C-'
                      : score >= 50
                        ? 'D'
                        : 'F';

  return {
    valid: counts.errors === 0,
    score,
    grade,
    violations,
    counts,
    summary:
      violations.length === 0
        ? 'No violations found'
        : `Found ${counts.errors} error(s), ${counts.warnings} warning(s), ${counts.infos} info(s)`,
  };
}
