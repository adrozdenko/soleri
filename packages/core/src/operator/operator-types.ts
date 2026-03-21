/**
 * Operator Profile Types — type foundation for the Operator Profile module.
 *
 * Defines signals, profile sections, synthesis checks, and history
 * for personality learning and adaptation.
 */

// =============================================================================
// SIGNAL TYPES
// =============================================================================

/** All recognized signal types emitted during operator interaction. */
export enum SignalType {
  CommandStyle = 'command_style',
  WorkRhythm = 'work_rhythm',
  ToolPreference = 'tool_preference',
  SessionDepth = 'session_depth',
  DomainExpertise = 'domain_expertise',
  Correction = 'correction',
  Frustration = 'frustration',
  PersonalShare = 'personal_share',
  CommunicationPref = 'communication_pref',
  ReactionToOutput = 'reaction_to_output',
}

// =============================================================================
// SIGNAL DATA (discriminated union per SignalType)
// =============================================================================

/** Data for CommandStyle signals — how the operator phrases requests. */
export interface CommandStyleData {
  style: 'terse' | 'verbose' | 'conversational' | 'directive';
  /** Raw input snippet that evidences this style. */
  snippet: string;
}

/** Data for WorkRhythm signals — cadence and session patterns. */
export interface WorkRhythmData {
  pattern: 'burst' | 'steady' | 'exploratory' | 'deep-focus';
  /** Duration in minutes of the observed rhythm. */
  durationMinutes: number;
  /** Number of tasks completed in the observed window. */
  taskCount: number;
}

/** Data for ToolPreference signals — which tools the operator favors. */
export interface ToolPreferenceData {
  toolName: string;
  action: 'used' | 'avoided' | 'requested' | 'dismissed';
  /** How many times this preference was observed. */
  frequency: number;
}

/** Data for SessionDepth signals — how deep sessions tend to go. */
export interface SessionDepthData {
  depth: 'shallow' | 'moderate' | 'deep' | 'marathon';
  /** Number of messages in the session. */
  messageCount: number;
  /** Duration in minutes. */
  durationMinutes: number;
}

/** Data for DomainExpertise signals — areas of operator expertise. */
export interface DomainExpertiseData {
  domain: string;
  level: 'novice' | 'intermediate' | 'advanced' | 'expert';
  /** Evidence that led to this assessment. */
  evidence: string;
}

/** Data for Correction signals — when the operator corrects agent output. */
export interface CorrectionData {
  /** What the agent produced. */
  original: string;
  /** What the operator wanted instead. */
  corrected: string;
  /** Category of the correction. */
  category: 'factual' | 'style' | 'approach' | 'scope' | 'tone';
}

/** Data for Frustration signals — detected operator frustration. */
export interface FrustrationData {
  level: 'mild' | 'moderate' | 'high';
  /** Trigger phrase or context. */
  trigger: string;
  /** What the agent was doing when frustration was detected. */
  context: string;
}

/** Data for PersonalShare signals — operator shares personal info. */
export interface PersonalShareData {
  category: 'background' | 'preference' | 'philosophy' | 'anecdote';
  content: string;
  /** Whether the operator explicitly shared or it was inferred. */
  explicit: boolean;
}

/** Data for CommunicationPref signals — how the operator prefers responses. */
export interface CommunicationPrefData {
  preference: 'concise' | 'detailed' | 'structured' | 'casual' | 'formal';
  /** Specific aspect: response length, formatting, tone, etc. */
  aspect: 'length' | 'format' | 'tone' | 'detail-level';
}

/** Data for ReactionToOutput signals — how the operator responds to agent output. */
export interface ReactionToOutputData {
  reaction: 'positive' | 'negative' | 'neutral' | 'mixed';
  /** What aspect of the output prompted the reaction. */
  aspect: 'accuracy' | 'style' | 'completeness' | 'speed' | 'approach';
  /** Optional feedback snippet. */
  feedback?: string;
}

/** Maps each SignalType to its typed data payload. */
export interface SignalDataMap {
  [SignalType.CommandStyle]: CommandStyleData;
  [SignalType.WorkRhythm]: WorkRhythmData;
  [SignalType.ToolPreference]: ToolPreferenceData;
  [SignalType.SessionDepth]: SessionDepthData;
  [SignalType.DomainExpertise]: DomainExpertiseData;
  [SignalType.Correction]: CorrectionData;
  [SignalType.Frustration]: FrustrationData;
  [SignalType.PersonalShare]: PersonalShareData;
  [SignalType.CommunicationPref]: CommunicationPrefData;
  [SignalType.ReactionToOutput]: ReactionToOutputData;
}

// =============================================================================
// OPERATOR SIGNAL (discriminated union)
// =============================================================================

