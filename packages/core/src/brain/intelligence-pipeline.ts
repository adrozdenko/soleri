import type { PersistenceProvider } from '../persistence/types.js';
import type { PatternStrength } from './types.js';

export function buildGlobalRegistry(
  provider: PersistenceProvider,
  strengths: PatternStrength[],
): number {
  const patternMap = new Map<string, PatternStrength[]>();

  for (const strength of strengths) {
    const entries = patternMap.get(strength.pattern) ?? [];
    entries.push(strength);
    patternMap.set(strength.pattern, entries);
  }

  provider.run('DELETE FROM brain_global_registry');

  let count = 0;
  for (const [pattern, entries] of patternMap) {
    const domains = [...new Set(entries.map((entry) => entry.domain))];
    const totalStrength = entries.reduce((sum, entry) => sum + entry.strength, 0);
    const avgStrength = totalStrength / entries.length;

    provider.run(
      `INSERT INTO brain_global_registry
       (pattern, domains, total_strength, avg_strength, domain_count, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [pattern, JSON.stringify(domains), totalStrength, avgStrength, domains.length],
    );
    count++;
  }

  return count;
}

export function buildDomainProfiles(
  provider: PersistenceProvider,
  strengths: PatternStrength[],
): number {
  const domainMap = new Map<string, PatternStrength[]>();

  for (const strength of strengths) {
    const entries = domainMap.get(strength.domain) ?? [];
    entries.push(strength);
    domainMap.set(strength.domain, entries);
  }

  provider.run('DELETE FROM brain_domain_profiles');

  let count = 0;
  for (const [domain, entries] of domainMap) {
    entries.sort((a, b) => b.strength - a.strength);
    const topPatterns = entries.slice(0, 10).map((entry) => ({
      pattern: entry.pattern,
      strength: entry.strength,
    }));

    const sessionCount = provider.get<{ c: number }>(
      'SELECT COUNT(*) as c FROM brain_sessions WHERE domain = ?',
      [domain],
    )!.c;

    const durationRow = provider.get<{ avg_min: number | null }>(
      `SELECT AVG(
        (julianday(ended_at) - julianday(started_at)) * 1440
      ) as avg_min
      FROM brain_sessions
      WHERE domain = ? AND ended_at IS NOT NULL`,
      [domain],
    )!;

    const lastActivity = entries.reduce(
      (latest, entry) => (entry.lastUsed > latest ? entry.lastUsed : latest),
      '',
    );

    provider.run(
      `INSERT INTO brain_domain_profiles
       (domain, top_patterns, session_count, avg_session_duration, last_activity, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        domain,
        JSON.stringify(topPatterns),
        sessionCount,
        durationRow.avg_min ?? 0,
        lastActivity || new Date().toISOString(),
      ],
    );
    count++;
  }

  return count;
}
