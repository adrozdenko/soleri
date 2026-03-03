import { z } from 'zod';
import { scaffold, previewScaffold, listAgents } from '../scaffolder.js';
import { AgentConfigSchema } from '../types.js';
import { installKnowledge } from '../knowledge-installer.js';

interface OpDef {
  name: string;
  description: string;
  schema?: z.ZodType;
  handler: (params: Record<string, unknown>) => Promise<unknown>;
}

export const forgeOps: OpDef[] = [
  {
    name: 'preview',
    description:
      'Preview what will be created for an agent BEFORE scaffolding. ' +
      'Show this to the user so they can confirm the structure looks right. ' +
      'Always call preview before create.',
    schema: AgentConfigSchema,
    handler: async (params) => {
      const config = AgentConfigSchema.parse(params);
      return previewScaffold(config);
    },
  },
  {
    name: 'create',
    description:
      'Scaffold a complete MCP agent project with activation system. ' +
      'This creates the full directory structure, source files, config, and activation module. ' +
      'After creation: npm install && npm run build, then say "Hello, {Name}!" to activate.',
    schema: AgentConfigSchema,
    handler: async (params) => {
      const config = AgentConfigSchema.parse(params);
      return scaffold(config);
    },
  },
  {
    name: 'list_agents',
    description:
      'List all agents found in a directory. ' +
      'Useful to see what agents already exist before creating a new one.',
    schema: z.object({
      directory: z.string().describe('Parent directory to scan for agent projects'),
    }),
    handler: async (params) => {
      const agents = listAgents(params.directory as string);
      return {
        agents,
        count: agents.length,
        note: agents.length === 0 ? 'No agents found. Use create to scaffold one.' : undefined,
      };
    },
  },
  {
    name: 'guide',
    description:
      'Get a structured guide for the AI agent to follow when helping a user create an agent. ' +
      'This provides the recommended conversation flow and questions to ask.',
    handler: async () => {
      return {
        title: 'Agent Creation Guide',
        instructions: 'Follow these steps to help the user create a new MCP agent. Ask questions conversationally — do not dump all questions at once.',
        steps: [
          {
            step: 1,
            action: 'Understand the need',
            ask: 'What role should this agent fill? Who will use it? What kind of guidance should it provide?',
            examples: ['backend architecture advisor', 'QA testing patterns', 'data engineering best practices'],
          },
          {
            step: 2,
            action: 'Choose name and identity',
            ask: 'What should we name this agent? A good name is memorable and reflects its domain.',
            tips: ['Single word works best (Gaudi, Atlas, Nova)', 'The name becomes the persona — it will introduce itself with this name'],
          },
          {
            step: 3,
            action: 'Select domains',
            ask: 'What knowledge domains should this agent cover? Domain names should be kebab-case (e.g., api-design, database, security).',
            tips: ['3-6 domains is ideal', 'Each domain becomes a facade (MCP tool) and an intelligence data file', 'User can always add more later'],
          },
          {
            step: 4,
            action: 'Define principles',
            ask: 'What are 3-5 core principles this agent should follow? These shape its personality and advice style.',
            examples: ['Security first — always validate inputs', 'Simplicity over cleverness', 'Test everything that can break'],
          },
          {
            step: 5,
            action: 'Preview and confirm',
            ask: 'Call preview with the collected config. Show the user what will be created. Ask for confirmation.',
          },
          {
            step: 6,
            action: 'Create the agent',
            ask: 'Call create with the confirmed config. Then guide the user through npm install and npm run build. The MCP server is automatically registered in ~/.claude.json.',
          },
          {
            step: 7,
            action: 'Next steps',
            suggest: [
              'Restart Claude Code so the new MCP server is picked up',
              'Say "Hello, {AgentName}!" to activate the persona in any session',
              'The agent will check setup status and offer to inject its CLAUDE.md sections',
              'Add initial knowledge by creating entries in the intelligence data JSON files',
              'Or use the agent and capture knowledge via the capture ops as you work',
            ],
          },
        ],
      };
    },
  },
  {
    name: 'install_knowledge',
    description:
      'Install knowledge packs (intelligence bundles) into an existing MCP agent. ' +
      'Copies bundle JSON files, generates domain facades for new domains, ' +
      'patches index.ts and claude-md-content.ts, then rebuilds.',
    schema: z.object({
      agentPath: z.string().describe('Absolute path to the target agent project'),
      bundlePath: z.string().describe('Path to bundles directory or single .json file'),
      generateFacades: z
        .boolean()
        .optional()
        .default(true)
        .describe('Generate domain facades for new domains (default true)'),
    }),
    handler: async (params) => installKnowledge(params as { agentPath: string; bundlePath: string; generateFacades?: boolean }),
  },
];
