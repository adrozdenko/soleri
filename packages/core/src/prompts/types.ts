/**
 * Prompt template types.
 */

export interface TemplateVariable {
  /** Variable name, e.g. 'agentName' */
  name: string;
  /** Whether the variable must be provided at render time. */
  required: boolean;
  /** Default value used when variable is not provided (makes required=false). */
  defaultValue?: string;
}

export interface PromptTemplate {
  /** Template name (filename without .prompt extension). */
  name: string;
  /** Raw template content before variable substitution. */
  content: string;
  /** Variables extracted from the template. */
  variables: TemplateVariable[];
  /** Absolute file path. */
  path: string;
}

export interface RenderOptions {
  /** If true (default), throw on missing required variables. */
  strict?: boolean;
}
