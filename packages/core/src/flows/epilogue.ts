/**
 * Epilogue — post-execution cleanup: capture knowledge and session summary.
 * All operations are resilient (errors are caught, never propagated).
 */

import type { ProbeResults } from './types.js';

type DispatchFn = (
  toolName: string,
  params: Record<string, unknown>,
) => Promise<{ tool: string; status: string; data?: unknown; error?: string }>;

/**
 * Run post-execution epilogue steps.
 * - Captures knowledge to vault (if available)
 * - Captures session summary (if session store available)
 *
 * @returns Whether anything was captured and an optional session ID.
 */
export async function runEpilogue(
  dispatch: DispatchFn,
  probes: ProbeResults,
  projectPath: string,
  summary: string,
  planContext?: { intent?: string; objective?: string; domain?: string },
): Promise<{ captured: boolean; sessionId?: string }> {
  let captured = false;
  let sessionId: string | undefined;

  // Capture knowledge to vault
  if (probes.vault) {
    const intent = planContext?.intent?.toUpperCase() ?? 'FLOW';
    const objective = planContext?.objective ?? summary;
    const title = `${intent} execution — ${objective}`.slice(0, 120);
    const tags = [
      'auto-captured',
      intent.toLowerCase(),
      ...(planContext?.domain ? [planContext.domain] : []),
    ];
    try {
      await dispatch('capture_knowledge', {
        title,
        content: summary,
        type: 'workflow',
        tags,
        projectPath,
      });
      captured = true;
    } catch {
      // Silently ignore — vault capture is best-effort
    }
  }

  // Capture session
  if (probes.sessionStore) {
    try {
      const result = await dispatch('session_capture', {
        summary,
        projectPath,
      });
      captured = true;
      if (result.data && typeof result.data === 'object') {
        const data = result.data as Record<string, unknown>;
        if (typeof data.sessionId === 'string') {
          sessionId = data.sessionId;
        }
      }
    } catch {
      // Silently ignore — session capture is best-effort
    }
  }

  return { captured, sessionId };
}
