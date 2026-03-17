/**
 * Types for Identity Management and Intent Routing.
 *
 * Two separate concerns:
 * - Identity: agent persona CRUD with versioning and guidelines
 * - Intent Routing: keyword-based intent classification and operational modes
 */

// ─── Identity Types ──────────────────────────────────────────────────

export type GuidelineCategory = 'behavior' | 'preference' | 'restriction' | 'style';

export interface Guideline {
  id: string;
  category: GuidelineCategory;
  text: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface AgentIdentity {
  agentId: string;
  name: string;
  role: string;
  description: string;
  personality: string[];
  guidelines: Guideline[];
  version: number;
  updatedAt: string;
}

export interface IdentityVersion {
  version: number;
  snapshot: string;
  changedBy: string;
  changeReason: string;
  createdAt: string;
}

export interface IdentityUpdateInput {
  name?: string;
  role?: string;
  description?: string;
  personality?: string[];
  changedBy?: string;
  changeReason?: string;
}

export interface GuidelineInput {
  category: GuidelineCategory;
  text: string;
  priority?: number;
}

// ─── Intent Routing Types ────────────────────────────────────────────

export type IntentType =
  | 'build'
  | 'fix'
  | 'validate'
  | 'design'
  | 'improve'
  | 'deliver'
  | 'explore'
  | 'plan'
  | 'review'
  | 'general';

export type OperationalMode =
  | 'BUILD-MODE'
  | 'FIX-MODE'
  | 'VALIDATE-MODE'
  | 'DESIGN-MODE'
  | 'IMPROVE-MODE'
  | 'DELIVER-MODE'
  | 'EXPLORE-MODE'
  | 'PLAN-MODE'
  | 'REVIEW-MODE'
  | 'GENERAL-MODE';

export interface IntentClassification {
  intent: IntentType;
  mode: OperationalMode;
  confidence: number;
  method: 'keyword';
  matchedKeywords: string[];
}

export interface ModeConfig {
  mode: OperationalMode;
  intent: IntentType;
  description: string;
  behaviorRules: string[];
  keywords: string[];
}

export interface MorphResult {
  previousMode: OperationalMode;
  currentMode: OperationalMode;
  behaviorRules: string[];
}

export interface RoutingAccuracyReport {
  periodDays: number;
  total: number;
  correct: number;
  accuracy: number;
  corrections: number;
  commonMisroutes: Array<{ from: string; to: string; count: number }>;
  confidenceCalibration: Record<string, { total: number; correct: number; accuracy: number }>;
}
