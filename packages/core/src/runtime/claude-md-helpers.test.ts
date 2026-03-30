/**
 * Colocated unit tests for claude-md-helpers.ts — pure functions, no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
  hasSections,
  removeSections,
  injectAtPosition,
  wrapInMarkers,
  composeAgentModeSection,
  composeIntegrationSection,
  buildInjectionContent,
  injectEngineRulesBlock,
  removeEngineRulesFromGlobal,
} from './claude-md-helpers.js';
import type { AgentRuntimeConfig } from './types.js';

const AGENT_ID = 'mybot';
const CONFIG = { agentId: AGENT_ID } as AgentRuntimeConfig;

describe('hasSections', () => {
  it('detects both start and end markers', () => {
    const content = `before\n<!-- agent:${AGENT_ID}:mode -->\nstuff\n<!-- /agent:${AGENT_ID}:mode -->\nafter`;
    expect(hasSections(content, AGENT_ID)).toBe(true);
  });

  it('returns false if only start marker present', () => {
    expect(hasSections(`<!-- agent:${AGENT_ID}:mode -->`, AGENT_ID)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasSections('', AGENT_ID)).toBe(false);
  });
});

describe('removeSections', () => {
  it('removes section and trims surrounding whitespace', () => {
    const content = `# Title\n\n<!-- agent:${AGENT_ID}:mode -->\nINJECTED\n<!-- /agent:${AGENT_ID}:mode -->\n\n## Footer`;
    const result = removeSections(content, AGENT_ID);
    expect(result).not.toContain('INJECTED');
    expect(result).toContain('# Title');
    expect(result).toContain('## Footer');
  });

  it('handles section at end of file', () => {
    const content = `# Title\n\n<!-- agent:${AGENT_ID}:mode -->\ncontent\n<!-- /agent:${AGENT_ID}:mode -->`;
    const result = removeSections(content, AGENT_ID);
    expect(result).toContain('# Title');
    expect(result).not.toContain('content');
    expect(result.endsWith('\n')).toBe(true);
  });

  it('returns content unchanged when markers for different agent', () => {
    const content = '<!-- agent:other:mode -->\nstuff\n<!-- /agent:other:mode -->';
    expect(removeSections(content, AGENT_ID)).toBe(content);
  });
});

describe('injectAtPosition', () => {
  it('start: prepends section', () => {
    const result = injectAtPosition('existing', 'NEW', 'start');
    expect(result).toBe('NEW\n\nexisting');
  });

  it('end: appends section with trailing newline', () => {
    const result = injectAtPosition('existing', 'NEW', 'end');
    expect(result).toBe('existing\n\nNEW\n');
  });

  it('after-title: places section after first heading and blank lines', () => {
    const content = '# Title\n\nParagraph';
    const result = injectAtPosition(content, 'SECTION', 'after-title');
    const idx = result.indexOf('SECTION');
    expect(idx).toBeGreaterThan(result.indexOf('# Title'));
    expect(idx).toBeLessThan(result.indexOf('Paragraph'));
  });

  it('after-title: handles multiple headings (picks first #)', () => {
    const content = '# First\n## Second\nText';
    const result = injectAtPosition(content, 'INJECTED', 'after-title');
    expect(result.indexOf('INJECTED')).toBeGreaterThan(result.indexOf('# First'));
  });

  it('after-title: falls back to start when no heading exists', () => {
    const result = injectAtPosition('just text', 'SECTION', 'after-title');
    expect(result.startsWith('SECTION')).toBe(true);
  });
});

describe('wrapInMarkers', () => {
  it('wraps content between start and end markers', () => {
    const result = wrapInMarkers(AGENT_ID, 'hello');
    expect(result).toBe(`<!-- agent:${AGENT_ID}:mode -->\nhello\n<!-- /agent:${AGENT_ID}:mode -->`);
  });

  it('handles multi-line content', () => {
    const result = wrapInMarkers(AGENT_ID, 'line1\nline2');
    expect(result).toContain('line1\nline2');
  });
});

describe('composeAgentModeSection', () => {
  it('capitalizes agent name in heading', () => {
    const result = composeAgentModeSection(CONFIG);
    expect(result).toContain('## Mybot Mode');
  });

  it('includes activate and deactivate commands', () => {
    const result = composeAgentModeSection(CONFIG);
    expect(result).toContain('mybot_core op:activate params:{ projectPath: "." }');
    expect(result).toContain('deactivate: true');
  });
});

describe('composeIntegrationSection', () => {
  it('renders default facades when none provided', () => {
    const result = composeIntegrationSection(CONFIG);
    expect(result).toContain('mybot_vault');
    expect(result).toContain('mybot_plan');
    expect(result).toContain('mybot_brain');
    expect(result).toContain('mybot_memory');
    expect(result).toContain('mybot_admin');
    expect(result).toContain('mybot_curator');
  });

  it('renders provided facades with up to 5 ops', () => {
    const facades = [{ name: 'mybot_custom', ops: ['a', 'b', 'c', 'd', 'e', 'f'] }];
    const result = composeIntegrationSection(CONFIG, facades);
    expect(result).toContain('`mybot_custom`');
    expect(result).toContain('`a`');
    expect(result).toContain('`e`');
    expect(result).toContain(', ...');
    expect(result).not.toContain('`f`');
  });

  it('renders session start command', () => {
    const result = composeIntegrationSection(CONFIG);
    expect(result).toContain('mybot_core op:session_start');
  });
});

describe('buildInjectionContent', () => {
  it('includes both mode and integration by default', () => {
    const result = buildInjectionContent(CONFIG);
    expect(result).toContain('Mode');
    expect(result).toContain('Integration');
    expect(result).toContain(`<!-- agent:${AGENT_ID}:mode -->`);
  });

  it('excludes integration when option disabled', () => {
    const result = buildInjectionContent(CONFIG, { includeIntegration: false });
    expect(result).toContain('Mode');
    expect(result).not.toContain('Integration');
  });

  it('passes facades to integration section', () => {
    const result = buildInjectionContent(CONFIG, {
      facades: [{ name: 'mybot_x', ops: ['op1'] }],
    });
    expect(result).toContain('mybot_x');
  });
});

describe('injectEngineRulesBlock', () => {
  const RULES_START = '<!-- soleri:engine-rules -->';
  const RULES_END = '<!-- /soleri:engine-rules -->';

  it('appends engine rules when none exist', () => {
    const result = injectEngineRulesBlock('# Agent\n\nContent', 'NEW_RULES');
    expect(result).toContain('NEW_RULES');
    expect(result.indexOf('Content')).toBeLessThan(result.indexOf('NEW_RULES'));
  });

  it('replaces existing engine rules block', () => {
    const existing = `# Agent\n\n${RULES_START}\nOLD\n${RULES_END}\n\nFooter`;
    const result = injectEngineRulesBlock(existing, 'UPDATED');
    expect(result).toContain('UPDATED');
    expect(result).not.toContain('OLD');
    expect(result).toContain('Footer');
  });

  it('preserves content before and after when replacing', () => {
    const existing = `BEFORE\n${RULES_START}\nMIDDLE\n${RULES_END}\nAFTER`;
    const result = injectEngineRulesBlock(existing, 'REPLACED');
    expect(result).toContain('BEFORE');
    expect(result).toContain('AFTER');
    expect(result).toContain('REPLACED');
  });

  it('handles empty content by appending rules', () => {
    const result = injectEngineRulesBlock('', 'RULES');
    expect(result).toContain('RULES');
  });

  it('is idempotent — double injection replaces cleanly', () => {
    const first = injectEngineRulesBlock('# File', `${RULES_START}\nV1\n${RULES_END}`);
    const second = injectEngineRulesBlock(first, `${RULES_START}\nV2\n${RULES_END}`);
    expect(second).toContain('V2');
    expect(second).not.toContain('V1');
    // Should have exactly one start marker
    const startCount = (second.match(/<!-- soleri:engine-rules -->/g) || []).length;
    expect(startCount).toBe(1);
  });
});

describe('removeEngineRulesFromGlobal', () => {
  const RULES_START = '<!-- soleri:engine-rules -->';
  const RULES_END = '<!-- /soleri:engine-rules -->';

  it('returns unchanged content when no engine rules present', () => {
    const content = '# Global CLAUDE.md\n\nSome user content.';
    const { cleaned, removed } = removeEngineRulesFromGlobal(content);
    expect(removed).toBe(false);
    expect(cleaned).toBe(content);
  });

  it('removes engine rules block from content', () => {
    const content = `# Global\n\n${RULES_START}\nEngine rules here\n${RULES_END}\n\nUser content`;
    const { cleaned, removed } = removeEngineRulesFromGlobal(content);
    expect(removed).toBe(true);
    expect(cleaned).not.toContain('Engine rules here');
    expect(cleaned).not.toContain(RULES_START);
    expect(cleaned).not.toContain(RULES_END);
    expect(cleaned).toContain('# Global');
    expect(cleaned).toContain('User content');
  });

  it('handles engine rules at end of file', () => {
    const content = `# Global\n\n${RULES_START}\nRules\n${RULES_END}`;
    const { cleaned, removed } = removeEngineRulesFromGlobal(content);
    expect(removed).toBe(true);
    expect(cleaned).toContain('# Global');
    expect(cleaned).not.toContain('Rules');
  });

  it('handles engine rules at start of file', () => {
    const content = `${RULES_START}\nRules\n${RULES_END}\n\n# Global`;
    const { cleaned, removed } = removeEngineRulesFromGlobal(content);
    expect(removed).toBe(true);
    expect(cleaned).toContain('# Global');
    expect(cleaned).not.toContain(RULES_START);
  });

  it('preserves agent blocks when removing engine rules', () => {
    const content = [
      '# Global',
      '',
      '<!-- agent:mybot:mode -->',
      'Agent content',
      '<!-- /agent:mybot:mode -->',
      '',
      RULES_START,
      'Engine rules',
      RULES_END,
    ].join('\n');
    const { cleaned, removed } = removeEngineRulesFromGlobal(content);
    expect(removed).toBe(true);
    expect(cleaned).toContain('<!-- agent:mybot:mode -->');
    expect(cleaned).toContain('Agent content');
    expect(cleaned).not.toContain('Engine rules');
  });

  it('returns non-empty string for content that is only engine rules', () => {
    const content = `${RULES_START}\nOnly rules\n${RULES_END}`;
    const { cleaned, removed } = removeEngineRulesFromGlobal(content);
    expect(removed).toBe(true);
    expect(cleaned.length).toBeGreaterThan(0);
  });
});
