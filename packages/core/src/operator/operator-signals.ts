/**
 * operator-signals — pure functions that extract personality-relevant signals
 * from existing engine events.
 *
 * Zero LLM, zero side effects, zero DB imports.
 * Each function takes structured data and returns OperatorSignal[].
 */

import { randomUUID } from 'node:crypto';
import { SignalType, type OperatorSignal } from './operator-types.js';
import type { RadarCandidate } from '../brain/learning-radar.js';
import type { PatternStrength } from '../brain/types.js';

// =============================================================================
// INPUT TYPES
// =============================================================================

/** Minimal session capture data needed for signal extraction. */
export interface SessionCaptureData {
  sessionId: string;
  intent: string | null;
  capturedAt: string; // ISO 8601
  toolsUsed: string[] | null;
  filesModified: string[] | null;
  decisions: string[] | null;
  summary: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

const DEFAULT_CONFIDENCE = 0.5;

function makeSignalId(): string {
  return `sig-${randomUUID()}`;
}

function nowISO(): string {
  return new Date().toISOString();
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// =============================================================================
// extractFromSession
// =============================================================================

/**
 * Extract personality-relevant signals from a session capture.
 *
 * Produces:
 * - command_style — from intent word count
 * - work_rhythm — from capturedAt timestamp
 * - tool_preference — from toolsUsed frequencies
 * - session_depth — from filesModified + decisions count
 */
export function extractFromSession(session: SessionCaptureData): OperatorSignal[] {
  const signals: OperatorSignal[] = [];
  const ts = nowISO();
  const sid = session.sessionId;

  // ─── command_style ──────────────────────────────────────────────
  if (session.intent && typeof session.intent === 'string') {
    const wc = wordCount(session.intent);
    let style: 'terse' | 'verbose' | 'conversational' | 'directive';
    if (wc < 5) {
      style = 'terse';
    } else if (wc > 20) {
      style = 'verbose';
    } else {
      style = 'conversational';
    }

    signals.push({
      id: makeSignalId(),
      timestamp: ts,
      sessionId: sid,
      confidence: DEFAULT_CONFIDENCE,
      signalType: SignalType.CommandStyle,
      source: 'session_capture',
      data: {
        style,
        snippet: session.intent,
      },
    });
  }

  // ─── work_rhythm ────────────────────────────────────────────────
  if (session.capturedAt) {
    const date = new Date(session.capturedAt);
    const _hour = date.getUTCHours();
    const decisions = session.decisions ?? [];
    const files = session.filesModified ?? [];

    // Infer pattern from hour + activity level
    const activityScore = files.length + decisions.length;
    let pattern: 'burst' | 'steady' | 'exploratory' | 'deep-focus';
    if (activityScore >= 6) {
      pattern = 'deep-focus';
    } else if (activityScore >= 3) {
      pattern = 'steady';
    } else if (activityScore >= 1) {
      pattern = 'exploratory';
    } else {
      pattern = 'burst';
    }

    signals.push({
      id: makeSignalId(),
      timestamp: ts,
      sessionId: sid,
      confidence: DEFAULT_CONFIDENCE,
      signalType: SignalType.WorkRhythm,
      source: 'session_capture',
      data: {
        pattern,
        durationMinutes: 0, // Not available from capture data
        taskCount: activityScore,
      },
    });
  }

  // ─── tool_preference ────────────────────────────────────────────
  if (session.toolsUsed && Array.isArray(session.toolsUsed)) {
    const freq = new Map<string, number>();
    for (const tool of session.toolsUsed) {
      freq.set(tool, (freq.get(tool) ?? 0) + 1);
    }

    for (const [toolName, count] of freq) {
      signals.push({
        id: makeSignalId(),
        timestamp: ts,
        sessionId: sid,
        confidence: DEFAULT_CONFIDENCE,
        signalType: SignalType.ToolPreference,
        source: 'session_capture',
        data: {
          toolName,
          action: 'used',
          frequency: count,
        },
      });
    }
  }

  // ─── session_depth ──────────────────────────────────────────────
  {
    const files = session.filesModified ?? [];
    const decisions = session.decisions ?? [];
    const total = files.length + decisions.length;

    let depth: 'shallow' | 'moderate' | 'deep' | 'marathon';
    if (total >= 8) {
      depth = 'marathon';
    } else if (total >= 5) {
      depth = 'deep';
    } else if (total >= 2) {
      depth = 'moderate';
    } else {
      depth = 'shallow';
    }

    signals.push({
      id: makeSignalId(),
      timestamp: ts,
      sessionId: sid,
      confidence: DEFAULT_CONFIDENCE,
      signalType: SignalType.SessionDepth,
      source: 'session_capture',
      data: {
        depth,
        messageCount: 0, // Not available from capture data
        durationMinutes: 0,
      },
    });
  }

  return signals;
}

// =============================================================================
// extractFromRadar
// =============================================================================

/**
 * Extract operator signals from a radar candidate.
 *
 * - correction signal_type → correction OperatorSignal
 * - repeated_question → frustration OperatorSignal
 * - Other signal types are not personality-relevant → empty array.
 */
export function extractFromRadar(candidate: RadarCandidate): OperatorSignal[] {
  const signals: OperatorSignal[] = [];
  const ts = nowISO();
  const sid = `radar-${candidate.id}`;

  if (candidate.signalType === 'correction') {
    signals.push({
      id: makeSignalId(),
      timestamp: ts,
      sessionId: sid,
      confidence: candidate.confidence,
      signalType: SignalType.Correction,
      source: 'learning_radar',
      data: {
        original: candidate.description,
        corrected: candidate.title,
        category: 'approach',
      },
    });
  } else if (candidate.signalType === 'repeated_question') {
    signals.push({
      id: makeSignalId(),
      timestamp: ts,
      sessionId: sid,
      confidence: candidate.confidence,
      signalType: SignalType.Frustration,
      source: 'learning_radar',
      data: {
        level:
          candidate.confidence >= 0.7 ? 'high' : candidate.confidence >= 0.5 ? 'moderate' : 'mild',
        trigger: candidate.sourceQuery ?? candidate.title,
        context: candidate.context ?? candidate.description,
      },
    });
  }

  return signals;
}

// =============================================================================
// extractFromBrainStrengths
// =============================================================================

/**
 * Extract domain expertise signals from brain pattern strengths.
 *
 * Filters strengths with score > 0.6 and maps them to domain_expertise signals.
 */
export function extractFromBrainStrengths(strengths: PatternStrength[]): OperatorSignal[] {
  const ts = nowISO();

  return strengths
    .filter((s) => s.strength > 0.6)
    .map((s) => ({
      id: makeSignalId(),
      timestamp: ts,
      sessionId: 'brain-strengths',
      confidence: s.strength,
      signalType: SignalType.DomainExpertise,
      source: 'brain_intelligence',
      data: {
        domain: s.domain,
        level: (s.strength >= 0.8 ? 'expert' : 'advanced') as 'expert' | 'advanced',
        evidence: `Pattern "${s.pattern}" in ${s.domain} with strength ${s.strength}`,
      },
    }));
}
