import { describe, it, expect } from 'vitest';
import {
  parseGitHubRemote,
  findMatchingMilestone,
  findDuplicateIssue,
  formatIssueBody,
} from './github-projection.js';
import type { GitHubMilestone, GitHubIssue, PlanMetadataForIssue } from './github-projection.js';

describe('github-projection', () => {
  // ─── parseGitHubRemote ──────────────────────────────────────────

  describe('parseGitHubRemote', () => {
    it('should parse HTTPS remote', () => {
      const result = parseGitHubRemote('https://github.com/adrozdenko/deckforge.git');
      expect(result).toEqual({ owner: 'adrozdenko', repo: 'deckforge' });
    });

    it('should parse HTTPS remote without .git suffix', () => {
      const result = parseGitHubRemote('https://github.com/adrozdenko/deckforge');
      expect(result).toEqual({ owner: 'adrozdenko', repo: 'deckforge' });
    });

    it('should parse SSH remote', () => {
      const result = parseGitHubRemote('git@github.com:adrozdenko/deckforge.git');
      expect(result).toEqual({ owner: 'adrozdenko', repo: 'deckforge' });
    });

    it('should parse SSH remote without .git suffix', () => {
      const result = parseGitHubRemote('git@github.com:adrozdenko/deckforge');
      expect(result).toEqual({ owner: 'adrozdenko', repo: 'deckforge' });
    });

    it('should return null for non-GitHub URLs', () => {
      expect(parseGitHubRemote('https://gitlab.com/user/repo.git')).toBeNull();
      expect(parseGitHubRemote('https://bitbucket.org/user/repo.git')).toBeNull();
    });

    it('should return null for invalid URLs', () => {
      expect(parseGitHubRemote('')).toBeNull();
      expect(parseGitHubRemote('not a url')).toBeNull();
    });

    it('should handle repos with hyphens and dots', () => {
      const result = parseGitHubRemote('https://github.com/org-name/my-repo.js.git');
      expect(result).toEqual({ owner: 'org-name', repo: 'my-repo.js' });
    });
  });

  // ─── findMatchingMilestone ──────────────────────────────────────

  describe('findMatchingMilestone', () => {
    const milestones: GitHubMilestone[] = [
      { number: 1, title: 'Phase 1: Auth + Persistence', state: 'open' },
      { number: 2, title: 'Phase 2: UI Components', state: 'open' },
      { number: 3, title: 'Phase 3: API Integration', state: 'closed' },
    ];

    it('should find matching milestone by word overlap', () => {
      const match = findMatchingMilestone('Auth and Persistence', milestones);
      expect(match).toBeDefined();
      expect(match!.number).toBe(1);
    });

    it('should find second milestone', () => {
      const match = findMatchingMilestone('UI Components redesign', milestones);
      expect(match).toBeDefined();
      expect(match!.number).toBe(2);
    });

    it('should skip closed milestones', () => {
      const match = findMatchingMilestone('API Integration', milestones);
      expect(match).toBeNull();
    });

    it('should return null for no match', () => {
      const match = findMatchingMilestone('Completely unrelated topic', milestones);
      expect(match).toBeNull();
    });

    it('should return null for empty milestones', () => {
      const match = findMatchingMilestone('Something', []);
      expect(match).toBeNull();
    });
  });

  // ─── findDuplicateIssue ─────────────────────────────────────────

  describe('findDuplicateIssue', () => {
    const issues: GitHubIssue[] = [
      { number: 10, title: 'Add user authentication flow', state: 'open' },
      { number: 11, title: 'Fix login timeout error', state: 'open' },
      { number: 12, title: 'Implement dark mode toggle', state: 'open' },
    ];

    it('should detect duplicate by title similarity', () => {
      const dup = findDuplicateIssue('Implement user authentication flow', issues);
      expect(dup).toBeDefined();
      expect(dup!.number).toBe(10);
    });

    it('should return null for unique task', () => {
      const dup = findDuplicateIssue('Add payment processing', issues);
      expect(dup).toBeNull();
    });

    it('should return null for empty issues list', () => {
      const dup = findDuplicateIssue('Something', []);
      expect(dup).toBeNull();
    });

    it('should handle short titles gracefully', () => {
      const dup = findDuplicateIssue('Fix', issues);
      expect(dup).toBeNull(); // "Fix" alone is too short (< 3 chars filtered)
    });
  });

  // ─── formatIssueBody ───────────────────────────────────────────

  describe('formatIssueBody', () => {
    const planMeta: PlanMetadataForIssue = {
      planId: 'plan-123456-abc',
      grade: 'A+',
      score: 100,
      objective: 'Build user authentication',
      decisions: [
        'Use JWT tokens for session management',
        { decision: 'OAuth2 for third-party', rationale: 'Industry standard, wide support' },
      ],
      tasks: [
        { id: 'task-1', title: 'Design auth schema', description: 'Create DB tables' },
        { id: 'task-2', title: 'Implement login', description: 'Login endpoint', dependsOn: ['task-1'] },
      ],
    };

    it('should include plan ID and grade', () => {
      const body = formatIssueBody(planMeta, 'Design auth schema', 'Create DB tables');
      expect(body).toContain('`plan-123456-abc`');
      expect(body).toContain('Grade: A+');
      expect(body).toContain('100/100');
    });

    it('should include objective', () => {
      const body = formatIssueBody(planMeta, 'Design auth schema', 'Create DB tables');
      expect(body).toContain('Build user authentication');
    });

    it('should include string decisions', () => {
      const body = formatIssueBody(planMeta, 'Design auth schema', 'Create DB tables');
      expect(body).toContain('Use JWT tokens');
    });

    it('should include structured decisions with rationale', () => {
      const body = formatIssueBody(planMeta, 'Design auth schema', 'Create DB tables');
      expect(body).toContain('OAuth2 for third-party');
      expect(body).toContain('Industry standard');
    });

    it('should include task table', () => {
      const body = formatIssueBody(planMeta, 'Design auth schema', 'Create DB tables');
      expect(body).toContain('| task-1 |');
      expect(body).toContain('| task-2 |');
      expect(body).toContain('task-1'); // dependency
    });

    it('should include task description', () => {
      const body = formatIssueBody(planMeta, 'Design auth schema', 'Create DB tables');
      expect(body).toContain('Create DB tables');
    });

    it('should handle plan with no decisions', () => {
      const meta = { ...planMeta, decisions: [] };
      const body = formatIssueBody(meta, 'Test', 'Desc');
      expect(body).not.toContain('## Decisions');
    });
  });
});
