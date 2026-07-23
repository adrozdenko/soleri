/**
 * Plan ⇄ Markdown serialization (ICM WS2 — "Plans as Markdown", with Addenda 2A/2B).
 *
 * The canonical on-disk plan is a PAIR of visible, Git-committed files:
 *
 *   - `plans/<id>.md`      — the human edit surface. YAML frontmatter (identity
 *     + routing strip) plus body sections mirroring the ICM stage contract
 *     (Objective, Scope, Approach, Context, Alternatives, Steps as
 *     Inputs/Process/Outputs, Decisions, Success Criteria, Tools,
 *     Reconciliation). Authoritative for every HUMAN-AUTHORED field.
 *   - `plans/<id>.data.json` — a visible sidecar (Addendum 2A). Authoritative
 *     for MACHINE-CAPTURED structured state only: grading checks, reconciliation,
 *     reviews, constraint audits, external projections, and per-task runtime
 *     state (evidence, deliverables, metrics, verification, timestamps). Absent
 *     when a plan has no machine state yet.
 *
 * There is no hidden data island (Addendum 2A rejects it): nothing authoritative
 * is invisible when the Markdown renders. No field is authoritative in two
 * places — the `.md` owns human-authored fields, the sidecar owns machine state.
 *
 * Precedence (Addendum 2A): the `.md` (frontmatter + body) wins over the sidecar.
 * Frontmatter is authoritative for identity/routing fields that live ONLY there
 * (id, status, flow, target_mode, goalId, githubIssue, createdAt, updatedAt). The
 * body is authoritative for the prose/list fields it renders. Frontmatter also
 * carries non-authoritative MIRRORS (objective, grade, score, checkId) purely for
 * the index and quick scans — the authoritative objective is the `## Objective`
 * body section, and grade/score/checkId derive from the sidecar's latestCheck.
 *
 * Derived state is recomputed, not stored (Addendum 2A / §6.1): `executionSummary`
 * is a pure function of task states (`computeExecutionSummary`) and is recomputed
 * on parse. Grading `checks` (with gaps) ARE retained in the sidecar: gap IDs are
 * non-deterministic and gaps are version-sensitive (vault constraints, custom
 * passes, iteration leniency), so they cannot be faithfully recomputed — the
 * ruling's "retain for audit when re-grading is version-sensitive" branch applies.
 *
 * Round-trip guarantee is over the PAIR: `parsePlan(md, data)` reconstructs the
 * plan from (.md + .data.json) with derived fields recomputed.
 *
 * YAML is (de)serialized with the `yaml` package already used across core — no
 * new dependency.
 */

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  Plan,
  PlanTask,
  PlanCheck,
  PlanDecision,
  PlanAlternative,
  ReconciliationReport,
  ReviewEvidence,
  ConstraintAuditEntry,
  TaskEvidence,
  TaskMetrics,
  TaskDeliverable,
  TaskVerification,
} from './planner-types.js';
import { computeExecutionSummary } from './reconciliation-engine.js';

/** On-disk plan store format version. Bumped for the per-file Markdown layout. */
export const PLAN_STORE_VERSION = '2.0';

/** Per-task machine-captured state (everything the body does not author). */
interface PlanSidecarTask {
  phase?: string;
  milestone?: string;
  parentTaskId?: string;
  evidence?: TaskEvidence[];
  verified?: boolean;
  startedAt?: number;
  completedAt?: number;
  metrics?: TaskMetrics;
  deliverables?: TaskDeliverable[];
  verification?: TaskVerification;
  fixIterations?: number;
  updatedAt: number;
}

/** The `<id>.data.json` sidecar — machine-captured structured state only. */
export interface PlanSidecar {
  latestCheck?: PlanCheck;
  checks?: PlanCheck[];
  reconciliation?: ReconciliationReport;
  reviews?: ReviewEvidence[];
  constraintAudit?: ConstraintAuditEntry[];
  githubProjection?: Plan['githubProjection'];
  playbookMatch?: Plan['playbookMatch'];
  playbookSessionId?: string;
  /** Per-task runtime state, keyed by task id. */
  tasks?: Record<string, PlanSidecarTask>;
}

