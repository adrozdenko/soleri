import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from '../types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, '..', 'skills');

/** Placeholder token in skill templates that gets replaced with agent-specific tool prefix. */
const AGENT_PLACEHOLDER = 'YOUR_AGENT_';

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
// Announce / Complete injection
// ---------------------------------------------------------------------------

/**
 * Extract the `name:` field from YAML frontmatter.
 * Returns the raw string value, or null if not found.
 */
export function extractNameFromFrontmatter(content: string): string | null {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return null;
  const nameMatch = fmMatch[1].match(/^name:\s*(.+)/m);
  return nameMatch ? nameMatch[1].trim().replace(/^["']|["']$/g, '') : null;
}

/**
 * Inject announce and completion feedback instructions into a skill's content.
 *
 * Announce goes immediately after the frontmatter block.
 * Complete goes at the very end of the file.
 * Both are inside HTML comments so they don't clutter the rendered output.
 */
export function injectSkillFeedback(content: string, skillName: string): string {
  // Count ### headings as "steps"
  const stepMatches = content.match(/^### .+/gm) ?? [];
  const stepCount = stepMatches.length;
  const firstStep = stepMatches[0]?.replace(/^### \d+\.\s*/, '').trim() ?? 'Step 1';

  const displayName = skillName
    .replace(/^soleri-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const announceBlock = [
    '',
    '## Announce',
    '',
    `When this skill is invoked, immediately say:`,
    `> "Using **${displayName}** skill${stepCount > 0 ? ` (${stepCount} steps)` : ''}. Starting with: ${firstStep}"`,
    '',
  ].join('\n');

  const completeBlock = [
    '',
    '## Completion',
    '',
    'After all steps are done, close with a one-line summary:',
    `> "${displayName} complete: {brief outcome — e.g. '3 captured, 1 skipped'}"`,
    '',
  ].join('\n');

  // Insert announce block right after the closing ---  of frontmatter
  const afterFm = content.replace(/^(---\n[\s\S]*?\n---\n)/, `$1${announceBlock}`);

  return afterFm + completeBlock;
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
      content = content.replace(/YOUR_AGENT_/g, `${config.id}_`);
    }

    // Inject announce / complete feedback blocks
    content = injectSkillFeedback(content, skillName);

    // Extract structured steps from frontmatter and append as metadata block
    const steps = extractStepsFromFrontmatter(content);
    if (steps) {
      content += `\n<!-- soleri:steps ${JSON.stringify(steps)} -->\n`;
    }

    files.push([`skills/${skillName}/SKILL.md`, content]);
  }

  return files;
}
