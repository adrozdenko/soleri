import { describe, it, expect } from 'vitest';
import { extractIssueNumber, parseRemoteUrl } from '../runtime/github-integration.js';

describe('github-integration', () => {
  // ─── extractIssueNumber ──────────────────────────────────────────

  describe('extractIssueNumber', () => {
    it('should extract from bare #NNN', () => {
      expect(extractIssueNumber('#123')).toBe(123);
    });

    it('should extract from "issue #NNN"', () => {
      expect(extractIssueNumber('issue #456')).toBe(456);
    });

    it('should extract from "fixes #NNN"', () => {
      expect(extractIssueNumber('fixes #789')).toBe(789);
    });

    it('should extract from "closes #NNN"', () => {
      expect(extractIssueNumber('closes #42')).toBe(42);
    });

    it('should extract first match when multiple present', () => {
      expect(extractIssueNumber('fixes #10 and #20')).toBe(10);
    });

    it('should extract from longer text', () => {
      expect(extractIssueNumber('Implement the feature described in #293')).toBe(293);
    });

    it('should return null for no match', () => {
      expect(extractIssueNumber('no issue here')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(extractIssueNumber('')).toBeNull();
    });

    it('should return null for hash without digits', () => {
      expect(extractIssueNumber('#abc')).toBeNull();
    });
  });

  // ─── parseRemoteUrl ──────────────────────────────────────────────

  describe('parseRemoteUrl', () => {
    it('should parse HTTPS URL with .git', () => {
      const result = parseRemoteUrl('https://github.com/owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse HTTPS URL without .git', () => {
      const result = parseRemoteUrl('https://github.com/owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse SSH URL with .git', () => {
      const result = parseRemoteUrl('git@github.com:owner/repo.git');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should parse SSH URL without .git', () => {
      const result = parseRemoteUrl('git@github.com:owner/repo');
      expect(result).toEqual({ owner: 'owner', repo: 'repo' });
    });

    it('should handle repos with hyphens', () => {
      const result = parseRemoteUrl('https://github.com/my-org/my-repo.git');
      expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' });
    });

    it('should return null for non-GitHub URLs', () => {
      expect(parseRemoteUrl('https://gitlab.com/owner/repo.git')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseRemoteUrl('')).toBeNull();
    });

    it('should return null for invalid input', () => {
      expect(parseRemoteUrl('not a url')).toBeNull();
    });
  });

  // ─── graceful degradation ────────────────────────────────────────

  describe('graceful degradation', () => {
    it('detectGitHubRemote returns null for non-git directory', async () => {
      const { detectGitHubRemote } = await import('../runtime/github-integration.js');
      const result = await detectGitHubRemote('/tmp/nonexistent-dir-xyz');
      expect(result).toBeNull();
    });

    it('getIssueDetails returns null when gh is not available for fake repo', async () => {
      const { getIssueDetails } = await import('../runtime/github-integration.js');
      // Use a repo that almost certainly does not exist
      const result = await getIssueDetails('nonexistent-owner-xyz', 'nonexistent-repo-xyz', 99999);
      expect(result).toBeNull();
    });
  });
});
