/**
 * Scheduler runtime ops — CRUD for cross-platform scheduled agent tasks.
 *
 * Ops:
 *   scheduler_create  — create a new scheduled task
 *   scheduler_list    — list all tasks with OS sync status
 *   scheduler_delete  — remove a task from OS and DB
 *   scheduler_pause   — disable a task without deleting it
 *   scheduler_resume  — re-enable a paused task
 */

import type { OpDefinition } from '../facades/types.js';
import { Scheduler, InMemorySchedulerStore } from './scheduler.js';
import type { SchedulerStore } from './scheduler.js';

export function createSchedulerOps(store?: SchedulerStore): OpDefinition[] {
  const scheduler = new Scheduler(undefined, store ?? new InMemorySchedulerStore());

  return [
    {
      name: 'scheduler_create',
      description: 'Create a scheduled agent task (cron-based, cross-platform)',
      auth: 'write',
      handler: async (params: Record<string, unknown>) => {
        const name = String(params['name'] ?? '');
        const cronExpression = String(params['cronExpression'] ?? '');
        const prompt = String(params['prompt'] ?? '');
        const projectPath = String(params['projectPath'] ?? process.cwd());

        if (!name) return { error: 'name is required' };
        if (!cronExpression) return { error: 'cronExpression is required' };
        if (!prompt) return { error: 'prompt is required' };

        return scheduler.create({ name, cronExpression, prompt, projectPath });
      },
    },
    {
      name: 'scheduler_list',
      description: 'List all Soleri-managed scheduled tasks with OS sync status',
      auth: 'read',
      handler: async () => {
        const tasks = await scheduler.list();
        return { tasks, count: tasks.length };
      },
    },
    {
      name: 'scheduler_delete',
      description: 'Delete a scheduled task (removes from OS scheduler and DB)',
      auth: 'write',
      handler: async (params: Record<string, unknown>) => {
        const id = String(params['id'] ?? '');
        if (!id) return { error: 'id is required' };
        return scheduler.delete(id);
      },
    },
    {
      name: 'scheduler_pause',
      description: 'Pause a scheduled task without deleting it',
      auth: 'write',
      handler: async (params: Record<string, unknown>) => {
        const id = String(params['id'] ?? '');
        if (!id) return { error: 'id is required' };
        return scheduler.pause(id);
      },
    },
    {
      name: 'scheduler_resume',
      description: 'Resume a paused scheduled task',
      auth: 'write',
      handler: async (params: Record<string, unknown>) => {
        const id = String(params['id'] ?? '');
        if (!id) return { error: 'id is required' };
        return scheduler.resume(id);
      },
    },
  ];
}
