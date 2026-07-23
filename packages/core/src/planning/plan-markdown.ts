/**
 * Plan ⇄ Markdown serialization (ICM WS2 — "Plans as Markdown").
 *
 * A plan is a Layer 4 working artifact. Its canonical on-disk form is a
 * human-editable Markdown file:
 *
 *   - YAML frontmatter is the machine strip — the identity/routing fields a
 *     human sets to steer routing (id, status, objective, grade, …). It holds
 *     NO narrative and NO tasks/checks/reconciliation.
 *   - The body mirrors the ICM stage contract (Objective, Scope, Approach,
 *     Alternatives, Steps as Inputs/Process/Outputs, Decisions, Success
 *     Criteria, Reconciliation) — the human edit surface (§3.1, §3.3).
 *   - A trailing machine data island (an HTML comment carrying the full plan
 *     as JSON) guarantees lossless round-trip. A `Plan` carries rich structured
 *     state (checks with gaps, task metrics/evidence/deliverables, constraint
 *     audits, reviews, execution summaries) that cannot be reconstructed from
 *     prose. Because the ruling mandates BOTH a minimal frontmatter AND deep
 *     `parse(serialize(plan)) === plan` equality — so the JSON cache can be
 *     regenerated from the `.md` set without data loss — the data island is a
 *     required consequence, not incidental. It is hidden in rendered Markdown
 *     and kept last in the file so the human sections read cleanly.
 *
 * Frontmatter is authoritative for the fields it carries: on parse it is
 * overlaid onto the plan reconstructed from the data island, so a human
 * frontmatter edit (e.g. status) wins. The two are always written from the
 * same plan, so the overlay never breaks deep equality.
 *
 * YAML is (de)serialized with the `yaml` package already used across core
 * (agent-config, flows/loader) — no new dependency.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { Plan, PlanTask, PlanDecision, PlanAlternative } from './planner-types.js';

/** On-disk plan store format version. Bumped for the per-file Markdown layout. */
export const PLAN_STORE_VERSION = '2.0';

/** Opening line of the machine data island (kept last in the file). */
const DATA_OPEN = '<!-- soleri:plan-data v2';
/** Closing line of the machine data island. */
const DATA_CLOSE = '-->';

/** Frontmatter fields that are authoritative on parse (overlaid onto the plan). */
type Frontmatter = {
  id: string;
  status: string;
  objective: string;
  grade?: string;
  score?: number;
  checkId?: string;
  ceremony?: string;
  flow?: string;
  target_mode?: string;
  goalId?: string;
  githubIssue?: { owner: string; repo: string; number: number };
  createdAt: number;
  updatedAt: number;
};

/** Escape a value for use inside a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Build the YAML frontmatter (machine strip) from a plan. */
function buildFrontmatter(plan: Plan): string {
  // Insertion order defines rendered order — follow the ruling's field order.
  const fm: Record<string, unknown> = {
    id: plan.id,
    status: plan.status,
    objective: plan.objective,
  };
  if (plan.latestCheck) {
    fm.grade = plan.latestCheck.grade;
    fm.score = plan.latestCheck.score;
    fm.checkId = plan.latestCheck.checkId;
  }
  // ceremony is a WS3 concept; carry it only when the plan already has one so
  // the field flows through automatically once WS3 lands.
  const ceremony = (plan as { ceremony?: string }).ceremony;
  if (ceremony !== undefined) fm.ceremony = ceremony;
  if (plan.flow !== undefined) fm.flow = plan.flow;
  if (plan.target_mode !== undefined) fm.target_mode = plan.target_mode;
  if (plan.goalId !== undefined) fm.goalId = plan.goalId;
  if (plan.githubIssue !== undefined) fm.githubIssue = plan.githubIssue;
  fm.createdAt = plan.createdAt;
  fm.updatedAt = plan.updatedAt;
  // stringifyYaml ends with a trailing newline.
  return stringifyYaml(fm);
}

/** Render a single decision (flat string or structured {decision, rationale}). */
function renderDecision(d: string | PlanDecision): string {
  if (typeof d === 'string') return `- ${d}`;
  return `- **Decision:** ${d.decision} — **Rationale:** ${d.rationale}`;
}

/** Render a rejected alternative. */
function renderAlternative(a: PlanAlternative): string[] {
  const lines = [`- **${a.approach}** — rejected because ${a.rejected_reason}`];
  if (a.pros.length > 0) lines.push(`  - Pros: ${a.pros.join('; ')}`);
  if (a.cons.length > 0) lines.push(`  - Cons: ${a.cons.join('; ')}`);
  return lines;
}

/** Render a task as an ICM stage contract (Inputs / Process / Outputs). */
function renderStep(task: PlanTask, index: number): string[] {
  const lines = [`### ${index}. ${task.title}  \`[status: ${task.status}]\``, ''];

  const inputs: string[] = [];
  for (const dep of task.dependsOn ?? []) {
    inputs.push(`  - Layer 4 (working): output of \`${dep}\``);
  }
  if (inputs.length > 0) {
    lines.push('- **Inputs:**');
    lines.push(...inputs);
  } else {
    lines.push('- **Inputs:** _None declared._');
  }

  lines.push(`- **Process:** ${task.description}`);

  const outputs = (task.deliverables ?? []).map((d) => `\`${d.path}\` (${d.type})`);
  if (outputs.length > 0) {
    lines.push(`- **Outputs:** ${outputs.join(', ')}`);
  }

  const criteria = task.acceptanceCriteria ?? [];
  if (criteria.length > 0) {
    lines.push('- **Acceptance:**');
    for (const c of criteria) lines.push(`  - ${c}`);
  }

  lines.push('');
  return lines;
}

