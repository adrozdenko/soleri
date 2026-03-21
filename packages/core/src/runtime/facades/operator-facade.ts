/**
 * Operator facade — personality learning, signals, adaptation.
 * Profile CRUD, signal accumulation, synthesis checks, snapshots.
 */

import { z } from 'zod';
import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import type { ProfileSectionKey, ProfileSection } from '../../operator/operator-types.js';

// ─── Schema helpers ──────────────────────────────────────────────────

const sectionEnum = z.enum([
  'identity',
  'cognition',
  'communication',
  'workingRules',
  'trustModel',
  'tasteProfile',
  'growthEdges',
  'technicalContext',
]);

const signalSchema = z.object({
  id: z.string(),
  signalType: z.string(),
  data: z.record(z.unknown()),
  timestamp: z.string(),
  sessionId: z.string(),
  confidence: z.number(),
  source: z.string().optional(),
});

// ─── Export helpers ──────────────────────────────────────────────────

function profileToMarkdown(profile: Record<string, unknown>): string {
  const lines: string[] = ['# Operator Profile', ''];
  for (const [key, value] of Object.entries(profile)) {
    if (key === 'id' || key === 'operatorId') continue;
    lines.push(`## ${key}`, '', '```json', JSON.stringify(value, null, 2), '```', '');
  }
  return lines.join('\n');
}

// ─── Facade Creator ─────────────────────────────────────────────────

export function createOperatorFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { operatorProfile } = runtime;

  return [
    {
      name: 'profile_get',
      description: 'Get the full operator profile or a specific section.',
      auth: 'read',
      schema: z.object({
        section: sectionEnum.optional().describe('Return only this section'),
      }),
      handler: async (params) => {
        if (params.section) {
          const section = operatorProfile.getSection(params.section as ProfileSectionKey);
          return { section: params.section, data: section };
        }
        const profile = operatorProfile.getProfile();
        return { profile };
      },
    },
    {
      name: 'profile_update_section',
      description: 'Update a specific profile section with new data.',
      auth: 'write',
      schema: z.object({
        section: sectionEnum.describe('Section to update'),
        data: z.record(z.unknown()).describe('New section data'),
        evidence: z.array(z.string()).optional().describe('Evidence trail'),
      }),
      handler: async (params) => {
        const updated = operatorProfile.updateSection(
          params.section as ProfileSectionKey,
          params.data as ProfileSection,
        );
        const profile = operatorProfile.getProfile();
        return { updated, section: params.section, version: profile?.version ?? 0 };
      },
    },
    {
      name: 'profile_correct',
      description: 'Correct a profile section — takes a snapshot before overwriting.',
      auth: 'write',
      schema: z.object({
        section: sectionEnum.describe('Section to correct'),
        data: z.record(z.unknown()).describe('Corrected section data'),
        reason: z.string().describe('Reason for correction'),
      }),
      handler: async (params) => {
        const corrected = operatorProfile.correctSection(
          params.section as ProfileSectionKey,
          params.data as ProfileSection,
        );
        const profile = operatorProfile.getProfile();
        return { corrected, section: params.section, version: profile?.version ?? 0 };
      },
    },
    {
      name: 'profile_delete',
      description: 'Delete the operator profile (takes a snapshot first). Admin only.',
      auth: 'admin',
      schema: z.object({
        section: sectionEnum.optional().describe('Unused — deletes entire profile'),
      }),
      handler: async () => {
        const deleted = operatorProfile.deleteProfile();
        return { deleted, message: deleted ? 'Profile deleted' : 'No profile to delete' };
      },
    },
    {
      name: 'profile_export',
      description: 'Export the operator profile as markdown or JSON string.',
      auth: 'read',
      schema: z.object({
        format: z.enum(['markdown', 'json']).optional().default('json'),
      }),
      handler: async (params) => {
        const profile = operatorProfile.getProfile();
        if (!profile) return { exported: false, reason: 'No profile exists' };
        const profileObj = profile as unknown as Record<string, unknown>;
        if (params.format === 'markdown') {
          return { exported: true, format: 'markdown', content: profileToMarkdown(profileObj) };
        }
        return { exported: true, format: 'json', content: JSON.stringify(profile, null, 2) };
      },
    },
    {
      name: 'signal_accumulate',
      description: 'Accumulate operator signals for later synthesis.',
      auth: 'write',
      schema: z.object({
        signals: z.array(signalSchema).describe('Signals to store'),
      }),
      handler: async (params) => {
        const count = operatorProfile.accumulateSignals(params.signals as never);
        return { stored: count };
      },
    },
    {
      name: 'signal_list',
      description: 'List operator signals with optional filters.',
      auth: 'read',
      schema: z.object({
        types: z.array(z.string()).optional().describe('Filter by signal types'),
        processed: z.boolean().optional().describe('Filter by processed status'),
        limit: z.number().optional().describe('Max results (default 100)'),
      }),
      handler: async (params) => {
        const signals = operatorProfile.listSignals({
          types: params.types as string[] | undefined,
          processed: params.processed as boolean | undefined,
          limit: params.limit as number | undefined,
        });
        return { signals, count: signals.length };
      },
    },
    {
      name: 'signal_stats',
      description: 'Get signal statistics — counts by type, unprocessed total.',
      auth: 'read',
      schema: z.object({}),
      handler: async () => {
        return operatorProfile.signalStats();
      },
    },
    {
      name: 'synthesis_check',
      description: 'Check if a synthesis pass is due based on signal/session thresholds.',
      auth: 'read',
      schema: z.object({}),
      handler: async () => {
        return operatorProfile.synthesisCheck();
      },
    },
    {
      name: 'profile_snapshot',
      description: 'Create a versioned snapshot of the current profile.',
      auth: 'write',
      schema: z.object({
        trigger: z.string().describe('What triggered this snapshot'),
      }),
      handler: async (params) => {
        const snapshotted = operatorProfile.snapshot(params.trigger as string);
        if (!snapshotted) return { snapshotted: false, reason: 'No profile exists' };
        const profile = operatorProfile.getProfile();
        return { snapshotted: true, version: profile?.version ?? 0 };
      },
    },
  ];
}
