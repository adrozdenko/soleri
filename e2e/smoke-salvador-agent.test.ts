/**
 * Smoke test: Scaffold a "Salvador" agent with all 4 domain packs
 * and verify it boots, registers all ops, and can execute them.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { scaffold } from '@soleri/forge/lib';
import {
  createAgentRuntime,
  createSemanticFacades,
  createDomainFacades,
  type AgentRuntime,
  type FacadeConfig,
} from '@soleri/core';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Import all 4 domain packs (from source — packages not built yet)
import designPack from '@soleri/domain-design';
import componentPack from '@soleri/domain-component';
import designQaPack from '@soleri/domain-design-qa';
import codeReviewPack from '@soleri/domain-code-review';

const TEST_DIR = join(tmpdir(), 'soleri-smoke-salvador-' + Date.now());
const AGENT_ID = 'salvador-test';

describe('Salvador Agent Smoke Test', () => {
  let runtime: AgentRuntime;
  let allFacades: FacadeConfig[];

  afterAll(() => {
    if (runtime) runtime.close();
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should scaffold the agent project', () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const result = scaffold({
      id: AGENT_ID,
      name: 'Salvador',
      role: 'Design System Intelligence',
      description:
        'Design system advisor with WCAG contrast, token validation, component patterns, and code review.',
      domains: ['design'],
      principles: [
        'Consistency over novelty',
        'Accessible by default',
        'Every pixel needs a reason',
      ],
      tone: 'precise',
      outputDir: TEST_DIR,
    });

    expect(result.success).toBe(true);
    expect(existsSync(join(TEST_DIR, AGENT_ID, 'src', 'index.ts'))).toBe(true);
  });

  it('should create runtime and load all domain packs', () => {
    runtime = createAgentRuntime({
      agentId: AGENT_ID,
      vaultPath: ':memory:',
    });

    const packs = [designPack, componentPack, designQaPack, codeReviewPack];

    const semanticFacades = createSemanticFacades(runtime, AGENT_ID);
    // Collect all domains from packs + explicit domains
    const allDomains = [...new Set(['design', ...packs.flatMap((p) => p.domains)])];
    const domainFacades = createDomainFacades(runtime, AGENT_ID, allDomains, packs);

    allFacades = [...semanticFacades, ...domainFacades];

    // Should have semantic facades + domain facades + pack standalone facades
    expect(allFacades.length).toBeGreaterThan(13); // 13 semantic + domain + pack facades
  });

  it('should register 65+ domain ops from packs', () => {
    const domainFacades = allFacades.filter(
      (f) =>
        !f.name.startsWith(`${AGENT_ID}_vault`) &&
        !f.name.startsWith(`${AGENT_ID}_plan`) &&
        !f.name.startsWith(`${AGENT_ID}_brain`) &&
        !f.name.startsWith(`${AGENT_ID}_memory`) &&
        !f.name.startsWith(`${AGENT_ID}_admin`) &&
        !f.name.startsWith(`${AGENT_ID}_curator`) &&
        !f.name.startsWith(`${AGENT_ID}_loop`) &&
        !f.name.startsWith(`${AGENT_ID}_orchestrate`) &&
        !f.name.startsWith(`${AGENT_ID}_control`) &&
        !f.name.startsWith(`${AGENT_ID}_context`) &&
        !f.name.startsWith(`${AGENT_ID}_agency`) &&
        !f.name.startsWith(`${AGENT_ID}_chat`) &&
        !f.name.startsWith(`${AGENT_ID}_playbook`),
    );

    const totalDomainOps = domainFacades.reduce((sum, f) => sum + f.ops.length, 0);
    // 65 domain ops from packs + 5 standard fallbacks on 'design' domain
    expect(totalDomainOps).toBeGreaterThanOrEqual(60);
  });

  // --- Design pack ops ---

  it('check_contrast should calculate WCAG ratio', async () => {
    const designFacade = allFacades.find(
      (f) => f.name.includes('design') && !f.name.includes('rules') && !f.name.includes('patterns'),
    );
    const op = designFacade!.ops.find((o) => o.name === 'check_contrast')!;
    const result = (await op.handler({
      foreground: '#000000',
      background: '#FFFFFF',
      context: 'text',
    })) as { ratio: number; verdict: string; wcagLevel: string };

    expect(result.ratio).toBeCloseTo(21, 0);
    expect(result.verdict).toBe('PASS');
    expect(result.wcagLevel).toBe('AAA');
  });

  it('validate_component_code should detect violations', async () => {
    const designFacade = allFacades.find(
      (f) => f.name.includes('design') && !f.name.includes('rules') && !f.name.includes('patterns'),
    );
    const op = designFacade!.ops.find((o) => o.name === 'validate_component_code')!;
    const result = (await op.handler({
      code: '<div className="p-[13px] text-[15px]">Bad</div>',
    })) as { valid: boolean; score: number; violations: unknown[] };

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('design_rules facade should be registered', () => {
    const rulesFacade = allFacades.find((f) => f.name.includes('design_rules'));
    expect(rulesFacade).toBeDefined();
    expect(rulesFacade!.ops.length).toBe(15);
  });

  it('design_patterns facade should be registered', () => {
    const patternsFacade = allFacades.find((f) => f.name.includes('design_patterns'));
    expect(patternsFacade).toBeDefined();
    expect(patternsFacade!.ops.length).toBe(10);
  });

  // --- Component pack ops ---

  it('component pack ops should be available', () => {
    const componentFacade = allFacades.find((f) => f.name.includes('component'));
    expect(componentFacade).toBeDefined();
    const opNames = componentFacade!.ops.map((o) => o.name);
    expect(opNames).toContain('analyze_dependencies');
  });

  it('analyze_dependencies should parse imports', async () => {
    const componentFacade = allFacades.find((f) => f.name.includes('component'));
    const op = componentFacade!.ops.find((o) => o.name === 'analyze_dependencies')!;
    const result = (await op.handler({
      code: "import { Button } from '@/components/ui/button';\nimport React from 'react';",
    })) as { internal: unknown[]; external: unknown[] };

    expect(result.internal.length).toBeGreaterThanOrEqual(1);
    expect(result.external.length).toBeGreaterThanOrEqual(1);
  });

  // --- Design QA pack ops ---

  it('design-qa pack should be registered', () => {
    const designQaFacade = allFacades.find((f) => f.name.includes('design_qa'));
    expect(designQaFacade).toBeDefined();
    const opNames = designQaFacade!.ops.map((o) => o.name);
    expect(opNames).toContain('detect_token_drift');
    expect(opNames).toContain('accessibility_precheck');
  });

  it('accessibility_precheck should check contrast pairs', async () => {
    const designQaFacade = allFacades.find((f) => f.name.includes('design_qa'));
    const op = designQaFacade!.ops.find((o) => o.name === 'accessibility_precheck')!;
    const result = (await op.handler({
      colorPairs: [
        { foreground: '#000000', background: '#FFFFFF' },
        { foreground: '#CCCCCC', background: '#DDDDDD' },
      ],
    })) as { results: Array<{ passes: boolean }> };

    expect(result.results[0].passes).toBe(true);
    expect(result.results[1].passes).toBe(false);
  });

  // --- Code review pack ops ---

  it('code-review pack should be registered', () => {
    const reviewFacade = allFacades.find((f) => f.name.includes('code_review'));
    expect(reviewFacade).toBeDefined();
    const opNames = reviewFacade!.ops.map((o) => o.name);
    expect(opNames).toContain('review_pr_design');
    expect(opNames).toContain('accessibility_audit');
  });

  it('review_pr_design should detect hex colors in diffs', async () => {
    const reviewFacade = allFacades.find((f) => f.name.includes('code_review'));
    const op = reviewFacade!.ops.find((o) => o.name === 'review_pr_design')!;
    const result = (await op.handler({
      files: [
        {
          file: 'src/Button.tsx',
          additions: ['color: #FF0000;', 'background: #00FF00;'],
          deletions: [],
        },
        { file: 'README.md', additions: ['Updated docs'], deletions: [] },
      ],
    })) as { designFiles: number; issues: unknown[]; issuesFound: number };

    expect(result.designFiles).toBe(1); // Only .tsx, not .md
    expect(result.issuesFound).toBeGreaterThan(0);
  });

  // --- Semantic facades still work ---

  it('vault facade should be present with all ops', () => {
    const vaultFacade = allFacades.find((f) => f.name === `${AGENT_ID}_vault`);
    expect(vaultFacade).toBeDefined();
    const opNames = vaultFacade!.ops.map((o) => o.name);
    expect(opNames).toContain('search');
    expect(opNames).toContain('capture_knowledge');
  });

  it('total ops across all facades should exceed 270', () => {
    const totalOps = allFacades.reduce((sum, f) => sum + f.ops.length, 0);
    // 209+ semantic + 65+ domain = 274+
    expect(totalOps).toBeGreaterThanOrEqual(270);
  });
});