/** Base fields shared by all operator signals. */
interface OperatorSignalBase {
  /** Unique signal ID. */
  id: string;
  /** ISO 8601 timestamp when the signal was captured. */
  timestamp: string;
  /** Session ID where the signal was observed. */
  sessionId: string;
  /** Confidence in the signal detection (0.0 - 1.0). */
  confidence: number;
  /** Optional source context (e.g., message index, tool call). */
  source?: string;
}

/** Type-safe operator signal — discriminated on `signalType`. */
export type OperatorSignal = {
  [K in SignalType]: OperatorSignalBase & {
    signalType: K;
    data: SignalDataMap[K];
  };
}[SignalType];

// =============================================================================
// PROFILE SECTIONS
// =============================================================================

/** Evidence record attached to profile section entries. */
export interface ProfileEvidence {
  /** Signal ID that contributed to this evidence. */
  signalId: string;
  /** When the evidence was recorded. */
  timestamp: string;
  /** Confidence of the originating signal. */
  confidence: number;
  /** Short description of what was observed. */
  summary: string;
}

/** Identity section — who the operator is. */
export interface IdentitySection {
  /** Operator's professional background. */
  background: string;
  /** Current role or title. */
  role: string;
  /** Guiding philosophy or values. */
  philosophy: string;
  /** Evidence trail for identity inferences. */
  evidence: ProfileEvidence[];
}

/** A single cognitive pattern observed in the operator. */
export interface CognitivePattern {
  /** Name of the pattern (e.g., "visual-first-thinker"). */
  name: string;
  /** Description of the observed behavior. */
  description: string;
  /** How strongly this pattern is established (0.0 - 1.0). */
  strength: number;
}

/** A derivation — something inferred from observed patterns. */
export interface CognitiveDerivation {
  /** What was derived. */
  insight: string;
  /** Which patterns led to this derivation. */
  sourcePatterns: string[];
  /** Confidence in the derivation (0.0 - 1.0). */
  confidence: number;
}

/** Cognition section — how the operator thinks. */
export interface CognitionSection {
  /** Observed cognitive patterns. */
  patterns: CognitivePattern[];
  /** Inferences derived from pattern combinations. */
  derivations: CognitiveDerivation[];
  /** Evidence trail. */
  evidence: ProfileEvidence[];
}

/** Adaptation rule for communication. */
export interface CommunicationAdaptationRule {
  /** Condition that triggers the adaptation. */
  when: string;
  /** How the agent should adapt. */
  then: string;
  /** Source: observed from signals or reported by operator. */
  source: 'observed' | 'reported';
}

/** Communication section — how the operator prefers to communicate. */
export interface CommunicationSection {
  /** Overall communication style. */
  style: 'concise' | 'detailed' | 'structured' | 'casual' | 'formal' | 'mixed';
  /** Words or phrases the operator frequently uses. */
  signalWords: string[];
  /** Formality level (0.0 casual - 1.0 formal). */
  formality: number;
  /** Patience level (0.0 impatient - 1.0 patient). */
  patience: number;
  /** Rules for adapting agent communication. */
  adaptationRules: CommunicationAdaptationRule[];
}

/** A working rule the agent should follow for this operator. */
export interface WorkingRule {
  /** The rule statement. */
  rule: string;
  /** Where the rule came from. */
  source: 'observed' | 'reported';
  /** How many times this rule has been reinforced. */
  reinforcements: number;
  /** When the rule was first established. */
  firstSeen: string;
  /** When the rule was last reinforced. */
  lastSeen: string;
}

/** Working rules section — operator-specific behavioral rules. */
export interface WorkingRulesSection {
  rules: WorkingRule[];
}

/** Trust builder or breaker event. */
export interface TrustEvent {
  /** Description of the event. */
  event: string;
  /** Impact on trust (-1.0 to 1.0). */
  impact: number;
  /** When it happened. */
  timestamp: string;
}

/** Trust model section — the operator's trust relationship with the agent. */
export interface TrustModelSection {
  /** Overall trust level label. */
  level: 'new' | 'developing' | 'established' | 'deep';
  /** Events that built trust. */
  builders: TrustEvent[];
  /** Events that eroded trust. */
  breakers: TrustEvent[];
  /** Numeric trust level (0.0 - 1.0). */
  currentLevel: number;
}

/** A single taste profile entry. */
export interface TasteEntry {
  /** Category of taste (e.g., "code-style", "design", "tooling"). */
  category: string;
  /** The specific taste or preference. */
  content: string;
  /** How this taste affects work output. */
  workImplication: string;
  /** Evidence trail. */
  evidence: ProfileEvidence[];
}

