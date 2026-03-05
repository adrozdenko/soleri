/**
 * Project registry types — tracks projects, rules, and cross-project links.
 */

export interface RegisteredProject {
  id: string;
  path: string;
  name?: string;
  registeredAt: number;
  lastAccessedAt: number;
  metadata?: Record<string, unknown>;
}

export interface ProjectRule {
  id: string;
  projectId: string;
  category: 'behavior' | 'preference' | 'restriction' | 'convention';
  text: string;
  priority: number;
  createdAt: number;
}

export type LinkType = 'related' | 'parent' | 'child' | 'fork';

export interface ProjectLink {
  id: number;
  sourceProjectId: string;
  targetProjectId: string;
  linkType: LinkType;
  createdAt: number;
}