/**
 * Serialize a plan to its canonical Markdown form: frontmatter + human body
 * sections + a trailing machine data island. Inverse of {@link parsePlan}.
 */
export function serializePlan(plan: Plan): string {
  const out: string[] = [];

  // ── Frontmatter (machine strip) ──
  out.push('---');
  out.push(buildFrontmatter(plan).trimEnd());
  out.push('---');
  out.push('');

  // ── Body (human edit surface, ICM stage contract) ──
  out.push(`# Plan: ${plan.objective}`);
  out.push('');

  out.push('## Objective');
  out.push('');
  out.push(plan.objective);
  out.push('');

  out.push('## Scope');
  out.push('');
  // Plan.scope is a single free-text field; rendered as prose. (The ruling's
  // Included|Excluded table presumes a structured scope the model doesn't carry.)
  out.push(plan.scope || '_Not specified._');
  out.push('');

  if (plan.approach !== undefined) {
    out.push('## Approach');
    out.push('');
    out.push(plan.approach);
    out.push('');
  }

  if (plan.alternatives && plan.alternatives.length > 0) {
    out.push('## Alternatives');
    out.push('');
    for (const alt of plan.alternatives) out.push(...renderAlternative(alt));
    out.push('');
  }

  out.push('## Steps');
  out.push('');
  if (plan.tasks.length === 0) {
    out.push('_No steps defined._');
    out.push('');
  } else {
    plan.tasks.forEach((task, i) => out.push(...renderStep(task, i + 1)));
  }

  if (plan.decisions && plan.decisions.length > 0) {
    out.push('## Decisions');
    out.push('');
    for (const d of plan.decisions) out.push(renderDecision(d));
    out.push('');
  }

  if (plan.success_criteria && plan.success_criteria.length > 0) {
    out.push('## Success Criteria');
    out.push('');
    for (const c of plan.success_criteria) out.push(`- [ ] ${c}`);
    out.push('');
  }

  if (plan.reconciliation) {
    const r = plan.reconciliation;
    out.push('## Reconciliation');
    out.push('');
    out.push(`Accuracy: ${r.accuracy}/100 — ${r.summary}`);
    out.push('');
    if (r.driftItems.length > 0) {
      out.push('| Type | Description | Impact | Rationale |');
      out.push('|------|-------------|--------|-----------|');
      for (const d of r.driftItems) {
        out.push(
          `| ${cell(d.type)} | ${cell(d.description)} | ${cell(d.impact)} | ${cell(d.rationale)} |`,
        );
      }
      out.push('');
    }
  }

  // ── Machine data island (full-fidelity, hidden, last in file) ──
  out.push(DATA_OPEN);
  out.push(JSON.stringify(plan, null, 2));
  out.push(DATA_CLOSE);
  out.push('');

  return out.join('\n');
}

/**
 * Parse a plan back from its canonical Markdown form. The full plan is
 * reconstructed from the machine data island, then the authoritative
 * frontmatter fields are overlaid so a human frontmatter edit wins.
 * Inverse of {@link serializePlan}.
 *
 * @throws if the machine data island is missing or malformed.
 */
export function parsePlan(md: string): Plan {
  // The markers each sit on their own line. JSON.stringify escapes newlines
  // inside string values, so the marker text can never appear at the true start
  // of a line within the island's JSON — matching the newline-delimited form
  // isolates the real markers even when body prose or a field value contains
  // the raw marker text. The island is last, so lastIndexOf finds it.
  const openMarker = `\n${DATA_OPEN}\n`;
  const openIdx = md.lastIndexOf(openMarker);
  if (openIdx < 0) {
    throw new Error('plan markdown: missing machine data island');
  }
  const jsonStart = openIdx + openMarker.length;
  const closeIdx = md.lastIndexOf(`\n${DATA_CLOSE}`);
  if (closeIdx < jsonStart) {
    throw new Error('plan markdown: unterminated machine data island');
  }
  const json = md.slice(jsonStart, closeIdx);
  const plan = JSON.parse(json) as Plan;

  // Overlay authoritative frontmatter fields (human-settable routing strip).
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = parseYaml(fmMatch[1]) as Frontmatter | null;
    if (fm && typeof fm === 'object') {
      if (fm.id !== undefined) plan.id = fm.id;
      if (fm.status !== undefined) plan.status = fm.status as Plan['status'];
      if (fm.objective !== undefined) plan.objective = fm.objective;
      if (fm.flow !== undefined) plan.flow = fm.flow;
      if (fm.target_mode !== undefined) plan.target_mode = fm.target_mode;
      if (fm.goalId !== undefined) plan.goalId = fm.goalId;
      if (fm.githubIssue !== undefined) plan.githubIssue = fm.githubIssue;
      if (fm.createdAt !== undefined) plan.createdAt = fm.createdAt;
      if (fm.updatedAt !== undefined) plan.updatedAt = fm.updatedAt;
    }
  }

  return plan;
}

/**
 * Build the auto-generated `plans/README.md` index — the Layer 1 routing file
 * for the plans folder (id, objective, status, grade).
 */
export function buildPlansIndex(plans: Plan[]): string {
  const lines = [
    '# Plans',
    '',
    `> Auto-generated index. ${plans.length} plan${plans.length === 1 ? '' : 's'}.`,
    '',
    '| ID | Objective | Status | Grade |',
    '|----|-----------|--------|-------|',
  ];
  for (const plan of plans) {
    const grade = plan.latestCheck?.grade ?? '—';
    const objective =
      plan.objective.length > 80 ? `${plan.objective.slice(0, 77)}…` : plan.objective;
    lines.push(
      `| [${plan.id}](./${plan.id}.md) | ${cell(objective)} | ${plan.status} | ${grade} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}