/** Taste profile section — operator's aesthetic and stylistic preferences. */
export interface TasteProfileSection {
  entries: TasteEntry[];
}

/** A growth edge — area where the operator is developing. */
export interface GrowthEdge {
  /** The area of growth. */
  area: string;
  /** Description of the growth edge. */
  description: string;
  /** Current progress assessment. */
  progress: 'emerging' | 'developing' | 'maturing';
}

/** Growth edges section — areas the operator is developing in. */
export interface GrowthEdgesSection {
  /** Growth edges observed by the agent. */
  observed: GrowthEdge[];
  /** Growth edges the operator has mentioned themselves. */
  selfReported: GrowthEdge[];
}

/** A known tool in the operator's technical context. */
export interface TechnicalTool {
  /** Tool name. */
  name: string;
  /** Proficiency level. */
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  /** How frequently the operator uses this tool. */
  frequency: 'rare' | 'occasional' | 'regular' | 'daily';
}

/** A blind spot in the operator's technical knowledge. */
export interface TechnicalBlindSpot {
  /** Area of the blind spot. */
  area: string;
  /** Description. */
  description: string;
  /** How the agent should handle this blind spot. */
  mitigation: string;
}

/** Technical context section — operator's technical environment. */
export interface TechnicalContextSection {
  /** Domains the operator works in. */
  domains: string[];
  /** Tools the operator uses. */
  tools: TechnicalTool[];
  /** Known technical blind spots. */
  blindSpots: TechnicalBlindSpot[];
}

/** Union of all profile section types. */
export type ProfileSection =
  | IdentitySection
  | CognitionSection
  | CommunicationSection
  | WorkingRulesSection
  | TrustModelSection
  | TasteProfileSection
  | GrowthEdgesSection
  | TechnicalContextSection;

/** Profile section keys. */
export type ProfileSectionKey =
  | 'identity'
  | 'cognition'
  | 'communication'
  | 'workingRules'
  | 'trustModel'
  | 'tasteProfile'
  | 'growthEdges'
  | 'technicalContext';

// =============================================================================
// OPERATOR PROFILE
// =============================================================================

/** Complete operator profile — composed of all sections plus metadata. */
export interface OperatorProfile {
  /** Unique profile ID. */
  id: string;
  /** Operator identifier (e.g., username, session owner). */
  operatorId: string;
  /** Profile format version for migration support. */
  version: number;

  // ─── Sections ────────────────────────────────────────────────────
  identity: IdentitySection;
  cognition: CognitionSection;
  communication: CommunicationSection;
  workingRules: WorkingRulesSection;
  trustModel: TrustModelSection;
  tasteProfile: TasteProfileSection;
  growthEdges: GrowthEdgesSection;
  technicalContext: TechnicalContextSection;

  // ─── Metadata ────────────────────────────────────────────────────
  /** Total number of sessions that contributed to this profile. */
  sessionCount: number;
  /** ISO 8601 timestamp of the last synthesis pass. */
  lastSynthesis: string | null;
  /** ISO 8601 timestamp when the profile was created. */
  createdAt: string;
  /** ISO 8601 timestamp of the last update. */
  updatedAt: string;
}

// =============================================================================
// SYNTHESIS CHECK
// =============================================================================

/** Result of checking whether a synthesis pass is needed. */
export interface SynthesisCheckResult {
  /** Whether synthesis is due. */
  due: boolean;
  /** Human-readable reason for the decision. */
  reason: string;
  /** Per-section breakdown of what needs updating. */
  sectionsToUpdate: Record<ProfileSectionKey, boolean>;
  /** Number of unprocessed signals since last synthesis. */
  pendingSignalCount: number;
  /** ISO 8601 timestamp of the last synthesis (null if never run). */
  lastSynthesisAt: string | null;
}

// =============================================================================
// PROFILE HISTORY
// =============================================================================

/** A snapshot of the profile at a point in time. */
export interface ProfileSnapshot {
  /** Snapshot ID. */
  id: string;
  /** ISO 8601 timestamp when the snapshot was taken. */
  timestamp: string;
  /** The profile state at this point. */
  profile: OperatorProfile;
  /** What triggered this snapshot (e.g., "synthesis", "manual"). */
  trigger: string;
  /** Summary of changes from the previous snapshot. */
  changeSummary: string;
}

/** History of an operator profile — tracks evolution over time. */
export interface OperatorProfileHistory {
  /** Profile ID this history belongs to. */
  profileId: string;
  /** Ordered list of snapshots (newest first). */
  snapshots: ProfileSnapshot[];
  /** Total number of synthesis passes performed. */
  synthesisCount: number;
  /** Total number of signals processed across all time. */
  totalSignalsProcessed: number;
}
