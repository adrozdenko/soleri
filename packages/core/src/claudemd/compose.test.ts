import { describe, it, expect } from 'vitest';
import {
  composeCLAUDEmd,
  FORMAT_VERSION,
  OPEN_MARKER,
  CLOSE_MARKER,
  USER_ZONE_OPEN,
  USER_ZONE_CLOSE,
} from './compose.js';
import type { AgentMeta, FacadeInstructions } from './types.js';
import type { FacadeConfig } from '../facades/types.js';

const agent: AgentMeta = {
  id: 'alpha',
  name: 'Alpha',
  activationPhrase: 'Hello, Alpha!',
  deactivationPhrase: 'Goodbye, Alpha!',
  activateCommand: 'alpha_core op:activate',
  deactivateCommand: 'alpha_core op:deactivate',
};

const facades: FacadeConfig[] = [
  {
    name: 'alpha_core',
    description: 'Core',
    ops: [
      { name: 'health', description: 'h', auth: 'read', handler: async () => ({}) },
      { name: 'search', description: 's', auth: 'read', handler: async () => ({}) },
      { name: 'capture', description: 'c', auth: 'write', handler: async () => ({}) },
      { name: 'delete', description: 'd', auth: 'admin', handler: async () => ({}) },
      { name: 'list', description: 'l', auth: 'read', handler: async () => ({}) },
      { name: 'extra', description: 'e', auth: 'read', handler: async () => ({}) },
    ],
  },
];

describe('compose — constants', () => {
  it('markers contain version', () => {
    expect(OPEN_MARKER).toContain(`v${FORMAT_VERSION}`);
  });
});

describe('composeCLAUDEmd', () => {
  it('wraps output in open/close markers', () => {
    const result = composeCLAUDEmd(agent, facades);
    expect(result.startsWith(OPEN_MARKER)).toBe(true);
    expect(result.endsWith(CLOSE_MARKER)).toBe(true);
  });

  it('renders activation and deactivation commands', () => {
    const result = composeCLAUDEmd(agent, facades);
    expect(result).toContain('Hello, Alpha!');
    expect(result).toContain('Goodbye, Alpha!');
    expect(result).toContain('alpha_core op:activate');
    expect(result).toContain('alpha_core op:deactivate');
  });

  it('renders session start with agent id', () => {
    const result = composeCLAUDEmd(agent, facades);
    expect(result).toContain('alpha_core op:session_start');
    expect(result).toContain('On EVERY new session');
  });

  it('renders facade table with max 5 ops and ellipsis for extra', () => {
    const result = composeCLAUDEmd(agent, facades);
    expect(result).toContain('| `alpha_core` |');
    expect(result).toContain('`health`');
    // 6 ops but table shows max 5 + ellipsis
    expect(result).toContain('...');
  });

  it('renders all ops when facade has <= 5 ops', () => {
    const smallFacade: FacadeConfig[] = [
      {
        name: 'beta_core',
        description: 'Beta',
        ops: [
          { name: 'op1', description: 'o', auth: 'read', handler: async () => ({}) },
          { name: 'op2', description: 'o', auth: 'read', handler: async () => ({}) },
        ],
      },
    ];
    const result = composeCLAUDEmd(agent, smallFacade);
    expect(result).toContain('`op1`');
    expect(result).toContain('`op2`');
    expect(result).not.toContain('...');
  });

  it('uses keyOps from facadeInstructions when provided', () => {
    const instructions = new Map<string, FacadeInstructions>([
      [
        'alpha_core',
        {
          heading: 'Core Rules',
          keyOps: ['health', 'capture'],
        },
      ],
    ]);
    const result = composeCLAUDEmd(agent, facades, { facadeInstructions: instructions });
    // Only keyOps should appear in the table row
    expect(result).toContain('`health`');
    expect(result).toContain('`capture`');
    // 'search' is NOT a keyOp, so should not be in the table row for that facade
    const tableRow = result.split('\n').find((l) => l.includes('`alpha_core`'));
    expect(tableRow).not.toContain('`search`');
  });

  it('sorts global instructions by priority (low number = first)', () => {
    const ag: AgentMeta = {
      ...agent,
      globalInstructions: [
        { heading: 'Later', content: 'second', priority: 99 },
        { heading: 'First', content: 'first', priority: 1 },
        { heading: 'Middle', content: 'middle' }, // default 50
      ],
    };
    const result = composeCLAUDEmd(ag, facades);
    const firstIdx = result.indexOf('## First');
    const middleIdx = result.indexOf('## Middle');
    const laterIdx = result.indexOf('## Later');
    expect(firstIdx).toBeLessThan(middleIdx);
    expect(middleIdx).toBeLessThan(laterIdx);
  });

  it('renders facade behavioral rules sorted by priority', () => {
    const instructions = new Map<string, FacadeInstructions>([
      ['z_facade', { heading: 'Zed Rules', rules: ['Rule Z'], priority: 90 }],
      ['a_facade', { heading: 'Ace Rules', rules: ['Rule A'], priority: 10 }],
    ]);
    const result = composeCLAUDEmd(agent, facades, { facadeInstructions: instructions });
    expect(result.indexOf('## Ace Rules')).toBeLessThan(result.indexOf('## Zed Rules'));
  });

  it('renders facade rule templates', () => {
    const instructions = new Map<string, FacadeInstructions>([
      [
        'alpha_core',
        {
          heading: 'Templates',
          templates: { 'Example Plan': '```\nplan content\n```' },
        },
      ],
    ]);
    const result = composeCLAUDEmd(agent, facades, { facadeInstructions: instructions });
    expect(result).toContain('### Example Plan');
    expect(result).toContain('plan content');
  });

  it('includes user zone when includeUserZone is true', () => {
    const result = composeCLAUDEmd(agent, facades, { includeUserZone: true });
    expect(result).toContain(USER_ZONE_OPEN);
    expect(result).toContain(USER_ZONE_CLOSE);
  });

  it('omits user zone by default', () => {
    const result = composeCLAUDEmd(agent, facades);
    expect(result).not.toContain(USER_ZONE_OPEN);
  });

  it('handles empty facades array', () => {
    const result = composeCLAUDEmd(agent, []);
    expect(result).toContain('| Facade | Key Ops |');
    // No facade rows beyond the header
    expect(result).toContain(OPEN_MARKER);
    expect(result).toContain(CLOSE_MARKER);
  });

  it('handles agent with no globalInstructions', () => {
    const result = composeCLAUDEmd(agent, facades);
    // Should still produce valid output
    expect(result).toContain('## Alpha Mode');
  });
});