// ─── Serialize ──────────────────────────────────────────────────────

/** Escape a value for use inside a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

/** Build the YAML frontmatter (identity/routing strip + index mirrors). */
function buildFrontmatter(plan: Plan): string {
  const fm: Record<string, unknown> = {
    id: plan.id,
    status: plan.status,
    // Mirror only — the authoritative objective is the `## Objective` body.
    objective: plan.objective,
  };
  if (plan.latestCheck) {
    // Mirrors of the sidecar's latestCheck, for the index/quick scan.
    fm.grade = plan.latestCheck.grade;
    fm.score = plan.latestCheck.score;
    fm.checkId = plan.latestCheck.checkId;
  }
  // ceremony (WS3) carried through only when the plan already has one.
  const ceremony = (plan as { ceremony?: string }).ceremony;
  if (ceremony !== undefined) fm.ceremony = ceremony;
  if (plan.flow !== undefined) fm.flow = plan.flow;
  if (plan.target_mode !== undefined) fm.target_mode = plan.target_mode;
  if (plan.goalId !== undefined) fm.goalId = plan.goalId;
  if (plan.githubIssue !== undefined) fm.githubIssue = plan.githubIssue;
  fm.createdAt = plan.createdAt;
  fm.updatedAt = plan.updatedAt;
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

/** Render a task as an ICM stage contract. id + status carried in the heading. */
function renderStep(task: PlanTask, index: number): string[] {
  const lines = [`### ${index}. ${task.title}  \`[id: ${task.id} · status: ${task.status}]\``, ''];

  const deps = task.dependsOn ?? [];
  if (deps.length > 0) {
    lines.push('- **Inputs:**');
    for (const dep of deps) lines.push(`  - Layer 4 (working): output of \`${dep}\``);
  } else {
    lines.push('- **Inputs:** _None declared._');
  }

  lines.push(`- **Process:** ${task.description}`);

  // Outputs is a read-only view of the machine-captured deliverables (sidecar
  // authoritative). Rendered for stage-contract completeness, not parsed back.
  const outputs = (task.deliverables ?? []).map((d) => `\`${d.path}\` (${d.type})`);
  if (outputs.length > 0) lines.push(`- **Outputs:** ${outputs.join(', ')}`);

  const criteria = task.acceptanceCriteria ?? [];
  if (criteria.length > 0) {
    lines.push('- **Acceptance:**');
    for (const c of criteria) lines.push(`  - ${c}`);
  }

  lines.push('');
  return lines;
}

/** Extract the machine-captured sidecar; null when the plan has no machine state. */
export function extractSidecar(plan: Plan): PlanSidecar | null {
  const sidecar: PlanSidecar = {};
  if (plan.latestCheck) sidecar.latestCheck = plan.latestCheck;
  if (plan.checks && plan.checks.length > 0) sidecar.checks = plan.checks;
  if (plan.reconciliation) sidecar.reconciliation = plan.reconciliation;
  if (plan.reviews && plan.reviews.length > 0) sidecar.reviews = plan.reviews;
  if (plan.constraintAudit && plan.constraintAudit.length > 0) {
    sidecar.constraintAudit = plan.constraintAudit;
  }
  if (plan.githubProjection) sidecar.githubProjection = plan.githubProjection;
  if (plan.playbookMatch) sidecar.playbookMatch = plan.playbookMatch;
  if (plan.playbookSessionId !== undefined) sidecar.playbookSessionId = plan.playbookSessionId;

  if (plan.tasks.length > 0) {
    const tasks: Record<string, PlanSidecarTask> = {};
    for (const t of plan.tasks) {
      const st: PlanSidecarTask = { updatedAt: t.updatedAt };
      if (t.phase !== undefined) st.phase = t.phase;
      if (t.milestone !== undefined) st.milestone = t.milestone;
      if (t.parentTaskId !== undefined) st.parentTaskId = t.parentTaskId;
      if (t.evidence !== undefined) st.evidence = t.evidence;
      if (t.verified !== undefined) st.verified = t.verified;
      if (t.startedAt !== undefined) st.startedAt = t.startedAt;
      if (t.completedAt !== undefined) st.completedAt = t.completedAt;
      if (t.metrics !== undefined) st.metrics = t.metrics;
      if (t.deliverables !== undefined) st.deliverables = t.deliverables;
      if (t.verification !== undefined) st.verification = t.verification;
      if (t.fixIterations !== undefined) st.fixIterations = t.fixIterations;
      tasks[t.id] = st;
    }
    sidecar.tasks = tasks;
  }

  return Object.keys(sidecar).length > 0 ? sidecar : null;
}

/**
 * Serialize a plan to its canonical on-disk pair: a Markdown edit surface and a
 * machine-state sidecar (`null` when the plan carries no machine state).
 * Inverse of {@link parsePlan}.
 */
export function serializePlan(plan: Plan): { markdown: string; data: PlanSidecar | null } {
  const out: string[] = [];

  out.push('---');
  out.push(buildFrontmatter(plan).trimEnd());
  out.push('---');
  out.push('');

  out.push(`# Plan: ${plan.objective}`);
  out.push('');

  out.push('## Objective');
  out.push('');
  out.push(plan.objective);
  out.push('');

  out.push('## Scope');
  out.push('');
  out.push(plan.scope);
  out.push('');

  if (plan.approach !== undefined) {
    out.push('## Approach', '', plan.approach, '');
  }

  if (plan.context !== undefined) {
    out.push('## Context', '', plan.context, '');
  }

  if (plan.alternatives && plan.alternatives.length > 0) {
    out.push('## Alternatives', '');
    for (const alt of plan.alternatives) out.push(...renderAlternative(alt));
    out.push('');
  }

  out.push('## Steps');
  out.push('');
  if (plan.tasks.length === 0) {
    out.push('_No steps defined._', '');
  } else {
    plan.tasks.forEach((task, i) => out.push(...renderStep(task, i + 1)));
  }

  if (plan.decisions && plan.decisions.length > 0) {
    out.push('## Decisions', '');
    for (const d of plan.decisions) out.push(renderDecision(d));
    out.push('');
  }

  if (plan.success_criteria && plan.success_criteria.length > 0) {
    out.push('## Success Criteria', '');
    for (const c of plan.success_criteria) out.push(`- [ ] ${c}`);
    out.push('');
  }

  if (plan.tool_chain && plan.tool_chain.length > 0) {
    out.push('## Tools', '');
    for (const t of plan.tool_chain) out.push(`- ${t}`);
    out.push('');
  }

  // Reconciliation is a read-only view of machine-captured state (sidecar
  // authoritative); rendered for observability, not parsed back.
  if (plan.reconciliation) {
    const r = plan.reconciliation;
    out.push('## Reconciliation', '');
    out.push(`Accuracy: ${r.accuracy}/100 — ${r.summary}`, '');
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

  return { markdown: out.join('\n'), data: extractSidecar(plan) };
}

// ─── Parse ──────────────────────────────────────────────────────────

/** Split a plan `.md` into raw frontmatter text and the body after it. */
function splitFrontmatter(md: string): { frontmatter: string; body: string } {
  const m = md.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { frontmatter: '', body: md };
  return { frontmatter: m[1], body: md.slice(m[0].length) };
}

/**
 * Split a body into `## `-delimited sections. Authored prose must not contain a
 * line beginning with `## ` (the section delimiter); `### ` step headings and
 * the `# Plan:` title are not delimiters.
 */
function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  let current: string | null = null;
  let buf: string[] = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^## (.+)$/);
    if (m) {
      if (current !== null) sections.set(current, buf.join('\n').trim());
      current = m[1].trim();
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  if (current !== null) sections.set(current, buf.join('\n').trim());
  return sections;
}

/** Parse the Decisions section into flat strings and {decision, rationale}. */
function parseDecisions(section: string | undefined): (string | PlanDecision)[] {
  if (!section) return [];
  const decisions: (string | PlanDecision)[] = [];
  for (const line of section.split('\n')) {
    const struct = line.match(/^- \*\*Decision:\*\* (.+?) — \*\*Rationale:\*\* (.+)$/);
    if (struct) {
      decisions.push({ decision: struct[1], rationale: struct[2] });
      continue;
    }
    const flat = line.match(/^- (.+)$/);
    if (flat) decisions.push(flat[1]);
  }
  return decisions;
}

/** Parse the Alternatives section. */
function parseAlternatives(section: string | undefined): PlanAlternative[] | undefined {
  if (!section) return undefined;
  const alternatives: PlanAlternative[] = [];
  let current: PlanAlternative | null = null;
  for (const line of section.split('\n')) {
    const head = line.match(/^- \*\*(.+?)\*\* — rejected because (.+)$/);
    if (head) {
      current = { approach: head[1], pros: [], cons: [], rejected_reason: head[2] };
      alternatives.push(current);
      continue;
    }
    if (!current) continue;
    const pros = line.match(/^\s*- Pros: (.+)$/);
    if (pros) current.pros = pros[1].split('; ');
    const cons = line.match(/^\s*- Cons: (.+)$/);
    if (cons) current.cons = cons[1].split('; ');
  }
  return alternatives.length > 0 ? alternatives : undefined;
}

/** Parse a simple `- item` bullet list; undefined when the section is absent. */
function parseBulletList(section: string | undefined): string[] | undefined {
  if (!section) return undefined;
  const items: string[] = [];
  for (const line of section.split('\n')) {
    const m = line.match(/^- (?:\[[ x]\] )?(.+)$/);
    if (m) items.push(m[1]);
  }
  return items.length > 0 ? items : undefined;
}

/** Body-authored task fields parsed from a `## Steps` section. */
interface BodyTask {
  id: string;
  title: string;
  description: string;
  status: PlanTask['status'];
  dependsOn?: string[];
  acceptanceCriteria?: string[];
}

/** Parse the Steps section into body-authored task fields (id from the heading). */
function parseSteps(section: string | undefined): BodyTask[] {
  if (!section || section.startsWith('_No steps')) return [];
  const tasks: BodyTask[] = [];
  const blocks = section.split(/\n(?=### )/);
  for (const block of blocks) {
    const head = block.match(/^### \d+\. (.+?)  `\[id: (\S+) · status: (\w+)\]`/);
    if (!head) continue;
    const task: BodyTask = {
      id: head[2],
      title: head[1],
      description: '',
      status: head[3] as PlanTask['status'],
    };

    const proc = block.match(/^- \*\*Process:\*\* (.*)$/m);
    if (proc) task.description = proc[1];

    const deps = [...block.matchAll(/output of `([^`]+)`/g)].map((m) => m[1]);
    if (deps.length > 0) task.dependsOn = deps;

    const accIdx = block.indexOf('- **Acceptance:**');
    if (accIdx >= 0) {
      const criteria: string[] = [];
      for (const line of block.slice(accIdx).split('\n').slice(1)) {
        const m = line.match(/^  - (.+)$/);
        if (m) criteria.push(m[1]);
        else if (line.trim() !== '') break;
      }
      if (criteria.length > 0) task.acceptanceCriteria = criteria;
    }

    tasks.push(task);
  }
  return tasks;
}

/** Merge body-authored task fields with per-task sidecar machine state. */
function mergeTasks(
  bodyTasks: BodyTask[],
  sidecarTasks: Record<string, PlanSidecarTask>,
): PlanTask[] {
  return bodyTasks.map((bt) => {
    const st = sidecarTasks[bt.id];
    const task: PlanTask = {
      id: bt.id,
      title: bt.title,
      description: bt.description,
      status: bt.status,
      updatedAt: st?.updatedAt ?? 0,
    };
    if (bt.dependsOn) task.dependsOn = bt.dependsOn;
    if (bt.acceptanceCriteria) task.acceptanceCriteria = bt.acceptanceCriteria;
    if (st) {
      if (st.phase !== undefined) task.phase = st.phase;
      if (st.milestone !== undefined) task.milestone = st.milestone;
      if (st.parentTaskId !== undefined) task.parentTaskId = st.parentTaskId;
      if (st.evidence !== undefined) task.evidence = st.evidence;
      if (st.verified !== undefined) task.verified = st.verified;
      if (st.startedAt !== undefined) task.startedAt = st.startedAt;
      if (st.completedAt !== undefined) task.completedAt = st.completedAt;
      if (st.metrics !== undefined) task.metrics = st.metrics;
      if (st.deliverables !== undefined) task.deliverables = st.deliverables;
      if (st.verification !== undefined) task.verification = st.verification;
      if (st.fixIterations !== undefined) task.fixIterations = st.fixIterations;
    }
    return task;
  });
}

/**
 * Reconstruct a plan from its canonical on-disk pair. Human-authored fields come
 * from the `.md`; machine-captured state comes from the sidecar; `executionSummary`
 * is recomputed. Inverse of {@link serializePlan}.
 */
export function parsePlan(md: string, data?: PlanSidecar | null): Plan {
  const { frontmatter, body } = splitFrontmatter(md);
  const fm = (frontmatter ? parseYaml(frontmatter) : {}) as Record<string, unknown>;
  const sections = splitSections(body);
  const sidecar = data ?? {};

  const plan: Plan = {
    id: String(fm.id ?? ''),
    // Body is authoritative for objective; frontmatter is a mirror/fallback.
    objective: sections.get('Objective') ?? String(fm.objective ?? ''),
    scope: sections.get('Scope') ?? '',
    status: fm.status as Plan['status'],
    decisions: parseDecisions(sections.get('Decisions')),
    tasks: mergeTasks(parseSteps(sections.get('Steps')), sidecar.tasks ?? {}),
    checks: sidecar.checks ?? [],
    createdAt: Number(fm.createdAt),
    updatedAt: Number(fm.updatedAt),
  };

  // Optional body-authored fields.
  const approach = sections.get('Approach');
  if (approach !== undefined) plan.approach = approach;
  const context = sections.get('Context');
  if (context !== undefined) plan.context = context;
  const alternatives = parseAlternatives(sections.get('Alternatives'));
  if (alternatives) plan.alternatives = alternatives;
  const successCriteria = parseBulletList(sections.get('Success Criteria'));
  if (successCriteria) plan.success_criteria = successCriteria;
  const toolChain = parseBulletList(sections.get('Tools'));
  if (toolChain) plan.tool_chain = toolChain;

  // Optional frontmatter-only routing fields.
  if (fm.flow !== undefined) plan.flow = String(fm.flow);
  if (fm.target_mode !== undefined) plan.target_mode = String(fm.target_mode);
  if (fm.goalId !== undefined) plan.goalId = String(fm.goalId);
  if (fm.githubIssue !== undefined) plan.githubIssue = fm.githubIssue as Plan['githubIssue'];

  // Machine-captured state from the sidecar.
  if (sidecar.latestCheck) plan.latestCheck = sidecar.latestCheck;
  if (sidecar.reconciliation) plan.reconciliation = sidecar.reconciliation;
  if (sidecar.reviews) plan.reviews = sidecar.reviews;
  if (sidecar.constraintAudit) plan.constraintAudit = sidecar.constraintAudit;
  if (sidecar.githubProjection) plan.githubProjection = sidecar.githubProjection;
  if (sidecar.playbookMatch) plan.playbookMatch = sidecar.playbookMatch;
  if (sidecar.playbookSessionId !== undefined) plan.playbookSessionId = sidecar.playbookSessionId;

  // Derived: recompute rather than store. executionSummary is present exactly
  // when the planner would have set it — on reconcile (reconciliation present)
  // or on completion (status completed/archived).
  if (plan.reconciliation || plan.status === 'completed' || plan.status === 'archived') {
    plan.executionSummary = computeExecutionSummary(plan.tasks);
  }

  return plan;
}

// ─── Index ──────────────────────────────────────────────────────────

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
