/**
 * Format-aware path resolution for filetree vs typescript agents.
 */
import { join } from 'node:path';

export interface FormatPaths {
  knowledgeDir: string;
  extensionsDir: string;
  facadesDir: string;
  agentConfigFile: string;
  entryPoint: string;
}

export function getFormatPaths(ctx: {
  format: 'filetree' | 'typescript';
  agentPath: string;
}): FormatPaths {
  const { format, agentPath } = ctx;

  if (format === 'filetree') {
    return {
      knowledgeDir: join(agentPath, 'knowledge'),
      extensionsDir: join(agentPath, 'extensions'),
      facadesDir: '',
      agentConfigFile: join(agentPath, 'agent.yaml'),
      entryPoint: join(agentPath, 'agent.yaml'),
    };
  }

  return {
    knowledgeDir: join(agentPath, 'src', 'intelligence', 'data'),
    extensionsDir: join(agentPath, 'src', 'extensions'),
    facadesDir: join(agentPath, 'src', 'facades'),
    agentConfigFile: join(agentPath, 'package.json'),
    entryPoint: join(agentPath, 'src', 'index.ts'),
  };
}

export function isFileTree(ctx: { format: string }): boolean {
  return ctx.format === 'filetree';
}
