import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

/** Placeholder token in skill templates that gets replaced with agent-specific tool name. */
const AGENT_PLACEHOLDER = 'YOUR_AGENT_core';

// ---------------------------------------------------------------------------
// Frontmatter step extraction
// ---------------------------------------------------------------------------

export type SkillStepEvidence = 'tool_called' | 'file_exists';

export interface SkillStepDef {
  id: string;
  description: string;
  evidence: SkillStepEvidence;
}

/**
 * Extract optional `steps` array from YAML frontmatter.
 * Uses simple regex parsing — no YAML dependency needed.
 */
export function extractStepsFromFrontmatter(content: string): SkillStepDef[] | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;

  const fm = fmMatch[1];
  const stepsIdx = fm.indexOf('\nsteps:');
  if (stepsIdx === -1) return null;

  // Collect lines after "steps:" that are indented (part of the array)
  const afterSteps = fm.slice(stepsIdx + '\nsteps:'.length);
  const lines = afterSteps.split('\n');
  const steps: SkillStepDef[] = [];
  let current: Partial<SkillStepDef> | null = null;

  for (const line of lines) {
    // Stop at next top-level YAML key or end of indented block
    if (line.match(/^\S/) && line.trim() !== '') break;

    const itemMatch = line.match(/^\s+-\s+id:\s*(.+)/);
    if (itemMatch) {
      if (current?.id && current.description && current.evidence) {
        steps.push(current as SkillStepDef);
      }
      current = { id: itemMatch[1].trim().replace(/^["']|["']$/g, '') };
      continue;
    }

    if (current) {
      const descMatch = line.match(/^\s+description:\s*(.+)/);
      if (descMatch) {
        current.description = descMatch[1].trim().replace(/^["']|["']$/g, '');
        continue;
      }
      const evMatch = line.match(/^\s+evidence:\s*(.+)/);
      if (evMatch) {
        const raw = evMatch[1].trim().replace(/^["']|["']$/g, '');
        if (raw === 'tool_called' || raw === 'file_exists') {
          current.evidence = raw;
        }
        continue;
      }
    }
  }

  // Push last item
  if (current?.id && current.description && current.evidence) {
    steps.push(current as SkillStepDef);
  }

  return steps.length > 0 ? steps : null;
}

// ---------------------------------------------------------------------------
// Skill generation
// ---------------------------------------------------------------------------

/**
 * Generate skill files for the scaffolded agent.
 * Returns [relativePath, content] tuples for each skill.
 *
 * - If config.skills is set, only those skills are included.
 * - If config.skills is undefined/empty, all skills are included (backward compat).
 * - Superpowers-adapted skills (MIT): copied as-is
 * - Engine-adapted skills: YOUR_AGENT_core → {config.id}_core
 *
 * When a skill's frontmatter contains a `steps` array, the steps are appended
 * as a hidden metadata block (`<!-- soleri:steps ... -->`) so the runtime can
 * extract them for step-tracking.
 */
export function generateSkills(config: AgentConfig): Array<[string, string]> {
  const files: Array<[string, string]> = [];
  let entries: string[];

  try {
    entries = readdirSync(SKILLS_DIR);
  } catch {
    return files;
  }

  // If skills array is present, filter to only those skills.
  // undefined = include all (backward compat), [] = include none.
  const allowedSkills = config.skills ? new Set(config.skills) : null; // null = include all (backward compat)

  for (const entry of entries) {
    const entryPath = join(SKILLS_DIR, entry);

    // Support both layouts:
    // - Directory: skills/{name}/SKILL.md (current)
    // - Flat file: skills/{name}.md (legacy)
    let skillName: string;
    let contentPath: string;

    if (statSync(entryPath).isDirectory()) {
      const skillMd = join(entryPath, 'SKILL.md');
      if (!existsSync(skillMd)) continue;
      skillName = entry;
      contentPath = skillMd;
    } else if (entry.endsWith('.md')) {
      skillName = entry.replace('.md', '');
      contentPath = entryPath;
    } else {
      continue;
    }

    if (allowedSkills && !allowedSkills.has(skillName)) {
      continue;
    }

    let content = readFileSync(contentPath, 'utf-8');

    if (content.includes(AGENT_PLACEHOLDER)) {
      content = content.replace(/YOUR_AGENT_core/g, `${config.id}_core`);
    }

    // Extract structured steps from frontmatter and append as metadata block
    const steps = extractStepsFromFrontmatter(content);
    if (steps) {
      content += `\n<!-- soleri:steps ${JSON.stringify(steps)} -->\n`;
    }

    files.push([`skills/${skillName}/SKILL.md`, content]);
  }

  return files;
}
