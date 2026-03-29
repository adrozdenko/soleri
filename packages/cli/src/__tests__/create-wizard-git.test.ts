import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Mock @clack/prompts — every prompt function the wizard uses.
 */
vi.mock('@clack/prompts', () => ({
  confirm: vi.fn(),
  select: vi.fn(),
  text: vi.fn(),
  intro: vi.fn(),
  note: vi.fn(),
  isCancel: vi.fn().mockReturnValue(false),
}));

/**
 * Mock the git utility so we control gh availability.
 */
vi.mock('../utils/git.js', () => ({
  isGhInstalled: vi.fn().mockReturnValue(true),
}));

import * as p from '@clack/prompts';
import { isGhInstalled } from '../utils/git.js';
import { runCreateWizard } from '../prompts/create-wizard.js';
import type { CreateWizardResult, WizardGitConfig } from '../prompts/create-wizard.js';

const mockText = p.text as unknown as ReturnType<typeof vi.fn>;
const mockSelect = p.select as unknown as ReturnType<typeof vi.fn>;
const mockConfirm = p.confirm as unknown as ReturnType<typeof vi.fn>;
const mockIsCancel = p.isCancel as unknown as ReturnType<typeof vi.fn>;
const mockGhInstalled = isGhInstalled as unknown as ReturnType<typeof vi.fn>;

/**
 * Helper: set up the standard wizard prompts that precede git questions.
 * Returns after the "Create this agent?" confirm (step 4).
 *
 * Call order:
 *   1. text — agent name
 *   2. select — persona choice
 *   3. note — summary (no return value needed)
 *   4. confirm — create confirmation
 */
function mockBaseWizard() {
  mockText.mockResolvedValueOnce('TestAgent'); // name
  mockSelect.mockResolvedValueOnce('default'); // persona
  mockConfirm.mockResolvedValueOnce(true); // create confirm
}

describe('create-wizard git prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockGhInstalled.mockReturnValue(true);
  });

  // ── 1. Git init defaults to true ──────────────────────────────
  it('should default git init to true when user accepts all defaults', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init = yes
    mockConfirm.mockResolvedValueOnce(false); // push to remote = no

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.init).toBe(true);
    expect(result.git.remote).toBeUndefined();
  });

  // ── 2. Git init can be declined ───────────────────────────────
  it('should set git.init to false when user declines', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(false); // git init = no

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.init).toBe(false);
    expect(result.git.remote).toBeUndefined();
    // No push prompt should have been called — only 2 confirms total
    // (create + git init)
    expect(mockConfirm).toHaveBeenCalledTimes(2);
  });

  // ── 3. Remote prompts only when init=true, no push ────────────
  it('should leave remote undefined when init=true but push=false', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init
    mockConfirm.mockResolvedValueOnce(false); // push to remote = no

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.init).toBe(true);
    expect(result.git.remote).toBeUndefined();
  });

  // ── 4. gh path: GitHub repo creation ──────────────────────────
  it('should configure gh remote when user selects gh path', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init
    mockConfirm.mockResolvedValueOnce(true); // push to remote
    mockSelect.mockResolvedValueOnce('gh'); // remote choice
    mockSelect.mockResolvedValueOnce('public'); // visibility

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.remote).toEqual({
      type: 'gh',
      visibility: 'public',
    });
  });

  // ── 5. gh path: private by default ────────────────────────────
  it('should default visibility to private when selecting gh', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init
    mockConfirm.mockResolvedValueOnce(true); // push to remote
    mockSelect.mockResolvedValueOnce('gh'); // remote choice
    mockSelect.mockResolvedValueOnce('private'); // visibility = private

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.remote!.type).toBe('gh');
    expect(result.git.remote!.visibility).toBe('private');
  });

  // ── 6. Manual path: URL input ─────────────────────────────────
  it('should configure manual remote with URL when user selects manual', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init
    mockConfirm.mockResolvedValueOnce(true); // push to remote
    mockSelect.mockResolvedValueOnce('manual'); // remote choice
    mockText.mockResolvedValueOnce('https://github.com/test/repo.git'); // URL

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.remote).toEqual({
      type: 'manual',
      url: 'https://github.com/test/repo.git',
    });
  });

  // ── 7. Manual path forced when gh not available ───────────────
  it('should skip gh/manual select and go straight to URL when gh is not installed', async () => {
    mockGhInstalled.mockReturnValue(false);

    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init
    mockConfirm.mockResolvedValueOnce(true); // push to remote
    // No select for gh/manual — goes straight to text for URL
    mockText.mockResolvedValueOnce('https://gitlab.com/test/repo.git');

    const result = (await runCreateWizard()) as CreateWizardResult;

    expect(result).not.toBeNull();
    expect(result.git.remote).toEqual({
      type: 'manual',
      url: 'https://gitlab.com/test/repo.git',
    });
    // select should only be called once (persona), not twice
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  // ── 8. Cancellation at git init prompt ────────────────────────
  it('should return null when user cancels at git init prompt', async () => {
    mockBaseWizard();
    // The third confirm call (git init) returns a cancel symbol
    const cancelSymbol = Symbol('cancel');
    mockConfirm.mockResolvedValueOnce(cancelSymbol);
    mockIsCancel.mockImplementation((val) => val === cancelSymbol);

    const result = await runCreateWizard();

    expect(result).toBeNull();
  });

  // ── 9. Cancellation at push prompt ────────────────────────────
  it('should return null when user cancels at push prompt', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init = yes

    const cancelSymbol = Symbol('cancel');
    mockConfirm.mockResolvedValueOnce(cancelSymbol); // push = cancel
    mockIsCancel.mockImplementation((val) => val === cancelSymbol);

    const result = await runCreateWizard();

    expect(result).toBeNull();
  });

  // ── 10. Cancellation at remote choice ─────────────────────────
  it('should return null when user cancels at remote choice prompt', async () => {
    mockBaseWizard();
    mockConfirm.mockResolvedValueOnce(true); // git init
    mockConfirm.mockResolvedValueOnce(true); // push to remote

    const cancelSymbol = Symbol('cancel');
    mockSelect.mockResolvedValueOnce(cancelSymbol); // remote choice = cancel
    mockIsCancel.mockImplementation((val) => val === cancelSymbol);

    const result = await runCreateWizard();

    expect(result).toBeNull();
  });
});
