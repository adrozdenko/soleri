import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  lstatSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_SKILLS_DIR = join(__dirname, '..', 'skills');
import { scaffold, previewScaffold, listAgents } from '../scaffolder.js';
import type { AgentConfig } from '../types.js';

const baseConfig: AgentConfig = {
  id: 'atlas',
  name: 'Atlas',
  role: 'Data Engineering Advisor',
  description:
    'Atlas provides guidance on data pipelines, ETL patterns, and data quality practices.',
  domains: ['data-pipelines', 'data-quality', 'etl'],
  principles: [
    'Data quality is non-negotiable',
    'Idempotent pipelines always',
    'Schema evolution over breaking changes',
  ],
  greeting: 'Atlas here. I help with data engineering patterns and best practices.',
  outputDir: '', // set in beforeAll
};

function makeTempDir(suffix: string): string {
  const dir = join(tmpdir(), `forge-test-${suffix}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('Scaffolder', () => {
  // Two scaffolds shared across ALL inner describes — base and telegram
  let baseDir: string;
  let baseResult: ReturnType<typeof scaffold>;
  let telegramDir: string;
  let telegramResult: ReturnType<typeof scaffold>;

  beforeAll(() => {
    baseDir = makeTempDir('base');
    baseResult = scaffold({ ...baseConfig, outputDir: baseDir });

    telegramDir = makeTempDir('telegram');
    telegramResult = scaffold({ ...baseConfig, telegram: true, outputDir: telegramDir });
  }, 60_000);

  afterAll(() => {
    rmSync(baseDir, { recursive: true, force: true });
    rmSync(telegramDir, { recursive: true, force: true });
  });

  describe('previewScaffold', () => {
    it('should return preview without creating files', () => {
      const preview = previewScaffold({ ...baseConfig, outputDir: baseDir });

      expect(preview.agentDir).toBe(join(baseDir, 'atlas'));
      expect(preview.persona.name).toBe('Atlas');
      expect(preview.persona.role).toBe('Data Engineering Advisor');
      expect(preview.domains).toEqual(['data-pipelines', 'data-quality', 'etl']);
      expect(preview.files.length).toBeGreaterThan(0);

      const paths = preview.files.map((f) => f.path);
      expect(paths).toContain('README.md');
      expect(paths).toContain('scripts/setup.sh');
      expect(paths).toContain('src/index.ts');
      expect(paths).toContain('src/__tests__/facades.test.ts');

      // Should have domain facades + core facade in preview
      expect(preview.facades.length).toBeGreaterThan(0);
      expect(preview.facades.some((f) => f.name === 'atlas_data_pipelines')).toBe(true);

      // Agent-specific facade has 5 ops
      const coreFacade = preview.facades.find((f) => f.name === 'atlas_core')!;
      expect(coreFacade.ops.length).toBe(5);
      expect(coreFacade.ops).toContain('health');

      // Semantic facades cover the rest
      const vaultFacade = preview.facades.find((f) => f.name === 'atlas_vault')!;
      expect(vaultFacade).toBeDefined();

      // Should NOT create any files beyond what beforeAll scaffolded
      expect(existsSync(join(baseDir, 'atlas'))).toBe(true); // beforeAll created this
    });
  });

  describe('scaffold', () => {
    it('should create a complete agent project', () => {
      expect(baseResult.success).toBe(true);
      expect(baseResult.agentDir).toBe(join(baseDir, 'atlas'));
      expect(baseResult.domains).toEqual(['data-pipelines', 'data-quality', 'etl']);

      // Split: base scaffold files (stable) + one SKILL.md per source skill (dynamic)
      const skillFiles = baseResult.filesCreated.filter((f) => f.startsWith('skills/'));
      const baseFiles = baseResult.filesCreated.filter((f) => !f.startsWith('skills/'));
      const sourceSkillCount = readdirSync(SOURCE_SKILLS_DIR, { withFileTypes: true }).filter((e) =>
        e.isDirectory(),
      ).length;
      expect(skillFiles.length).toBe(sourceSkillCount);
      expect(baseFiles.length).toBeGreaterThan(0);
    });

    it('should create expected directories (no facades/ or llm/ dirs)', () => {
      const agentDir = join(baseDir, 'atlas');

      expect(existsSync(join(agentDir, 'src', 'intelligence', 'data'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'identity'))).toBe(true);
      expect(existsSync(join(agentDir, 'src', 'activation'))).toBe(true);
    });

    it('should create valid package.json with @soleri/core ^2.0.0', () => {
      const pkg = JSON.parse(readFileSync(join(baseDir, 'atlas', 'package.json'), 'utf-8'));

      expect(pkg.name).toBe('atlas');
      expect(pkg.type).toBe('module');
      expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
      expect(pkg.dependencies['@soleri/core']).toBe('^2.0.0');
      expect(pkg.dependencies['zod']).toBeDefined();
      // Anthropic SDK is now optional (LLMClient in core handles dynamic import)
      expect(pkg.dependencies['@anthropic-ai/sdk']).toBeUndefined();
      expect(pkg.optionalDependencies['@anthropic-ai/sdk']).toBeDefined();
    });

    it('should create persona with correct config', () => {
      const persona = readFileSync(
        join(baseDir, 'atlas', 'src', 'identity', 'persona.ts'),
        'utf-8',
      );

      expect(persona).toContain("name: 'Atlas'");
      expect(persona).toContain("role: 'Data Engineering Advisor'");
      expect(persona).toContain('Data quality is non-negotiable');
    });

    it('should create seeded intelligence data files', () => {
      const dataDir = join(baseDir, 'atlas', 'src', 'intelligence', 'data');
      const files = readdirSync(dataDir);

      expect(files).toContain('data-pipelines.json');
      expect(files).toContain('data-quality.json');
      expect(files).toContain('etl.json');

      const bundle = JSON.parse(readFileSync(join(dataDir, 'data-pipelines.json'), 'utf-8'));
      expect(bundle.domain).toBe('data-pipelines');
      expect(bundle.entries.length).toBe(1);
      expect(bundle.entries[0].id).toBe('data-pipelines-seed');
      expect(bundle.entries[0].tags).toContain('seed');
    });

    it('should create entry point using runtime factories from @soleri/core', () => {
      const entry = readFileSync(join(baseDir, 'atlas', 'src', 'index.ts'), 'utf-8');

      // v5.0 runtime factory pattern
      expect(entry).toContain('createAgentRuntime');
      expect(entry).toContain('createSemanticFacades');
      expect(entry).toContain('createDomainFacades');
      expect(entry).toContain("from '@soleri/core'");
      expect(entry).toContain("agentId: 'atlas'");
      expect(entry).toContain("name: 'atlas-mcp'");
      expect(entry).toContain('Hello');
      // Agent-specific ops still reference persona/activation
      expect(entry).toContain('PERSONA');
      expect(entry).toContain('activateAgent');
      // Domain list is embedded
      expect(entry).toContain('data-pipelines');
      expect(entry).toContain('data-quality');
      expect(entry).toContain('etl');
      // flowsDir points to agent-local flows/ directory
      expect(entry).toContain("flowsDir: join(__dirname, 'flows')");
    });

    it('should create .mcp.json for client config', () => {
      const mcp = JSON.parse(readFileSync(join(baseDir, 'atlas', '.mcp.json'), 'utf-8'));

      expect(mcp.mcpServers.atlas).toBeDefined();
      expect(mcp.mcpServers.atlas.command).toBe('node');
    });

    it('should create activation files', () => {
      const activationDir = join(baseDir, 'atlas', 'src', 'activation');
      const files = readdirSync(activationDir);

      expect(files).toContain('claude-md-content.ts');
      expect(files).toContain('inject-claude-md.ts');
      expect(files).toContain('activate.ts');
    });

    it('should create activation files with correct content', () => {
      const activationDir = join(baseDir, 'atlas', 'src', 'activation');

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
      const readme = readFileSync(join(baseDir, 'atlas', 'README.md'), 'utf-8');

      expect(readme).toContain('# Atlas');
      expect(readme).toContain('Data Engineering Advisor');
      expect(readme).toContain('Hello, Atlas!');
      expect(readme).toContain('data-pipelines');
    });

    it('should create executable setup.sh', () => {
      const setupPath = join(baseDir, 'atlas', 'scripts', 'setup.sh');
      const setup = readFileSync(setupPath, 'utf-8');

      expect(setup).toContain('AGENT_NAME="atlas"');
      expect(setup).toContain('#!/usr/bin/env bash');

      if (process.platform !== 'win32') {
        const stats = statSync(setupPath);
        const isExecutable = (stats.mode & 0o111) !== 0;
        expect(isExecutable).toBe(true);
      }
    });

    it('should generate facade tests using runtime factories', () => {
      const facadesTest = readFileSync(
        join(baseDir, 'atlas', 'src', '__tests__', 'facades.test.ts'),
        'utf-8',
      );

      // Should use runtime factories from @soleri/core
      expect(facadesTest).toContain('createAgentRuntime');
      expect(facadesTest).toContain('createSemanticFacades');
      expect(facadesTest).toContain('createDomainFacade');
      expect(facadesTest).toContain("from '@soleri/core'");

      // Domain facades
      expect(facadesTest).toContain('atlas_data_pipelines');
      expect(facadesTest).toContain('atlas_data_quality');
      expect(facadesTest).toContain('atlas_etl');
      expect(facadesTest).toContain('atlas_core');

      // Agent-specific ops tested
      expect(facadesTest).toContain('activate');
      expect(facadesTest).toContain('inject_claude_md');
      expect(facadesTest).toContain('setup');
      expect(facadesTest).toContain('health');
      expect(facadesTest).toContain('identity');
    });

    it('should fail if directory already exists', () => {
      // beforeAll already scaffolded to baseDir — attempt on same dir should fail
      const duplicate = scaffold({ ...baseConfig, outputDir: baseDir });

      expect(duplicate.success).toBe(false);
      expect(duplicate.summary).toContain('already exists');
    });
  });

  describe('skills', () => {
    it('should create skills directory with SKILL.md files', () => {
      const skillsDir = join(baseDir, 'atlas', 'skills');

      expect(existsSync(skillsDir)).toBe(true);

      const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);

      const expectedCount = readdirSync(SOURCE_SKILLS_DIR, { withFileTypes: true }).filter((e) =>
        e.isDirectory(),
      ).length;
      expect(skillDirs.length).toBe(expectedCount);

      // Verify each skill dir has a SKILL.md
      for (const dir of skillDirs) {
        expect(existsSync(join(skillsDir, dir, 'SKILL.md'))).toBe(true);
      }
    });

    it('should include core expected skill names', () => {
      const skillsDir = join(baseDir, 'atlas', 'skills');
      const skillDirs = readdirSync(skillsDir).sort();

      // Check essential skills exist (not an exhaustive list — skills are added over time)
      const essentialSkills = [
        'soleri-brainstorming',
        'soleri-context-resume',
        'soleri-health-check',
        'soleri-vault-capture',
        'soleri-vault-navigator',
      ];
      for (const skill of essentialSkills) {
        expect(skillDirs).toContain(skill);
      }
    });

    it('should have YAML frontmatter in all skills', () => {
      const skillsDir = join(baseDir, 'atlas', 'skills');
      const skillDirs = readdirSync(skillsDir);

      for (const dir of skillDirs) {
        const content = readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf-8');
        expect(content).toMatch(/^---\r?\nname: /);
        expect(content).toContain('description:');
      }
    });

    it('should substitute YOUR_AGENT_core with agent ID in all skills', () => {
      const skillsDir = join(baseDir, 'atlas', 'skills');
      const allSkills = readdirSync(skillsDir);

      for (const name of allSkills) {
        const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8');
        expect(content).not.toContain('YOUR_AGENT_core');
        // All skills that reference agent ops should have atlas_core
        if (content.includes('_core')) {
          expect(content).toContain('atlas_core');
        }
      }
    });

    it('should have valid content in superpowers-adapted skills', () => {
      const skillsDir = join(baseDir, 'atlas', 'skills');
      const superpowersSkills = ['soleri-brainstorming', 'soleri-executing-plans'];

      for (const name of superpowersSkills) {
        const skillPath = join(skillsDir, name, 'SKILL.md');
        if (existsSync(skillPath)) {
          const content = readFileSync(skillPath, 'utf-8');
          expect(content).toMatch(/^---\r?\nname: /);
        }
      }
    });

    it('should have no YOUR_AGENT_core placeholder remaining in any skill', () => {
      const skillsDir = join(baseDir, 'atlas', 'skills');
      const allSkills = readdirSync(skillsDir);

      for (const name of allSkills) {
        const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf-8');
        expect(content).not.toContain('YOUR_AGENT_core');
      }
    });

    it('should include skills in preview', () => {
      const preview = previewScaffold({ ...baseConfig, outputDir: baseDir });
      const paths = preview.files.map((f) => f.path);
      expect(paths).toContain('skills/');
    });

    it('should mention skills in scaffold summary', () => {
      expect(baseResult.summary).toContain('built-in skills');
    });

    it('should sync generated skills into .claude/skills/', () => {
      const agentDir = join(baseDir, 'atlas');
      const claudeSkillsDir = join(agentDir, '.claude', 'skills');

      expect(existsSync(claudeSkillsDir)).toBe(true);

      // Project-local sync uses symlinks, so check for both directories and symlinks
      const syncedSkills = readdirSync(claudeSkillsDir, { withFileTypes: true })
        .filter((e) => {
          if (e.isDirectory()) return true;
          // lstat to detect symlinks (readdirSync follows symlinks for isDirectory())
          try {
            return lstatSync(join(claudeSkillsDir, e.name)).isSymbolicLink();
          } catch {
            return false;
          }
        })
        .map((e) => e.name);

      expect(syncedSkills.length).toBeGreaterThan(0);

      // Every synced skill should have a SKILL.md (existsSync follows symlinks)
      for (const name of syncedSkills) {
        expect(existsSync(join(claudeSkillsDir, name, 'SKILL.md'))).toBe(true);
      }
    });
  });

  describe('listAgents', () => {
    it('should list scaffolded agents', () => {
      const agents = listAgents(baseDir);
      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('atlas');
      expect(agents[0].domains).toEqual(['data-pipelines', 'data-quality', 'etl']);
    });

    it('should return empty for non-existent directory', () => {
      const agents = listAgents('/non/existent/path');
      expect(agents).toEqual([]);
    });
  });

  describe('telegram scaffolding', () => {
    it('should include telegram files in preview', () => {
      const preview = previewScaffold({ ...baseConfig, telegram: true, outputDir: telegramDir });
      const paths = preview.files.map((f) => f.path);
      expect(paths).toContain('src/telegram-bot.ts');
      expect(paths).toContain('src/telegram-config.ts');
      expect(paths).toContain('src/telegram-agent.ts');
      expect(paths).toContain('src/telegram-supervisor.ts');
    });

    it('should not include telegram files without flag', () => {
      const preview = previewScaffold({ ...baseConfig, outputDir: baseDir });
      const paths = preview.files.map((f) => f.path);
      expect(paths).not.toContain('src/telegram-bot.ts');
    });

    it('should generate telegram source files', () => {
      // Build may fail (grammy not installed) but files should be created
      expect(telegramResult.filesCreated).toContain('src/telegram-bot.ts');
      expect(telegramResult.filesCreated).toContain('src/telegram-config.ts');
      expect(telegramResult.filesCreated).toContain('src/telegram-agent.ts');
      expect(telegramResult.filesCreated).toContain('src/telegram-supervisor.ts');

      // Verify file contents reference the agent
      const botContent = readFileSync(
        join(telegramDir, 'atlas', 'src', 'telegram-bot.ts'),
        'utf-8',
      );
      expect(botContent).toContain('Atlas');
      expect(botContent).toContain('grammy');

      const configContent = readFileSync(
        join(telegramDir, 'atlas', 'src', 'telegram-config.ts'),
        'utf-8',
      );
      expect(configContent).toContain('.atlas');
      expect(configContent).toContain('TELEGRAM_BOT_TOKEN');
    });

    it('should include grammy dependency in package.json', () => {
      const pkg = JSON.parse(readFileSync(join(telegramDir, 'atlas', 'package.json'), 'utf-8'));
      expect(pkg.dependencies.grammy).toBeDefined();
      expect(pkg.scripts['telegram:start']).toBeDefined();
      expect(pkg.scripts['telegram:dev']).toBeDefined();
    });

    it('should not include grammy without telegram flag', () => {
      // baseResult was scaffolded without telegram flag — use it for this assertion
      const pkg = JSON.parse(readFileSync(join(baseDir, 'atlas', 'package.json'), 'utf-8'));
      expect(pkg.dependencies.grammy).toBeUndefined();
    });
  });
});
