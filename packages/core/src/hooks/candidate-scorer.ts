/**
 * Candidate scoring rubric for skill-to-hook conversion.
 * 4-dimension scoring: frequency, eventCorrelation, determinism, autonomy.
 * Threshold: >= 3 HIGH dimensions = candidate for conversion.
 */

export type DimensionLevel = 'HIGH' | 'LOW';

export interface CandidateDimensions {
  /** 3+ manual calls per session for same event type → HIGH */
  frequency: DimensionLevel;
  /** Skill consistently triggers on a recognizable hook event → HIGH */
  eventCorrelation: DimensionLevel;
  /** Skill produces consistent, non-exploratory guidance → HIGH */
  determinism: DimensionLevel;
  /** Skill requires no interactive user decisions mid-execution → HIGH */
  autonomy: DimensionLevel;
}

export interface CandidateScore {
  dimensions: CandidateDimensions;
  highCount: number;
  candidate: boolean;
}

/**
 * Score a skill for hook conversion candidacy.
 * @param dimensions - The 4 scored dimensions (each HIGH or LOW)
 * @returns Score with candidate boolean (true if >= 3 HIGH)
 */
export function scoreCandidateForConversion(dimensions: CandidateDimensions): CandidateScore {
  const values = Object.values(dimensions);
  const highCount = values.filter((v) => v === 'HIGH').length;
  return {
    dimensions,
    highCount,
    candidate: highCount >= 3,
  };
}
