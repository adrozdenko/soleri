/**
 * Flow loader — reads and validates YAML flow files from a directory.
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { flowSchema, type Flow } from './types.js';

/** Re-export for backward compat (tests import this). */
export const parseSimpleYaml = parseYaml;

/**
 * Load a single flow by its `id` field from *.flow.yaml files in a directory.
 * Returns `null` if not found or validation fails.
 */
export function loadFlowById(flowId: string, flowsDir: string): Flow | null {
  if (!existsSync(flowsDir)) return null;

  const files = readdirSync(flowsDir).filter((f) => f.endsWith('.flow.yaml'));
  for (const file of files) {
    try {
      const content = readFileSync(join(flowsDir, file), 'utf-8');
      const raw = parseYaml(content);
      const parsed = flowSchema.safeParse(raw);
      if (parsed.success && parsed.data.id === flowId) {
        return parsed.data;
      }
    } catch {
      // skip invalid files
    }
  }
  return null;
}

/**
 * Load all valid flows from *.flow.yaml files in a directory.
 */
export function loadAllFlows(flowsDir: string): Flow[] {
  if (!existsSync(flowsDir)) return [];

  const files = readdirSync(flowsDir).filter((f) => f.endsWith('.flow.yaml'));
  const flows: Flow[] = [];
  for (const file of files) {
    try {
      const content = readFileSync(join(flowsDir, file), 'utf-8');
      const raw = parseYaml(content);
      const parsed = flowSchema.safeParse(raw);
      if (parsed.success) {
        flows.push(parsed.data);
      }
    } catch {
      // skip invalid files
    }
  }
  return flows;
}
