export function generateFacadeTypes(): string {
  return `import { z } from 'zod';

/** Handler function for a single facade operation */
export type OpHandler = (params: Record<string, unknown>) => Promise<unknown>;

/** Auth level required for an operation */
export type AuthLevel = 'read' | 'write' | 'admin';

/** Operation definition within a facade */
export interface OpDefinition {
  name: string;
  description: string;
  auth: AuthLevel;
  handler: OpHandler;
  schema?: z.ZodType;
}

/** Facade configuration — one MCP tool */
export interface FacadeConfig {
  /** MCP tool name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Domain operations */
  ops: OpDefinition[];
}

/** Standard facade response envelope */
export interface FacadeResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  op?: string;
  facade?: string;
}

export const facadeInputSchema = z.object({
  op: z.string().describe('Operation name'),
  params: z.record(z.unknown()).optional().default({}),
});

export type FacadeInput = z.infer<typeof facadeInputSchema>;
`;
}
