/**
 * Goal Ancestry — hierarchical goal tracking for plans and tasks.
 *
 * Goals form a tree: objective → project → plan → task.
 * Each plan/task can reference its parent goal, enabling context
 * to flow from high-level objectives down to individual work items.
 */

// ─── Types ────────────────────────────────────────────────────────

export type GoalLevel = 'objective' | 'project' | 'plan' | 'task';

export type GoalStatus = 'planned' | 'active' | 'completed' | 'abandoned';

export interface Goal {
  id: string;
  title: string;
  level: GoalLevel;
  parentId?: string;
  status: GoalStatus;
  createdAt?: number;
  updatedAt?: number;
}

// ─── Goal Store ───────────────────────────────────────────────────

export interface GoalStore {
  version: string;
  goals: Goal[];
}

/**
 * Persistent goal repository backed by a JSON file.
 * Follows the same pattern as PlanStore in planner.ts.
 */
export interface GoalRepository {
  getById(id: string): Goal | null;
  getByParentId(parentId: string): Goal[];
  create(goal: Omit<Goal, 'createdAt' | 'updatedAt'>): Goal;
  updateStatus(id: string, status: GoalStatus): Goal;
  list(): Goal[];
}

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class JsonGoalRepository implements GoalRepository {
  private store: GoalStore;

  constructor(private filePath: string) {
    this.store = this.load();
  }

  private load(): GoalStore {
    if (!existsSync(this.filePath)) return { version: '1.0', goals: [] };
    try {
      const data = readFileSync(this.filePath, 'utf-8');
      return JSON.parse(data) as GoalStore;
    } catch {
      return { version: '1.0', goals: [] };
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  getById(id: string): Goal | null {
    return this.store.goals.find((g) => g.id === id) ?? null;
  }

  getByParentId(parentId: string): Goal[] {
    return this.store.goals.filter((g) => g.parentId === parentId);
  }

  create(goal: Omit<Goal, 'createdAt' | 'updatedAt'>): Goal {
    const now = Date.now();
    const full: Goal = { ...goal, createdAt: now, updatedAt: now };
    this.store.goals.push(full);
    this.save();
    return full;
  }

  updateStatus(id: string, status: GoalStatus): Goal {
    const goal = this.getById(id);
    if (!goal) throw new Error(`Goal not found: ${id}`);
    goal.status = status;
    goal.updatedAt = Date.now();
    this.save();
    return goal;
  }

  list(): Goal[] {
    return [...this.store.goals];
  }
}

// ─── Max ancestor depth ──────────────────────────────────────────

const MAX_ANCESTOR_DEPTH = 10;

// ─── GoalAncestry ────────────────────────────────────────────────

export class GoalAncestry {
  constructor(private repo: GoalRepository) {}

  /**
   * Walk the parent chain from a goal up to the root.
   * Returns ancestors from immediate parent to root (closest first).
   * Max 10 levels; throws on cycle detection.
   */
  getAncestors(goalId: string): Goal[] {
    const ancestors: Goal[] = [];
    const visited = new Set<string>();
    let currentId: string | undefined = goalId;

    // Start by finding the goal itself to get its parentId
    const start = this.repo.getById(goalId);
    if (!start) return [];
    currentId = start.parentId;

    while (currentId && ancestors.length < MAX_ANCESTOR_DEPTH) {
      if (visited.has(currentId)) {
        throw new Error(`Cycle detected in goal hierarchy at goal '${currentId}'`);
      }
      visited.add(currentId);

      const parent = this.repo.getById(currentId);
      if (!parent) break;

      ancestors.push(parent);
      currentId = parent.parentId;
    }

    return ancestors;
  }

  /**
   * Render a markdown summary of the goal hierarchy for a given goal.
   * Shows the full chain from root objective down to the current goal.
   */
  getContext(goalId: string): string {
    const goal = this.repo.getById(goalId);
    if (!goal) return '';

    const ancestors = this.getAncestors(goalId);
    // Build chain from root to current: reverse ancestors then append current
    const chain = [...ancestors].reverse();
    chain.push(goal);

    const lines: string[] = ['## Goal Context', ''];

    for (let i = 0; i < chain.length; i++) {
      const g = chain[i];
      const indent = '  '.repeat(i);
      const marker = i === chain.length - 1 ? '**→**' : '-';
      lines.push(`${indent}${marker} [${g.level}] ${g.title} (${g.status})`);
    }

    return lines.join('\n');
  }

  /**
   * Inject goal ancestry context into an execution context metadata object.
   * Returns a new context with goalAncestry added to config.
   */
  inject<T extends { config?: Record<string, unknown> }>(ctx: T, goalId: string): T {
    const rendered = this.getContext(goalId);
    if (!rendered) return ctx;

    return {
      ...ctx,
      config: {
        ...ctx.config,
        goalAncestry: rendered,
      },
    };
  }
}

/**
 * Generate a goal ID with the given level prefix.
 */
export function generateGoalId(level: GoalLevel): string {
  return `goal-${level}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
