/**
 * Playbook Executor — in-memory runtime for step-by-step playbook execution.
 *
 * Lifecycle: start → step (repeat) → complete
 *
 * Sessions are ephemeral (in-memory, not persisted). For persistent workflows,
 * use the planning system instead.
 */

import type {
  PlaybookDefinition,
  MergedPlaybook,
  PlaybookGate,
  PlaybookTaskTemplate,
} from './playbook-types.js';

// =============================================================================
// TYPES
// =============================================================================

export type PlaybookStepStatus = 'pending' | 'active' | 'done' | 'skipped';

export interface PlaybookStepState {
  index: number;
  title: string;
  description: string;
  status: PlaybookStepStatus;
  output?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface PlaybookSession {
  id: string;
  playbookId: string;
  label: string;
  steps: PlaybookStepState[];
  gates: PlaybookGate[];
  taskTemplates: PlaybookTaskTemplate[];
  tools: string[];
  verificationCriteria: string[];
  currentStepIndex: number;
  status: 'active' | 'completed' | 'aborted';
  startedAt: number;
  completedAt?: number;
}

export interface StartResult {
  sessionId: string;
  label: string;
  totalSteps: number;
  currentStep: PlaybookStepState;
  tools: string[];
  gates: PlaybookGate[];
}

export interface StepResult {
  sessionId: string;
  completedStep: PlaybookStepState;
  nextStep: PlaybookStepState | null;
  progress: { done: number; total: number };
  isComplete: boolean;
}

export interface CompleteResult {
  sessionId: string;
  label: string;
  status: 'completed' | 'aborted';
  steps: PlaybookStepState[];
  gatesPassed: boolean;
  unsatisfiedGates: string[];
  duration: number;
}

// =============================================================================
// STEP PARSER
// =============================================================================

/**
 * Parse step strings from a playbook's `steps` field into structured steps.
 * Expects numbered steps like "1. Title\n   - detail\n   - detail"
 */
function parseSteps(stepsText: string): Array<{ title: string; description: string }> {
  const lines = stepsText.split('\n');
  const steps: Array<{ title: string; description: string }> = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const stepMatch = line.match(/^\s*(\d+)\.\s+(.+)/);
    if (stepMatch) {
      if (current) {
        steps.push({ title: current.title, description: current.lines.join('\n').trim() });
      }
      current = { title: stepMatch[2].trim(), lines: [] };
    } else if (current && line.trim()) {
      current.lines.push(line);
    }
  }
  if (current) {
    steps.push({ title: current.title, description: current.lines.join('\n').trim() });
  }

  return steps;
}

// =============================================================================
// EXECUTOR
// =============================================================================

export class PlaybookExecutor {
  private sessions = new Map<string, PlaybookSession>();

