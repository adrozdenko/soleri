/**
 * Detect and validate an agent project in the current working directory.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface AgentContext {
  agentPath: string;
  agentId: string;
  packageName: string;
  hasBrain: boolean;
}

/**
 * Detect an agent in the given directory.
 * Returns null if the directory is not a valid agent project.
 */
export function detectAgent(dir?: string): AgentContext | null {
  const agentPath = resolve(dir ?? process.cwd());
  const pkgPath = join(agentPath, 'package.json');

  if (!existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    const name: string = pkg.name ?? '';
    if (!name.endsWith('-mcp')) return null;

    return {
      agentPath,
      agentId: name.replace(/-mcp$/, ''),
      packageName: name,
      hasBrain: existsSync(join(agentPath, 'src', 'brain')),
    };
  } catch {
    return null;
  }
}
