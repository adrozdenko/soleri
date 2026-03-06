export interface IntelligenceEntry {
  id: string;
  type: 'pattern' | 'anti-pattern' | 'rule' | 'playbook';
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
  validFrom?: number; // unix epoch — when entry becomes active
  validUntil?: number; // unix epoch — when entry expires (null = never)
}

export interface IntelligenceBundle {
  domain: string;
  version: string;
  entries: IntelligenceEntry[];
}