  /**
   * Start a playbook execution session.
   * Accepts either a PlaybookDefinition or MergedPlaybook.
   */
  start(playbook: PlaybookDefinition | MergedPlaybook): StartResult {
    const sessionId = `pbk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    let label: string;
    let playbookId: string;
    let stepsText: string;
    let gates: PlaybookGate[];
    let taskTemplates: PlaybookTaskTemplate[];
    let tools: string[];
    let verificationCriteria: string[];

    if ('mergedGates' in playbook) {
      // MergedPlaybook
      label = playbook.label;
      playbookId = playbook.generic?.id ?? playbook.domain?.id ?? 'unknown';
      stepsText = playbook.generic?.steps ?? playbook.domain?.steps ?? '';
      gates = playbook.mergedGates;
      taskTemplates = playbook.mergedTasks;
      tools = playbook.mergedTools;
      verificationCriteria = playbook.mergedVerification;
    } else {
      // PlaybookDefinition
      label = playbook.title;
      playbookId = playbook.id;
      stepsText = playbook.steps;
      gates = playbook.gates;
      taskTemplates = playbook.taskTemplates;
      tools = playbook.toolInjections;
      verificationCriteria = playbook.verificationCriteria;
    }

    const parsed = parseSteps(stepsText);
    if (parsed.length === 0) {
      parsed.push({ title: label, description: 'Execute the playbook.' });
    }

    const steps: PlaybookStepState[] = parsed.map((s, i) => ({
      index: i,
      title: s.title,
      description: s.description,
      status: i === 0 ? 'active' : 'pending',
    }));

    const session: PlaybookSession = {
      id: sessionId,
      playbookId,
      label,
      steps,
      gates,
      taskTemplates,
      tools,
      verificationCriteria,
      currentStepIndex: 0,
      status: 'active',
      startedAt: Date.now(),
    };

    steps[0].startedAt = Date.now();
    this.sessions.set(sessionId, session);

    return {
      sessionId,
      label,
      totalSteps: steps.length,
      currentStep: steps[0],
      tools,
      gates,
    };
  }

  /**
   * Advance to the next step. Marks the current step as done (or skipped).
   */
  step(
    sessionId: string,
    options?: { output?: string; skip?: boolean },
  ): StepResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: `Session not found: ${sessionId}` };
    if (session.status !== 'active') return { error: `Session is ${session.status}, not active` };

    const current = session.steps[session.currentStepIndex];
    current.status = options?.skip ? 'skipped' : 'done';
    current.output = options?.output;
    current.completedAt = Date.now();

    const nextIndex = session.currentStepIndex + 1;
    const isComplete = nextIndex >= session.steps.length;

    let nextStep: PlaybookStepState | null = null;
    if (!isComplete) {
      session.currentStepIndex = nextIndex;
      session.steps[nextIndex].status = 'active';
      session.steps[nextIndex].startedAt = Date.now();
      nextStep = session.steps[nextIndex];
    }

    const done = session.steps.filter((s) => s.status === 'done' || s.status === 'skipped').length;

    return {
      sessionId,
      completedStep: current,
      nextStep,
      progress: { done, total: session.steps.length },
      isComplete,
    };
  }

  /**
   * Complete a playbook session. Validates gates and returns summary.
   */
  complete(
    sessionId: string,
    options?: { abort?: boolean; gateResults?: Record<string, boolean> },
  ): CompleteResult | { error: string } {
    const session = this.sessions.get(sessionId);
    if (!session) return { error: `Session not found: ${sessionId}` };
    if (session.status !== 'active') return { error: `Session is already ${session.status}` };

    const abort = options?.abort ?? false;
    const gateResults = options?.gateResults ?? {};

    // Mark any remaining active/pending steps
    for (const step of session.steps) {
      if (step.status === 'active' || step.status === 'pending') {
        step.status = abort ? 'skipped' : step.status;
        if (step.status === 'active') {
          step.status = 'done';
          step.completedAt = Date.now();
        }
      }
    }

    // Validate gates
    const completionGates = session.gates.filter((g) => g.phase === 'completion');
    const unsatisfiedGates: string[] = [];
    for (const gate of completionGates) {
      if (!gateResults[gate.checkType]) {
        unsatisfiedGates.push(`${gate.checkType}: ${gate.requirement}`);
      }
    }

    session.status = abort ? 'aborted' : 'completed';
    session.completedAt = Date.now();

    const result: CompleteResult = {
      sessionId,
      label: session.label,
      status: session.status,
      steps: session.steps,
      gatesPassed: unsatisfiedGates.length === 0,
      unsatisfiedGates,
      duration: session.completedAt - session.startedAt,
    };

    // Clean up after completion
    this.sessions.delete(sessionId);

    return result;
  }

  /**
   * Get the current state of a session.
   */
  getSession(sessionId: string): PlaybookSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  listSessions(): Array<{ id: string; label: string; progress: string; startedAt: number }> {
    return Array.from(this.sessions.values())
      .filter((s) => s.status === 'active')
      .map((s) => {
        const done = s.steps.filter((st) => st.status === 'done' || st.status === 'skipped').length;
        return {
          id: s.id,
          label: s.label,
          progress: `${done}/${s.steps.length}`,
          startedAt: s.startedAt,
        };
      });
  }
}
