/**
 * Template manager — load, render, and list .prompt templates.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import type { PromptTemplate, RenderOptions } from './types.js';
import { parseVariables, resolveIncludes } from './parser.js';

const VAR_REGEX = /\{\{(\w+)(?::([^}]*))?\}\}/g;

export class TemplateManager {
  private templates = new Map<string, PromptTemplate>();
  private templatesDir: string;

  constructor(templatesDir: string) {
    this.templatesDir = templatesDir;
  }

  /** Load all .prompt files from templatesDir. */
  load(): void {
    if (!existsSync(this.templatesDir)) return;

    const files = readdirSync(this.templatesDir).filter((f) => f.endsWith('.prompt'));
    for (const file of files) {
      const fullPath = join(this.templatesDir, file);
      const content = readFileSync(fullPath, 'utf-8');
      const name = basename(file, '.prompt');
      this.templates.set(name, {
        name,
        content,
        variables: parseVariables(content),
        path: fullPath,
      });
    }
  }

  /**
   * Render a template by name with variable substitution.
   *
   * @param name - Template name (without .prompt extension)
   * @param vars - Variable values to substitute
   * @param options - Render options (strict mode)
   * @throws If template not found, or strict mode and required variable missing
   */
  render(name: string, vars: Record<string, string> = {}, options?: RenderOptions): string {
    const template = this.templates.get(name);
    if (!template) throw new Error(`Template not found: ${name}`);

    const strict = options?.strict ?? true;

    // Resolve @include() directives
    const resolved = resolveIncludes(template.content, (partialName) => {
      const partial = this.templates.get(partialName);
      if (!partial) throw new Error(`Include not found: ${partialName} (in template: ${name})`);
      return partial.content;
    });

    // Replace {{var}} and {{var:default}}
    return resolved.replace(VAR_REGEX, (_match, varName: string, defaultValue?: string) => {
      if (vars[varName] !== undefined) return vars[varName];
      if (defaultValue !== undefined) return defaultValue;
      if (strict) throw new Error(`Missing required variable: ${varName} (in template: ${name})`);
      return _match; // Leave placeholder as-is in non-strict mode
    });
  }

  /** List all loaded template names. */
  listTemplates(): string[] {
    return Array.from(this.templates.keys());
  }

  /** Get a template by name (raw, unrendered). */
  getTemplate(name: string): PromptTemplate | null {
    return this.templates.get(name) ?? null;
  }
}
