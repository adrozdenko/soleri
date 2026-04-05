/**
 * Workflow loader — reads agent workflow overrides from the file tree.
 *
 * Each workflow is a folder under `workflows/` containing:
 *   - `prompt.md`  — system prompt for the workflow (optional)
 *   - `gates.yaml` — gate definitions (optional)
 *   - `tools.yaml` — tool allowlist (optional)
 *
 * These overrides are merged into the OrchestrationPlan when
 * the detected intent matches a workflow via WORKFLOW_TO_INTENT.
 */

import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const WorkflowGateSchema = z.object({
  phase: z.string(),
  requirement: z.string(),
  check: z.string(),
});

export const WorkflowOverrideSchema = z.object({
  name: z.string(),
  prompt: z.string().optional(),
  gates: z.array(WorkflowGateSchema).default([]),
  tools: z.array(z.string()).default([]),
});

export type WorkflowGate = z.infer<typeof WorkflowGateSchema>;
export type WorkflowOverride = z.infer<typeof WorkflowOverrideSchema>;

// ---------------------------------------------------------------------------
// Workflow → Intent mapping
// ---------------------------------------------------------------------------

/**
 * Maps workflow folder names to intent strings.
 * Used by `getWorkflowForIntent()` to find a matching workflow.
 */
export const WORKFLOW_TO_INTENT: Record<string, string> = {
  'feature-dev': 'BUILD',
  'bug-fix': 'FIX',
  'code-review': 'REVIEW',
  'component-build': 'BUILD',
  'token-migration': 'ENHANCE',
  'a11y-remediation': 'FIX',
  deliver: 'DELIVER',
  plan: 'PLAN',
  design: 'DESIGN',
  explore: 'EXPLORE',
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all workflow overrides from an agent's `workflows/` directory.
 *
 * Returns an empty Map if the directory doesn't exist or can't be read
 * (graceful degradation — no throw).
 */
export function loadAgentWorkflows(workflowsDir: string): Map<string, WorkflowOverride> {
  const workflows = new Map<string, WorkflowOverride>();

  let entries: string[];
  try {
    entries = fs.readdirSync(workflowsDir);
  } catch {
    // Directory doesn't exist or can't be read — that's fine
    return workflows;
  }

  for (const entry of entries) {
    const fullPath = path.join(workflowsDir, entry);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const override: WorkflowOverride = { name: entry, gates: [], tools: [] };

    // Read prompt.md
    const promptPath = path.join(fullPath, 'prompt.md');
    try {
      override.prompt = fs.readFileSync(promptPath, 'utf-8').trim();
    } catch {
      // No prompt — that's fine
    }

    // Read gates.yaml
    const gatesPath = path.join(fullPath, 'gates.yaml');
    try {
      const raw = fs.readFileSync(gatesPath, 'utf-8');
      // Simple YAML parsing for the gates structure
      const gates = parseGatesYaml(raw);
      override.gates = gates;
    } catch {
      // No gates — that's fine
    }

    // Read tools.yaml
    const toolsPath = path.join(fullPath, 'tools.yaml');
    try {
      const raw = fs.readFileSync(toolsPath, 'utf-8');
      const tools = parseToolsYaml(raw);
      override.tools = tools;
    } catch {
      // No tools — that's fine
    }

    // Only store if we got something useful
    if (override.prompt || override.gates.length > 0 || override.tools.length > 0) {
      workflows.set(entry, override);
    }
  }

  return workflows;
}

// ---------------------------------------------------------------------------
// Intent matching
// ---------------------------------------------------------------------------

/**
 * Find a workflow override that matches the given intent.
 *
 * Uses WORKFLOW_TO_INTENT mapping, optionally overridden by customMapping.
 * Returns null if no matching workflow is found.
 */
export function getWorkflowForIntent(
  workflows: Map<string, WorkflowOverride>,
  intent: string,
  customMapping?: Record<string, string>,
): WorkflowOverride | null {
  const mapping = customMapping ?? WORKFLOW_TO_INTENT;
  const normalizedIntent = intent.toUpperCase();

  for (const [workflowName, mappedIntent] of Object.entries(mapping)) {
    if (mappedIntent.toUpperCase() === normalizedIntent && workflows.has(workflowName)) {
      return workflows.get(workflowName)!;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Minimal YAML parsers (no external dependency)
// ---------------------------------------------------------------------------

/**
 * Parse a simple gates.yaml file. Expected format:
 *
 * ```yaml
 * gates:
 *   - phase: brainstorming
 *     requirement: Requirements are clear
 *     check: user-approval
 * ```
 */
function parseGatesYaml(raw: string): WorkflowGate[] {
  const gates: WorkflowGate[] = [];
  const lines = raw.split('\n');

  let current: Partial<WorkflowGate> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines and the root "gates:" key
    if (!trimmed || trimmed === 'gates:') continue;

    // New list item
    if (trimmed.startsWith('- ')) {
      if (current && current.phase && current.requirement && current.check) {
        gates.push(current as WorkflowGate);
      }
      current = {};
      // Parse inline key from "- phase: value"
      const inlineMatch = trimmed.match(/^-\s+(\w+):\s*(.+)$/);
      if (inlineMatch) {
        const [, key, value] = inlineMatch;
        if (key === 'phase' || key === 'requirement' || key === 'check') {
          current[key] = value.trim();
        }
      }
      continue;
    }

    // Continuation key: "    requirement: value"
    if (current) {
      const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
      if (kvMatch) {
        const [, key, value] = kvMatch;
        if (key === 'phase' || key === 'requirement' || key === 'check') {
          current[key] = value.trim();
        }
      }
    }
  }

  // Flush last entry
  if (current && current.phase && current.requirement && current.check) {
    gates.push(current as WorkflowGate);
  }

  return gates;
}

/**
 * Parse a simple tools.yaml file. Expected format:
 *
 * ```yaml
 * tools:
 *   - soleri_vault op:search_intelligent
 *   - soleri_plan op:create_plan
 * ```
 */
function parseToolsYaml(raw: string): string[] {
  const tools: string[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'tools:') continue;

    if (trimmed.startsWith('- ')) {
      tools.push(trimmed.slice(2).trim());
    }
  }

  return tools;
}
