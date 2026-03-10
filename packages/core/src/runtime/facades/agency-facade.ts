/**
 * Agency facade — proactive file watching, pattern surfacing, warning detection.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';

export function createAgencyFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { agencyManager } = runtime;

  return [
    {
      name: 'agency_enable',
      description:
        'Enable agency mode — starts proactive file watching, pattern surfacing, and warning detection.',
      auth: 'write',
      schema: z.object({
        projectPath: z.string().optional().describe('Project root to watch. Default: "."'),
      }),
      handler: async (params) => {
        const projectPath = (params.projectPath as string) ?? '.';
        agencyManager.enable(projectPath);
        return agencyManager.getStatus();
      },
    },
    {
      name: 'agency_disable',
      description: 'Disable agency mode — stops file watching and clears pending state.',
      auth: 'write',
      handler: async () => {
        agencyManager.disable();
        return agencyManager.getStatus();
      },
    },
    {
      name: 'agency_status',
      description: 'Get agency mode status — enabled, watching, detectors, pending warnings.',
      auth: 'read',
      handler: async () => {
        return agencyManager.getStatus();
      },
    },
    {
      name: 'agency_config',
      description: 'Update agency configuration — watch paths, extensions, debounce, thresholds.',
      auth: 'write',
      schema: z.object({
        watchPaths: z.array(z.string()).optional(),
        ignorePatterns: z.array(z.string()).optional(),
        extensions: z.array(z.string()).optional(),
        debounceMs: z.number().optional(),
        minPatternConfidence: z.number().optional(),
        cooldownMs: z.number().optional(),
      }),
      handler: async (params) => {
        agencyManager.updateConfig(params as Record<string, unknown>);
        return agencyManager.getStatus();
      },
    },
    {
      name: 'agency_scan_file',
      description: 'Manually scan a file for warnings using registered detectors.',
      auth: 'read',
      schema: z.object({
        filePath: z.string().describe('Path to file to scan.'),
      }),
      handler: async (params) => {
        const warnings = agencyManager.scanFile(params.filePath as string);
        return { warnings, count: warnings.length };
      },
    },
    {
      name: 'agency_warnings',
      description: 'Get all pending warnings from recent file scans.',
      auth: 'read',
      handler: async () => {
        const warnings = agencyManager.getPendingWarnings();
        return { warnings, count: warnings.length };
      },
    },
    {
      name: 'agency_surface_patterns',
      description: 'Surface vault patterns relevant to a file change.',
      auth: 'read',
      schema: z.object({
        filePath: z.string().describe('File path that changed.'),
      }),
      handler: async (params) => {
        const patterns = agencyManager.surfacePatterns(params.filePath as string);
        return { patterns, count: patterns.length };
      },
    },
    {
      name: 'agency_clarify',
      description: 'Generate a clarification question when intent is ambiguous (low confidence).',
      auth: 'read',
      schema: z.object({
        prompt: z.string().describe('The user prompt to analyze.'),
        confidence: z.number().describe('Current intent classification confidence (0-1).'),
      }),
      handler: async (params) => {
        const question = agencyManager.generateClarification(
          params.prompt as string,
          params.confidence as number,
        );
        return question ?? { clarificationNeeded: false };
      },
    },
  ];
}
