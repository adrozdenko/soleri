/**
 * Tests for soleri-engine boot-time validation.
 */

import { describe, it, expect } from 'vitest';
import { validateAgentConfig } from './validate-agent-config.js';

describe('validateAgentConfig', () => {
  const yamlPath = '/fake/agent.yaml';

  it('passes with valid id and name', () => {
    expect(() => validateAgentConfig({ id: 'my-agent', name: 'My Agent' }, yamlPath)).not.toThrow();
  });

  it('throws when id is missing', () => {
    expect(() => validateAgentConfig({ name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when id is empty string', () => {
    expect(() => validateAgentConfig({ id: '', name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when id is whitespace-only', () => {
    expect(() => validateAgentConfig({ id: '  ', name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when id is not a string', () => {
    expect(() => validateAgentConfig({ id: 123, name: 'My Agent' }, yamlPath)).toThrow(
      "agent.yaml requires an 'id' field",
    );
  });

  it('throws when name is missing', () => {
    expect(() => validateAgentConfig({ id: 'my-agent' }, yamlPath)).toThrow(
      "agent.yaml requires a 'name' field",
    );
  });

  it('throws when name is empty string', () => {
    expect(() => validateAgentConfig({ id: 'my-agent', name: '' }, yamlPath)).toThrow(
      "agent.yaml requires a 'name' field",
    );
  });

  it('includes the yaml path in the error message', () => {
    expect(() => validateAgentConfig({}, yamlPath)).toThrow(yamlPath);
  });
});
