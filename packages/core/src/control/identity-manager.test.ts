/**
 * IdentityManager — Contract tests for agent identity CRUD, guidelines,
 * versioning, rollback, and markdown rendering.
 *
 * Contract:
 *  - getIdentity() returns null for unknown agents
 *  - setIdentity() creates on first call, updates + versions on subsequent calls
 *  - addGuideline() / removeGuideline() / getGuidelines() manage guidelines with categories
 *  - getVersionHistory() returns snapshots ordered by version descending
 *  - rollback() restores a prior version, snapshots current state before restoring
 *  - renderIdentityMarkdown() produces human-readable markdown
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Vault } from '../vault/vault.js';
import { IdentityManager } from './identity-manager.js';
import type { GuidelineCategory } from './types.js';

describe('IdentityManager', () => {
  let vault: Vault;
  let manager: IdentityManager;

  beforeEach(() => {
    vault = new Vault(':memory:');
    manager = new IdentityManager(vault);
  });

  afterEach(() => {
    vault.close();
  });

  // ─── getIdentity / setIdentity ────────────────────────────────

  describe('identity CRUD', () => {
    it('returns null for unknown agent', () => {
      expect(manager.getIdentity('nonexistent')).toBeNull();
    });

    it('creates identity on first setIdentity call at version 1', () => {
      const identity = manager.setIdentity('agent-1', {
        name: 'Salvador',
        role: 'Design Advisor',
        description: 'A design system intelligence agent.',
        personality: ['artistic', 'perfectionist'],
      });

      expect(identity.agentId).toBe('agent-1');
      expect(identity.name).toBe('Salvador');
      expect(identity.role).toBe('Design Advisor');
      expect(identity.personality).toEqual(['artistic', 'perfectionist']);
      expect(identity.version).toBe(1);
      expect(identity.guidelines).toEqual([]);
    });

    it('updates identity and increments version', () => {
      manager.setIdentity('agent-1', { name: 'V1', role: 'First' });
      const updated = manager.setIdentity('agent-1', {
        name: 'V2',
        changedBy: 'test',
        changeReason: 'testing update',
      });

      expect(updated.name).toBe('V2');
      expect(updated.role).toBe('First'); // preserved from v1
      expect(updated.version).toBe(2);
    });

    it('defaults name to agentId when not provided', () => {
      const identity = manager.setIdentity('my-agent', {});
      expect(identity.name).toBe('my-agent');
    });

    it('preserves existing fields when partial update is given', () => {
      manager.setIdentity('agent-1', {
        name: 'Original',
        role: 'Architect',
        description: 'Builds things',
        personality: ['calm'],
      });

      const updated = manager.setIdentity('agent-1', { role: 'Engineer' });
      expect(updated.name).toBe('Original');
      expect(updated.role).toBe('Engineer');
      expect(updated.description).toBe('Builds things');
      expect(updated.personality).toEqual(['calm']);
    });
  });

  // ─── Guidelines ───────────────────────────────────────────────

  describe('guidelines', () => {
    beforeEach(() => {
      manager.setIdentity('agent-1', { name: 'Test Agent' });
    });

    it('adds a guideline and returns it with generated id', () => {
      const guideline = manager.addGuideline('agent-1', {
        category: 'behavior',
        text: 'Always check the vault first',
        priority: 10,
      });

      expect(guideline.id).toBeTruthy();
      expect(guideline.category).toBe('behavior');
      expect(guideline.text).toBe('Always check the vault first');
      expect(guideline.priority).toBe(10);
    });

    it('defaults priority to 0', () => {
      const guideline = manager.addGuideline('agent-1', {
        category: 'preference',
        text: 'Prefer semantic tokens',
      });
      expect(guideline.priority).toBe(0);
    });

    it('lists all guidelines for an agent', () => {
      manager.addGuideline('agent-1', { category: 'behavior', text: 'Rule A', priority: 5 });
      manager.addGuideline('agent-1', { category: 'restriction', text: 'Rule B', priority: 10 });

      const all = manager.getGuidelines('agent-1');
      expect(all.length).toBe(2);
    });

    it('filters guidelines by category', () => {
      manager.addGuideline('agent-1', { category: 'behavior', text: 'A' });
      manager.addGuideline('agent-1', { category: 'restriction', text: 'B' });
      manager.addGuideline('agent-1', { category: 'behavior', text: 'C' });

      const behaviors = manager.getGuidelines('agent-1', 'behavior');
      expect(behaviors.length).toBe(2);
      expect(behaviors.every((g) => g.category === 'behavior')).toBe(true);
    });

    it('orders guidelines by priority descending', () => {
      manager.addGuideline('agent-1', { category: 'behavior', text: 'Low', priority: 1 });
      manager.addGuideline('agent-1', { category: 'behavior', text: 'High', priority: 10 });

      const guidelines = manager.getGuidelines('agent-1', 'behavior');
      expect(guidelines[0].text).toBe('High');
      expect(guidelines[1].text).toBe('Low');
    });

    it('removes a guideline by id', () => {
      const g = manager.addGuideline('agent-1', { category: 'style', text: 'Remove me' });
      expect(manager.removeGuideline(g.id)).toBe(true);
      expect(manager.getGuidelines('agent-1').length).toBe(0);
    });

    it('returns false when removing nonexistent guideline', () => {
      expect(manager.removeGuideline('nonexistent-id')).toBe(false);
    });

    it('guidelines appear in getIdentity result', () => {
      manager.addGuideline('agent-1', { category: 'behavior', text: 'Check vault' });
      const identity = manager.getIdentity('agent-1');
      expect(identity!.guidelines.length).toBe(1);
      expect(identity!.guidelines[0].text).toBe('Check vault');
    });

    it('accepts all four category types', () => {
      const categories: GuidelineCategory[] = ['behavior', 'preference', 'restriction', 'style'];
      for (const cat of categories) {
        const g = manager.addGuideline('agent-1', { category: cat, text: `${cat} rule` });
        expect(g.category).toBe(cat);
      }
      expect(manager.getGuidelines('agent-1').length).toBe(4);
    });
  });

  // ─── Versioning ───────────────────────────────────────────────

  describe('versioning', () => {
    it('creates a version snapshot on update', () => {
      manager.setIdentity('agent-1', { name: 'V1', role: 'Role1' });
      manager.setIdentity('agent-1', { name: 'V2', changedBy: 'user', changeReason: 'rename' });

      const history = manager.getVersionHistory('agent-1');
      expect(history.length).toBe(1);
      expect(history[0].version).toBe(1);
      expect(history[0].changedBy).toBe('user');
      expect(history[0].changeReason).toBe('rename');

      const snapshot = JSON.parse(history[0].snapshot);
      expect(snapshot.name).toBe('V1');
      expect(snapshot.role).toBe('Role1');
    });

    it('returns empty history for fresh identity', () => {
      manager.setIdentity('agent-1', { name: 'Fresh' });
      expect(manager.getVersionHistory('agent-1')).toEqual([]);
    });

    it('respects limit parameter', () => {
      manager.setIdentity('agent-1', { name: 'V1' });
      manager.setIdentity('agent-1', { name: 'V2' });
      manager.setIdentity('agent-1', { name: 'V3' });
      manager.setIdentity('agent-1', { name: 'V4' });

      const limited = manager.getVersionHistory('agent-1', 2);
      expect(limited.length).toBe(2);
      // Ordered by version DESC
      expect(limited[0].version).toBeGreaterThan(limited[1].version);
    });
  });

  // ─── Rollback ─────────────────────────────────────────────────

  describe('rollback', () => {
    it('restores identity to a prior version', () => {
      manager.setIdentity('agent-1', {
        name: 'Original',
        role: 'Architect',
        personality: ['calm'],
      });
      manager.setIdentity('agent-1', {
        name: 'Changed',
        role: 'Engineer',
        personality: ['energetic'],
      });

      // Version 1 was snapshotted before the update
      const restored = manager.rollback('agent-1', 1);
      expect(restored.name).toBe('Original');
      expect(restored.role).toBe('Architect');
      expect(restored.personality).toEqual(['calm']);
      // Version increments (doesn't revert to 1)
      expect(restored.version).toBe(3);
    });

    it('snapshots current state before rollback', () => {
      manager.setIdentity('agent-1', { name: 'V1' });
      manager.setIdentity('agent-1', { name: 'V2' });
      manager.rollback('agent-1', 1);

      const history = manager.getVersionHistory('agent-1');
      // Should have v1 snapshot (before update to V2) and v2 snapshot (before rollback)
      expect(history.length).toBe(2);
    });

    it('throws for nonexistent version', () => {
      manager.setIdentity('agent-1', { name: 'Test' });
      expect(() => manager.rollback('agent-1', 99)).toThrow(/Version 99 not found/);
    });
  });

  // ─── renderIdentityMarkdown ───────────────────────────────────

  describe('renderIdentityMarkdown', () => {
    it('returns unknown agent message for nonexistent agent', () => {
      const md = manager.renderIdentityMarkdown('ghost');
      expect(md).toContain('Unknown Agent');
      expect(md).toContain('ghost');
    });

    it('renders identity with name, role, description', () => {
      manager.setIdentity('agent-1', {
        name: 'Salvador',
        role: 'Design Advisor',
        description: 'Helps with design systems.',
      });

      const md = manager.renderIdentityMarkdown('agent-1');
      expect(md).toContain('# Salvador');
      expect(md).toContain('**Role:** Design Advisor');
      expect(md).toContain('Helps with design systems.');
    });

    it('renders personality traits as bullet points', () => {
      manager.setIdentity('agent-1', {
        name: 'Test',
        personality: ['artistic', 'precise'],
      });

      const md = manager.renderIdentityMarkdown('agent-1');
      expect(md).toContain('## Personality');
      expect(md).toContain('- artistic');
      expect(md).toContain('- precise');
    });

    it('renders guidelines grouped by category', () => {
      manager.setIdentity('agent-1', { name: 'Test' });
      manager.addGuideline('agent-1', { category: 'behavior', text: 'Be thorough' });
      manager.addGuideline('agent-1', { category: 'restriction', text: 'No raw colors' });

      const md = manager.renderIdentityMarkdown('agent-1');
      expect(md).toContain('## Behaviors');
      expect(md).toContain('- Be thorough');
      expect(md).toContain('## Restrictions');
      expect(md).toContain('- No raw colors');
    });

    it('omits empty sections', () => {
      manager.setIdentity('agent-1', {
        name: 'Minimal',
        role: 'Tester',
        personality: [],
      });

      const md = manager.renderIdentityMarkdown('agent-1');
      expect(md).not.toContain('## Personality');
      expect(md).not.toContain('## Behaviors');
    });
  });
});
