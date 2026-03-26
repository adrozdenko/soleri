import { describe, it, expect } from 'vitest';
import { scoreCandidateForConversion } from './candidate-scorer.js';
import type { CandidateDimensions } from './candidate-scorer.js';

describe('scoreCandidateForConversion', () => {
  it('should identify strong candidate (4/4 HIGH)', () => {
    const dimensions: CandidateDimensions = {
      frequency: 'HIGH',
      eventCorrelation: 'HIGH',
      determinism: 'HIGH',
      autonomy: 'HIGH',
    };
    const result = scoreCandidateForConversion(dimensions);
    expect(result.highCount).toBe(4);
    expect(result.candidate).toBe(true);
  });

  it('should identify borderline candidate (3/4 HIGH)', () => {
    const dimensions: CandidateDimensions = {
      frequency: 'HIGH',
      eventCorrelation: 'HIGH',
      determinism: 'HIGH',
      autonomy: 'LOW',
    };
    const result = scoreCandidateForConversion(dimensions);
    expect(result.highCount).toBe(3);
    expect(result.candidate).toBe(true);
  });

  it('should reject non-candidate (2/4 HIGH)', () => {
    const dimensions: CandidateDimensions = {
      frequency: 'HIGH',
      eventCorrelation: 'LOW',
      determinism: 'HIGH',
      autonomy: 'LOW',
    };
    const result = scoreCandidateForConversion(dimensions);
    expect(result.highCount).toBe(2);
    expect(result.candidate).toBe(false);
  });

  it('should reject weak candidate (1/4 HIGH)', () => {
    const dimensions: CandidateDimensions = {
      frequency: 'LOW',
      eventCorrelation: 'LOW',
      determinism: 'LOW',
      autonomy: 'HIGH',
    };
    const result = scoreCandidateForConversion(dimensions);
    expect(result.highCount).toBe(1);
    expect(result.candidate).toBe(false);
  });

  it('should reject zero score (0/4 HIGH)', () => {
    const dimensions: CandidateDimensions = {
      frequency: 'LOW',
      eventCorrelation: 'LOW',
      determinism: 'LOW',
      autonomy: 'LOW',
    };
    const result = scoreCandidateForConversion(dimensions);
    expect(result.highCount).toBe(0);
    expect(result.candidate).toBe(false);
  });

  it('should preserve dimension values in result', () => {
    const dimensions: CandidateDimensions = {
      frequency: 'HIGH',
      eventCorrelation: 'LOW',
      determinism: 'HIGH',
      autonomy: 'HIGH',
    };
    const result = scoreCandidateForConversion(dimensions);
    expect(result.dimensions).toEqual(dimensions);
  });
});
