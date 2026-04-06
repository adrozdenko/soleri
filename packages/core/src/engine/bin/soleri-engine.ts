#!/usr/bin/env node
/**
 * Soleri Knowledge Engine — MCP Server
 *
 * Reads agent.yaml, boots the runtime, registers all tools, connects stdio.
 *
 * Usage:
 *   npx @soleri/engine --agent ./agent.yaml
 *   node dist/engine/bin/soleri-engine.js --agent ./agent.yaml
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgentRuntime } from '../../runtime/runtime.js';
import { registerEngine } from '../register-engine.js';
import { createCoreOps } from '../core-ops.js';
import { seedDefaultPlaybooks } from '../../playbooks/playbook-seeder.js';
import { agentVaultPath } from '../../paths.js';
import { checkForUpdate } from '../../update-check.js';
import { syncSkillsToClaudeCode } from '../../skills/sync-skills.js';
import type { AgentIdentityConfig } from '../core-ops.js';

// ─── Parse CLI args ───────────────────────────────────────────────────

function parseArgs(): { agentYamlPath: string } {
  const args = process.argv.slice(2);
  let agentYamlPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent' && args[i + 1]) {
      agentYamlPath = resolve(args[i + 1]);
      break;
    }
  }

  if (!agentYamlPath) {
    // Default: look for agent.yaml in cwd
    agentYamlPath = resolve('agent.yaml');
  }

  if (!existsSync(agentYamlPath)) {
    console.error(`[soleri-engine] agent.yaml not found: ${agentYamlPath}`);
    console.error('Usage: soleri-engine --agent ./agent.yaml');
    process.exit(1);
  }

  return { agentYamlPath };
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { agentYamlPath } = parseArgs();
  const agentDir = dirname(agentYamlPath);

  // 1. Read agent.yaml
  const raw = readFileSync(agentYamlPath, 'utf-8');
  const config = parseYaml(raw) as Record<string, unknown>;

  const agentId = config.id as string;
  const tag = `[${agentId}]`;

  console.error(`${tag} Starting Soleri Knowledge Engine...`);
  console.error(`${tag} Agent: ${config.name} (${agentId})`);
  console.error(`${tag} Format: file-tree`);

  // 2. Resolve vault path (default: ~/.soleri/{agentId}/vault.db)
  const engineConfig = (config.engine ?? {}) as Record<string, unknown>;
  const vaultPath = engineConfig.vault
    ? resolve((engineConfig.vault as string).replace(/^~/, homedir()))
    : agentVaultPath(agentId);

  // 3. Create runtime (with persona from agent.yaml if present)
  const personaConfig = config.persona as Record<string, unknown> | undefined;
  const runtime = createAgentRuntime({
    agentId,
    vaultPath,
    agentDir,
    persona: personaConfig as import('../../persona/types.js').PersonaConfig | undefined,
  });

  console.error(`${tag} Vault: ${vaultPath}`);
  console.error(`${tag} Vault entries: ${runtime.vault.stats().totalEntries}`);

  // 4. Connect linked vaults
  const vaults = (config.vaults ?? []) as Array<{ name: string; path: string; priority?: number }>;
  for (const vault of vaults) {
    try {
      const vaultAbsPath = resolve(vault.path.replace(/^~/, homedir()));
      runtime.vaultManager.connect(vault.name, vaultAbsPath, vault.priority ?? 0.5);
      console.error(`${tag} Linked vault: ${vault.name} (${vaultAbsPath})`);
    } catch (err) {
      console.error(
        `${tag} Warning: failed to connect vault "${vault.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 4b. Post-connection: rebuild brain index and backfill Zettelkasten links
  if (vaults.length > 0) {
    try {
      // Rebuild TF-IDF vocabulary to include entries from connected vaults
      runtime.brain.rebuildVocabulary();
      const brainStats = runtime.brain.getStats();
      console.error(`${tag} Brain indexed: ${brainStats.vocabularySize} terms`);

      // Backfill Zettelkasten links for orphan entries
      if (runtime.linkManager) {
        const orphans = runtime.linkManager.getOrphans(50);
        if (orphans.length > 0) {
          let linked = 0;
          for (const orphan of orphans) {
            const suggestions = runtime.linkManager.suggestLinks(orphan.id, 3);
            for (const s of suggestions) {
              if (s.score > 0.3) {
                runtime.linkManager.addLink(orphan.id, s.entryId, s.suggestedType);
                linked++;
              }
            }
          }
          if (linked > 0) {
            console.error(`${tag} Zettelkasten: linked ${linked} orphan entries`);
          }
        }
      }
    } catch (err) {
      console.error(
        `${tag} Warning: post-connection indexing failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 5. Seed intelligence data from knowledge/ directory
  const knowledgeDir = join(agentDir, 'knowledge');
  if (existsSync(knowledgeDir)) {
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(knowledgeDir).filter((f: string) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const bundle = JSON.parse(readFileSync(join(knowledgeDir, file), 'utf-8'));
        if (bundle.entries && Array.isArray(bundle.entries) && bundle.entries.length > 0) {
          const seeded = runtime.vault.seed(bundle.entries);
          console.error(`${tag} Seeded ${seeded} entries from ${file}`);
        }
      } catch {
        // Skip invalid bundles
      }
    }
  }

  // 6. Seed default playbooks
  seedDefaultPlaybooks(runtime.vault);

  // Log vault stats for first-run visibility
  const vaultStats = runtime.vault.stats();
  console.error(
    `${tag} Vault: ${vaultStats.totalEntries} entries (${Object.entries(vaultStats.byType ?? {})
      .map(([t, n]) => `${n} ${t}`)
      .join(', ')})`,
  );

  // 6b. Auto-sync skills to project-local .claude/skills/
  const skillsDir = join(agentDir, 'skills');
  if (existsSync(skillsDir)) {
    const syncResult = syncSkillsToClaudeCode([skillsDir], config.name as string, {
      projectRoot: process.cwd(),
    });
    const total = syncResult.installed.length + syncResult.updated.length;
    if (total > 0) {
      console.error(
        `${tag} Skills synced: ${syncResult.installed.length} new, ${syncResult.updated.length} updated`,
      );
    }
    if (syncResult.removed.length) {
      console.error(`${tag} Removed ${syncResult.removed.length} orphaned skill(s)`);
    }
    if (syncResult.cleanedGlobal.length) {
      console.error(`${tag} Cleaned ${syncResult.cleanedGlobal.length} stale global skill(s)`);
    }
  }

  // 7. Load domain packs
  const packs = (config.packs ?? []) as Array<{ name: string; package: string; version?: string }>;
  const loadedPacks: Array<{ name: string; facades?: Array<{ name: string; ops: unknown[] }> }> =
    [];

  if (packs.length > 0) {
    try {
      const { loadDomainPacksFromConfig } = await import('../../domain-packs/loader.js');
      const refs = packs.map((p) => ({ name: p.name, package: p.package, version: p.version }));
      const manifests = await loadDomainPacksFromConfig(refs);

      // Packs activate sequentially — order may matter for dependencies
      const { createPackRuntime } = await import('../../domain-packs/pack-runtime.js');
      const narrowedRuntime = createPackRuntime({
        ...runtime,
        agencyManager: runtime.agencyManager,
      });

      for (const manifest of manifests) {
        if (manifest.onActivate) {
          await manifest.onActivate(narrowedRuntime, runtime); // eslint-disable-line no-await-in-loop
        }
        loadedPacks.push(manifest);
        console.error(`${tag} Domain pack: ${manifest.name}`);
      }
    } catch (err) {
      console.error(
        `${tag} Warning: domain pack loading failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // 8. Build identity config from agent.yaml
  const identity: AgentIdentityConfig = {
    id: agentId,
    name: config.name as string,
    role: config.role as string,
    description: config.description as string,
    domains: (config.domains ?? []) as string[],
    principles: (config.principles ?? []) as string[],
    tone: (config.tone as string) ?? 'pragmatic',
    greeting: config.greeting as string | undefined,
    agency: (config.agency as boolean) ?? false,
  };

  // 9. Create core ops
  const coreOps = createCoreOps(runtime, identity);

  // 10. Create MCP server
  const server = new McpServer({
    name: `${agentId}-engine`,
    version: '1.0.0',
  });

  // 11. Register persona prompt (uses composable persona system)
  server.prompt('persona', 'Get agent persona and character instructions', () => ({
    messages: [
      {
        role: 'user' as const,
        content: {
          type: 'text' as const,
          text: runtime.personaInstructions.instructions,
        },
      },
    ],
  }));

  // 12. Register all engine tools
  const { tools, totalOps, registerTool } = registerEngine(server, runtime, {
    agentId,
    coreOps,
    domains: identity.domains,
    domainPacks: loadedPacks as Parameters<typeof registerEngine>[2]['domainPacks'],
    hotOps: [
      'search_intelligent',
      'capture_knowledge',
      'orchestrate_plan',
      'orchestrate_execute',
      'orchestrate_complete',
    ],
    authPolicy: () => runtime.authPolicy,
  });

  console.error(`${tag} Registered ${tools.length} tools (${totalOps} ops)`);

  // Enable hot reload for post-boot pack/plugin installation
  const { setHotRegister } = await import('../../runtime/pack-ops.js');
  setHotRegister(registerTool);

  // 13. Connect stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`${tag} Engine ready — listening on stdio`);

  // 14. Check for updates (fire-and-forget — never blocks, never throws)
  const enginePkgPath = new URL('../../../package.json', import.meta.url);
  try {
    const enginePkg = JSON.parse(readFileSync(enginePkgPath, 'utf-8'));
    checkForUpdate(agentId, enginePkg.version ?? '0.0.0').catch(() => {});
  } catch {
    // package.json not readable — skip update check silently
  }

  // 15. Graceful shutdown
  const shutdown = () => {
    console.error(`${tag} Shutting down...`);
    runtime.close();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('[soleri-engine] Fatal:', err);
  process.exit(1);
});
