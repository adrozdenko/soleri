import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command } from 'commander';
import * as p from '@clack/prompts';
import { installKnowledge } from '@soleri/forge/lib';
import { detectAgent } from '../utils/agent-context.js';

/**
 * Resolve a pack identifier to a local path.
 * If `pack` is a local path, return it directly.
 * If it looks like a package name, download from npm.
 */
async function resolvePackPath(pack: string): Promise<string> {
  // Local path — use directly
  if (pack.startsWith('.') || pack.startsWith('/') || existsSync(pack)) {
    return resolve(pack);
  }

  // npm package name — resolve to @soleri/knowledge-{name} or use as-is if scoped
  const npmName = pack.startsWith('@') ? pack : `@soleri/knowledge-${pack.replace(/@.*$/, '')}`;
  const version = pack.includes('@') && !pack.startsWith('@') ? pack.split('@').pop() : undefined;
  const spec = version ? `${npmName}@${version}` : npmName;

  const tmpDir = join(tmpdir(), `soleri-pack-${Date.now()}`);

  p.log.info(`Resolving ${spec} from npm...`);

  try {
    execFileSync('npm', ['pack', spec, '--pack-destination', tmpDir], {
      stdio: 'pipe',
      timeout: 30_000,
    });

    // Find the tarball
    const { readdirSync } = await import('node:fs');
    const { mkdirSync } = await import('node:fs');
    mkdirSync(tmpDir, { recursive: true });

    // npm pack creates a .tgz file — extract it
    const files = readdirSync(tmpDir).filter((f: string) => f.endsWith('.tgz'));
    if (files.length === 0) {
      throw new Error(`No tarball found after npm pack ${spec}`);
    }

    const extractDir = join(tmpDir, 'extracted');
    mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['xzf', join(tmpDir, files[0]), '-C', extractDir], {
      stdio: 'pipe',
      timeout: 15_000,
    });

    // npm pack extracts to a 'package/' subdirectory
    const packageDir = join(extractDir, 'package');
    if (!existsSync(packageDir)) {
      throw new Error(`Extracted package directory not found at ${packageDir}`);
    }

    return packageDir;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to resolve ${spec} from npm: ${msg}`, { cause: e });
  }
}

export function registerInstallKnowledge(program: Command): void {
  program
    .command('install-knowledge')
    .argument('<pack>', 'Path to knowledge bundle, directory, or npm package name')
    .option('--no-facades', 'Skip facade generation for new domains')
    .description('Install knowledge packs into the agent in the current directory')
    .action(async (pack: string, opts: { facades: boolean }) => {
      const ctx = detectAgent();
      if (!ctx) {
        p.log.error('No agent project detected in current directory. Run this from an agent root.');
        process.exit(1);
      }

      const s = p.spinner();
      s.start(`Resolving knowledge pack: ${pack}...`);

      let bundlePath: string;
      try {
        bundlePath = await resolvePackPath(pack);
      } catch (err) {
        s.stop('Resolution failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
        return; // unreachable, for TS
      }

      s.message(`Installing knowledge from ${bundlePath}...`);

      try {
        const result = await installKnowledge({
          agentPath: ctx.agentPath,
          bundlePath,
          generateFacades: opts.facades,
        });

        s.stop(result.success ? result.summary : 'Installation failed');

        if (result.warnings.length > 0) {
          for (const w of result.warnings) {
            p.log.warn(w);
          }
        }

        if (!result.success) {
          process.exit(1);
        }
      } catch (err) {
        s.stop('Installation failed');
        p.log.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
    });
}
