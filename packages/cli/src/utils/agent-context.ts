/**
 * Detect and validate an agent project in the current working directory.
 * Supports both file-tree agents (agent.yaml) and legacy TS agents (package.json).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';

export type AgentFormat = 'filetree' | 'typescript';

export interface AgentContext {
  agentPath: string;
  agentId: string;
  packageName: string;
  hasBrain: boolean;
  /** Agent format: 'filetree' (v7+) or 'typescript' (legacy) */
  format: AgentFormat;
}

/**
 * Detect an agent in the given directory.
 * Checks for file-tree agent (agent.yaml) first, then legacy TS agent (package.json).
 * Returns null if the directory is not a valid agent project.
 */
export function detectAgent(dir?: string): AgentContext | null {
  const agentPath = resolve(dir ?? process.cwd());

  // v7: File-tree agent (agent.yaml)
  const yamlPath = join(agentPath, 'agent.yaml');
  if (existsSync(yamlPath)) {
    try {
      const yaml = parseYaml(readFileSync(yamlPath, 'utf-8'));
      const id = yaml?.id;
      if (typeof id === 'string' && id.length > 0) {
        return {
          agentPath,
          agentId: id,
          packageName: id,
          hasBrain: true, // file-tree agents always have brain via engine
          format: 'filetree',
        };
      }
    } catch {
      // Invalid YAML — fall through to legacy detection
    }
  }

  // Legacy: TypeScript agent (package.json with -mcp suffix)
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
      format: 'typescript',
    };
  } catch {
    return null;
  }
}
