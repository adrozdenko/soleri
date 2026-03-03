import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scaffold, previewScaffold, listAgents } from '../scaffolder.js';
import type { AgentConfig } from '../types.js';

describe('Scaffolder', () => {
  let tempDir: string;

  const testConfig: AgentConfig = {
    id: 'atlas',
    name: 'Atlas',
    role: 'Data Engineering Advisor',
    description: 'Atlas provides guidance on data pipelines, ETL patterns, and data quality practices.',
    domains: ['data-pipelines', 'data-quality', 'etl'],
    principles: [
      'Data quality is non-negotiable',
      'Idempotent pipelines always',
      'Schema evolution over breaking changes',
    ],
    greeting: 'Atlas here. I help with data engineering patterns and best practices.',
    outputDir: '', // set in beforeEach
  };

  beforeEach(() => {
    tempDir = join(tmpdir(), `forge-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    testConfig.outputDir = tempDir;
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('previewScaffold', () => {
    it('should return preview without creating files', () => {
      const preview = previewScaffold(testConfig);

      expect(preview.agentDir).toBe(join(tempDir, 'atlas'));
      expect(preview.persona.name).toBe('Atlas');
      expect(preview.persona.role).toBe('Data Engineering Advisor');
      expect(preview.domains).toEqual(['data-pipelines', 'data-quality', 'etl']);
      expect(preview.files.length).toBeGreaterThan(15);

      // Should include README, setup script, and brain
      const paths = preview.files.map((f) => f.path);
      expect(paths).toContain('README.md');
      expect(paths).toContain('scripts/setup.sh');
      expect(paths).toContain('src/brain/brain.ts');
      expect(paths).toContain('src/llm/types.ts');
      expect(paths).toContain('src/llm/llm-client.ts');
      expect(paths).toContain('src/__tests__/llm.test.ts');
      expect(paths).toContain('src/__tests__/brain.test.ts');

      // Should have domain facades + core facade
      expect(preview.facades).toHaveLength(4); // 3 domains + core
      expect(preview.facades[0].name).toBe('atlas_data_pipelines');

      // Should NOT create any files
      expect(existsSync(join(tempDir, 'atlas'))).toBe(false);
    });
  });

  describe('scaffold', () => {
    it('should create a complete agent project', () => {
      const result = scaffold(testConfig);

      expect(result.success).toBe(true);
      expect(result.agentDir).toBe(join(tempDir, 'atlas'));
      expect(result.domains).toEqual(['data-pipelines', 'data-quality', 'etl']);
      expect(result.filesCreated.length).toBeGreaterThan(10);
    });

    it('should create all expected directories', () => {
      scaffold(testConfig);
      const agentDir = join(tempDir, 'atlas');

      expect(existsSync(join(agentDir, 'src', 'facades'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'vault'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'intelligence', 'data'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'identity'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'activation'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'planning'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'brain'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'llm'))).toBe(true);
    });

    it('should create valid package.json', () => {
      scaffold(testConfig);
      const pkg = JSON.parse(readFileSync(join(tempDir, 'atlas', 'package.json'), 'utf-8'));

      expect(pkg.name).toBe('atlas-mcp');
      expect(pkg.type).toBe('module');
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
      expect(pkg.dependencies['better-sqlite3']).toBeDefined();
      expect(pkg.dependencies['zod']).toBeDefined();
      expect(pkg.dependencies['@anthropic-ai/sdk']).toBeDefined();
    });

    it('should create persona with correct config', () => {
      scaffold(testConfig);
      const persona = readFileSync(join(tempDir, 'atlas', 'src', 'identity', 'persona.ts'), 'utf-8');

      expect(persona).toContain("name: 'Atlas'");
      expect(persona).toContain("role: 'Data Engineering Advisor'");
      expect(persona).toContain('Data quality is non-negotiable');
    });

    it('should create domain facades', () => {
      scaffold(testConfig);
      const facadesDir = join(tempDir, 'atlas', 'src', 'facades');
      const files = readdirSync(facadesDir);

      expect(files).toContain('data-pipelines.facade.ts');
      expect(files).toContain('data-quality.facade.ts');
      expect(files).toContain('etl.facade.ts');
      expect(files).toContain('core.facade.ts');
      expect(files).toContain('facade-factory.ts');
      expect(files).toContain('types.ts');
    });

    it('should create empty intelligence data files', () => {
      scaffold(testConfig);
      const dataDir = join(tempDir, 'atlas', 'src', 'intelligence', 'data');
      const files = readdirSync(dataDir);

      expect(files).toContain('data-pipelines.json');
      expect(files).toContain('data-quality.json');
      expect(files).toContain('etl.json');

      // Each file should have empty entries array
      const bundle = JSON.parse(readFileSync(join(dataDir, 'data-pipelines.json'), 'utf-8'));
      expect(bundle.domain).toBe('data-pipelines');
      expect(bundle.entries).toEqual([]);
    });

    it('should create entry point importing all facades', () => {
      scaffold(testConfig);
      const entry = readFileSync(join(tempDir, 'atlas', 'src', 'index.ts'), 'utf-8');

      expect(entry).toContain('createDataPipelinesFacade');
      expect(entry).toContain('createDataQualityFacade');
      expect(entry).toContain('createEtlFacade');
      expect(entry).toContain('createCoreFacade');
      expect(entry).toContain("name: 'atlas-mcp'");
      expect(entry).toContain('Brain');
      expect(entry).toContain('LLMClient');
      expect(entry).toContain('KeyPool');
      expect(entry).toContain('loadKeyPoolConfig');
      expect(entry).toContain('Hello');
    });

    it('should create .mcp.json for client config', () => {
      scaffold(testConfig);
      const mcp = JSON.parse(readFileSync(join(tempDir, 'atlas', '.mcp.json'), 'utf-8'));

      expect(mcp.mcpServers.atlas).toBeDefined();
      expect(mcp.mcpServers.atlas.command).toBe('node');
    });

    it('should create activation files', () => {
      scaffold(testConfig);
      const activationDir = join(tempDir, 'atlas', 'src', 'activation');
      const files = readdirSync(activationDir);

      expect(files).toContain('claude-md-content.ts');
      expect(files).toContain('inject-claude-md.ts');
      expect(files).toContain('activate.ts');
    });

    it('should create activation files with correct content', () => {
      scaffold(testConfig);
      const activationDir = join(tempDir, 'atlas', 'src', 'activation');

      const claudeMd = readFileSync(join(activationDir, 'claude-md-content.ts'), 'utf-8');
      expect(claudeMd).toContain('atlas:mode');
      expect(claudeMd).toContain('getClaudeMdContent');

      const inject = readFileSync(join(activationDir, 'inject-claude-md.ts'), 'utf-8');
      expect(inject).toContain('injectClaudeMd');
      expect(inject).toContain('getClaudeMdContent');

      const activate = readFileSync(join(activationDir, 'activate.ts'), 'utf-8');
      expect(activate).toContain('activateAgent');
      expect(activate).toContain('deactivateAgent');
      expect(activate).toContain('PERSONA');
    });

    it('should create README.md with agent-specific content', () => {
      scaffold(testConfig);
      const readme = readFileSync(join(tempDir, 'atlas', 'README.md'), 'utf-8');

      expect(readme).toContain('# Atlas');
      expect(readme).toContain('Data Engineering Advisor');
      expect(readme).toContain('Hello, Atlas!');
      expect(readme).toContain('Goodbye, Atlas!');
      expect(readme).toContain('data-pipelines');
      expect(readme).toContain('data-quality');
      expect(readme).toContain('etl');
      expect(readme).toContain('Data quality is non-negotiable');
      expect(readme).toContain('./scripts/setup.sh');
    });

    it('should create executable setup.sh with agent-specific content', () => {
      scaffold(testConfig);
      const setupPath = join(tempDir, 'atlas', 'scripts', 'setup.sh');
      const setup = readFileSync(setupPath, 'utf-8');

      // Content checks
      expect(setup).toContain('AGENT_NAME="atlas"');
      expect(setup).toContain('=== Atlas Setup ===');
      expect(setup).toContain('Building Atlas...');
      expect(setup).toContain('Hello, Atlas!');
      expect(setup).toContain('#!/usr/bin/env bash');
      expect(setup).toContain('claude mcp add');

      // Executable permission check
      const stats = statSync(setupPath);
      const isExecutable = (stats.mode & 0o111) !== 0;
      expect(isExecutable).toBe(true);
    });

    it('should create planner file', () => {
      scaffold(testConfig);
      const plannerPath = join(tempDir, 'atlas', 'src', 'planning', 'planner.ts');
      expect(existsSync(plannerPath)).toBe(true);
      const content = readFileSync(plannerPath, 'utf-8');
      expect(content).toContain('class Planner');
      expect(content).toContain('getExecuting');
    });

    it('should create LLM files', () => {
      scaffold(testConfig);
      const llmDir = join(tempDir, 'atlas', 'src', 'llm');
      expect(existsSync(join(llmDir, 'types.ts'))).toBe(true);
      expect(existsSync(join(llmDir, 'utils.ts'))).toBe(true);
      expect(existsSync(join(llmDir, 'key-pool.ts'))).toBe(true);
      expect(existsSync(join(llmDir, 'llm-client.ts'))).toBe(true);

      const client = readFileSync(join(llmDir, 'llm-client.ts'), 'utf-8');
      expect(client).toContain('class LLMClient');
      expect(client).toContain('class ModelRouter');
      expect(client).toContain('.atlas');

      const keyPool = readFileSync(join(llmDir, 'key-pool.ts'), 'utf-8');
      expect(keyPool).toContain('class KeyPool');
      expect(keyPool).toContain('.atlas');
    });

    it('should create brain file with intelligence layer', () => {
      scaffold(testConfig);
      const brainPath = join(tempDir, 'atlas', 'src', 'brain', 'brain.ts');
      expect(existsSync(brainPath)).toBe(true);
      const content = readFileSync(brainPath, 'utf-8');
      expect(content).toContain('class Brain');
      expect(content).toContain('intelligentSearch');
      expect(content).toContain('enrichAndCapture');
      expect(content).toContain('recordFeedback');
      expect(content).toContain('rebuildVocabulary');
    });

    it('should create test files', () => {
      scaffold(testConfig);
      const testsDir = join(tempDir, 'atlas', 'src', '__tests__');
      const files = readdirSync(testsDir);

      expect(files).toContain('vault.test.ts');
      expect(files).toContain('loader.test.ts');
      expect(files).toContain('facades.test.ts');
      expect(files).toContain('planner.test.ts');
      expect(files).toContain('brain.test.ts');
      expect(files).toContain('llm.test.ts');
    });

    it('should generate facade tests referencing all domains', () => {
      scaffold(testConfig);
      const facadesTest = readFileSync(join(tempDir, 'atlas', 'src', '__tests__', 'facades.test.ts'), 'utf-8');

      expect(facadesTest).toContain('atlas_data_pipelines');
      expect(facadesTest).toContain('atlas_data_quality');
      expect(facadesTest).toContain('atlas_etl');
      expect(facadesTest).toContain('atlas_core');
      expect(facadesTest).toContain('createDataPipelinesFacade');
      // Activation ops should be tested
      expect(facadesTest).toContain('activate');
      expect(facadesTest).toContain('inject_claude_md');
      expect(facadesTest).toContain('setup');
      // Memory + planning ops should be tested
      expect(facadesTest).toContain('memory_capture');
      expect(facadesTest).toContain('memory_search');
      expect(facadesTest).toContain('create_plan');
      expect(facadesTest).toContain('complete_plan');
      // Brain ops should be tested
      expect(facadesTest).toContain('record_feedback');
      expect(facadesTest).toContain('rebuild_vocabulary');
      expect(facadesTest).toContain('brain_stats');
      // LLM ops should be tested
      expect(facadesTest).toContain('llm_status');
      expect(facadesTest).toContain('LLMClient');
      expect(facadesTest).toContain('KeyPool');
    });

    it('should fail if directory already exists', () => {
      scaffold(testConfig);
      const result = scaffold(testConfig); // second time

      expect(result.success).toBe(false);
      expect(result.summary).toContain('already exists');
    });
  });

  describe('listAgents', () => {
    it('should list scaffolded agents', () => {
      scaffold(testConfig);

      const agents = listAgents(tempDir);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('atlas');
      expect(agents[0].domains).toEqual(['data-pipelines', 'data-quality', 'etl']);
    });

    it('should return empty for non-existent directory', () => {
      const agents = listAgents('/non/existent/path');
      expect(agents).toEqual([]);
    });
  });

});
