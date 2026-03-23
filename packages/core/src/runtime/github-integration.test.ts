import { describe, it, expect } from 'vitest';
import {
  parseRemoteUrl,
  extractIssueNumber,
  detectGitHubRemote,
  getIssueDetails,
  closeIssueWithComment,
} from './github-integration.js';

describe('parseRemoteUrl', () => {
  it('parses HTTPS remote with .git suffix', () => {
    const result = parseRemoteUrl('https://github.com/acme/widget.git');
    expect(result).toEqual({ owner: 'acme', repo: 'widget' });
  });

  it('parses HTTPS remote without .git suffix', () => {
    const result = parseRemoteUrl('https://github.com/acme/widget');
    expect(result).toEqual({ owner: 'acme', repo: 'widget' });
  });

  it('parses SSH remote with .git suffix', () => {
    const result = parseRemoteUrl('git@github.com:acme/widget.git');
    expect(result).toEqual({ owner: 'acme', repo: 'widget' });
  });

  it('parses SSH remote without .git suffix', () => {
    const result = parseRemoteUrl('git@github.com:acme/widget');
    expect(result).toEqual({ owner: 'acme', repo: 'widget' });
  });

  it('returns null for non-GitHub URLs', () => {
    expect(parseRemoteUrl('https://gitlab.com/acme/widget.git')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseRemoteUrl('')).toBeNull();
  });

  it('returns null for random text', () => {
    expect(parseRemoteUrl('not-a-url-at-all')).toBeNull();
  });
});

describe('extractIssueNumber', () => {
  it('extracts issue number from #NNN', () => {
    expect(extractIssueNumber('fixes #42')).toBe(42);
  });

  it('extracts first match when multiple present', () => {
    expect(extractIssueNumber('#10 and #20')).toBe(10);
  });

  it('returns null when no issue number', () => {
    expect(extractIssueNumber('no issues here')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractIssueNumber('')).toBeNull();
  });

  it('handles issue in sentence context', () => {
    expect(extractIssueNumber('closes #789 in this PR')).toBe(789);
  });
});

describe('detectGitHubRemote', () => {
  it('returns null when git command fails', async () => {
    // Pass a path that is not a git repo
    const result = await detectGitHubRemote('/tmp/definitely-not-a-repo-' + Date.now());
    expect(result).toBeNull();
  });
});

describe('getIssueDetails', () => {
  it('returns null when gh CLI is not available or fails', async () => {
    // gh issue view on a non-existent repo will fail
    const result = await getIssueDetails('nonexistent-owner-xyz', 'nonexistent-repo-xyz', 99999);
    expect(result).toBeNull();
  });
});

describe('closeIssueWithComment', () => {
  it('does not throw when gh CLI is not available', async () => {
    // Should degrade gracefully
    await expect(
      closeIssueWithComment('nonexistent-owner-xyz', 'nonexistent-repo-xyz', 99999, 'test'),
    ).resolves.toBeUndefined();
  });
});
