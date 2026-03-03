export function generateIntelligenceTypes(): string {
  return `export interface IntelligenceEntry {
  id: string;
  type: 'pattern' | 'anti-pattern' | 'rule';
  domain: string;
  title: string;
  severity: 'critical' | 'warning' | 'suggestion';
  description: string;
  context?: string;
  example?: string;
  counterExample?: string;
  why?: string;
  tags: string[];
  appliesTo?: string[];
}

export interface IntelligenceBundle {
  domain: string;
  version: string;
  entries: IntelligenceEntry[];
}
`;
}
