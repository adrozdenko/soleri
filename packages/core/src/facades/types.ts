import { z } from 'zod';

/** Handler function for a single facade operation */
export type OpHandler = (params: Record<string, unknown>) => Promise<unknown>;

/** Auth level required for an operation */
export type AuthLevel = 'read' | 'write' | 'admin';

/** Auth enforcement mode */
export type AuthMode = 'permissive' | 'warn' | 'enforce';

/** Auth policy for facade dispatch */
export interface AuthPolicy {
  mode: AuthMode;
  /** Caller's auth level — ops requiring a higher level are blocked/warned */
  callerLevel: AuthLevel;
  /** Per-op overrides: opName → required level */
  overrides?: Record<string, AuthLevel>;
}

/** Numeric auth level for comparison: read=0, write=1, admin=2 */
export const AUTH_LEVEL_RANK: Record<AuthLevel, number> = {
  read: 0,
  write: 1,
  admin: 2,
};

/** Op visibility — controls whether an op is exposed via MCP tool registration */
export type OpVisibility = 'user' | 'internal';

/**
 * Duck-typed schema interface that Zod objects naturally satisfy.
 * Pack authors can use any validation library (or a plain object) that
 * exposes `parse` and `safeParse`.
 */
export interface OpSchema {
  parse: (input: unknown) => unknown;
  safeParse: (
    input: unknown,
  ) => { success: true; data: unknown } | { success: false; error: { message: string } };
}

/** Operation definition within a facade */
export interface OpDefinition {
  name: string;
  description: string;
  auth: AuthLevel;
  handler: OpHandler;
  schema?: OpSchema;
  /** Promote to a first-class MCP tool with full schema discovery. */
  hot?: boolean;
  /** Controls MCP exposure: 'user' (default) = listed in tool, 'internal' = hidden from MCP but callable programmatically. */
  visibility?: OpVisibility;
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
