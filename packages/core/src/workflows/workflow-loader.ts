/**
 * Workflow loader — reads gates.yaml and tools.yaml from an agent's workflows/ directory.
 *
 * Each subdirectory under workflows/ represents a named workflow (e.g. feature-dev, bug-fix).
 * The loader parses and validates YAML files, returning a Map of workflow overrides.
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const WorkflowGateSchema = z.object({
  phase: z.enum(['brainstorming', 'pre-execution', 'post-task', 'completion']),
  requirement: z.string(),
  check: z.string(),
});

export const WorkflowToolsSchema = z.array(z.string());

export const WorkflowOverrideSchema = z.object({
  gates: z.array(WorkflowGateSchema).default([]),
  tools: WorkflowToolsSchema.default([]),
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WorkflowGate = z.infer<typeof WorkflowGateSchema>;
export type WorkflowOverride = z.infer<typeof WorkflowOverrideSchema>;

// ---------------------------------------------------------------------------
// Default workflow → intent mapping
// ---------------------------------------------------------------------------

export const WORKFLOW_TO_INTENT: Record<string, string> = {
  'feature-dev': 'BUILD',
  'bug-fix': 'FIX',
  'code-review': 'REVIEW',
  'context-handoff': 'HANDOFF',
};

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Load all workflow overrides from subdirectories under `workflowsDir`.
 *
 * Each subdirectory may contain:
 * - `gates.yaml` — array of workflow gates
 * - `tools.yaml` — array of tool name strings
 *
 * Returns a Map keyed by subdirectory name. Missing or invalid files are
 * handled gracefully — warnings are logged, never thrown.
 */
export function loadAgentWorkflows(workflowsDir: string): Map<string, WorkflowOverride> {
  const result = new Map<string, WorkflowOverride>();

  if (!existsSync(workflowsDir)) return result;

  let entries: string[];
  try {
    entries = readdirSync(workflowsDir);
  } catch {
    return result;
  }

  for (const entry of entries) {
    const entryPath = join(workflowsDir, entry);
    try {
      if (!statSync(entryPath).isDirectory()) continue;
    } catch {
      continue;
    }

    const gates = loadGates(entryPath, entry);
    const tools = loadTools(entryPath, entry);

    // Only add if at least one file was present (even if empty / defaults)
    const gatesPath = join(entryPath, 'gates.yaml');
    const toolsPath = join(entryPath, 'tools.yaml');
    if (existsSync(gatesPath) || existsSync(toolsPath)) {
      result.set(entry, { gates, tools });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadGates(dir: string, workflowName: string): WorkflowGate[] {
  const filePath = join(dir, 'gates.yaml');
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const raw = parseYaml(content);
    const parsed = z.array(WorkflowGateSchema).safeParse(raw);
    if (parsed.success) return parsed.data;

    console.warn(
      `[workflow-loader] Skipping invalid gates.yaml in workflow "${workflowName}": ${parsed.error.message}`,
    );
    return [];
  } catch {
    console.warn(`[workflow-loader] Failed to read gates.yaml in workflow "${workflowName}"`);
    return [];
  }
}

function loadTools(dir: string, workflowName: string): string[] {
  const filePath = join(dir, 'tools.yaml');
  if (!existsSync(filePath)) return [];

  try {
    const content = readFileSync(filePath, 'utf-8');
    const raw = parseYaml(content);
    const parsed = WorkflowToolsSchema.safeParse(raw);
    if (parsed.success) return parsed.data;

    console.warn(
      `[workflow-loader] Skipping invalid tools.yaml in workflow "${workflowName}": ${parsed.error.message}`,
    );
    return [];
  } catch {
    console.warn(`[workflow-loader] Failed to read tools.yaml in workflow "${workflowName}"`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Intent lookup
// ---------------------------------------------------------------------------

/**
 * Reverse-lookup: find the workflow whose mapped intent matches `intent`.
 * Checks `customMapping` first, then falls back to `WORKFLOW_TO_INTENT`.
 */
export function getWorkflowForIntent(
  workflows: Map<string, WorkflowOverride>,
  intent: string,
  customMapping?: Record<string, string>,
): WorkflowOverride | null {
  // Check custom mapping first (higher priority)
  if (customMapping) {
    for (const [name, wfIntent] of Object.entries(customMapping)) {
      if (wfIntent === intent && workflows.has(name)) {
        return workflows.get(name)!;
      }
    }
  }

  // Fall back to default mapping
  for (const [name, wfIntent] of Object.entries(WORKFLOW_TO_INTENT)) {
    if (wfIntent === intent && workflows.has(name)) {
      return workflows.get(name)!;
    }
  }

  return null;
}
