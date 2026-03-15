/**
 * Intelligence data loader — reads bundled JSON files at pack activation.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');

let cache: Record<string, unknown> | null = null;

function loadJson<T>(filename: string, fallback: T): T {
  const path = join(DATA_DIR, filename);
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function getDesignData(): Record<string, unknown> {
  if (cache) return cache;

  cache = {
    tokenRules: loadJson('token-rules.json', { forbidden: [], allowed: [], recommendations: {} }),
    designFoundations: loadJson('design-foundations.json', {}),
    uxLaws: loadJson('ux-laws.json', {}),
    colorIntelligence: loadJson('color-intelligence.json', {}),
    designAdvanced: loadJson('design-advanced.json', {}),
    guidance: loadJson('guidance.json', {}),
    cleanCodeRules: loadJson('clean-code-rules.json', {}),
    architecturePatterns: loadJson('architecture-patterns.json', {}),
    variantPhilosophy: loadJson('variant-philosophy.json', {}),
    apiConstraints: loadJson('api-constraints.json', {}),
    stabilizationPatterns: loadJson('stabilization-patterns.json', {}),
    deliveryWorkflow: loadJson('delivery-workflow.json', {}),
    performanceConstraints: loadJson('performance-constraints.json', {}),
    componentDevIntelligence: loadJson('component-dev-intelligence.json', {}),
    defensiveDesign: loadJson('defensive-design.json', {}),
    dialogPatterns: loadJson('dialog-patterns.json', {}),
    uxWriting: loadJson('ux-writing.json', {}),
    componentUsagePatterns: loadJson('component-usage-patterns.json', {}),
    uiPatterns: loadJson('ui-patterns.json', {}),
    operationalExpertise: loadJson('operational-expertise.json', {}),
    shadcnIntelligence: loadJson('shadcn-intelligence.json', {}),
    workflowPatterns: loadJson('workflow-patterns.json', {}),
  };

  return cache;
}

/** Get a specific intelligence section with fallback. */
export function getData<T>(key: string, fallback: T): T {
  const data = getDesignData();
  return (data[key] as T) ?? fallback;
}
