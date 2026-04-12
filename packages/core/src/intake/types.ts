// ─── Intake Pipeline Types ────────────────────────────────────────

export type IntakeJobStatus = 'initialized' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type IntakeChunkStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
export type KnowledgeType =
  | 'pattern'
  | 'anti-pattern'
  | 'principle'
  | 'concept'
  | 'reference'
  | 'workflow'
  | 'idea'
  | 'roadmap';

export interface IntakeConfig {
  pdfPath: string;
  title: string;
  author?: string;
  domain: string;
  chunkPageSize?: number;
  tags?: string[];
}

export interface IntakeChunk {
  id: number;
  jobId: string;
  chunkIndex: number;
  title: string | null;
  pageStart: number;
  pageEnd: number;
  status: IntakeChunkStatus;
  itemsExtracted: number;
  itemsStored: number;
  itemsDeduped: number;
  error: string | null;
  processedAt: number | null;
}

export interface ClassifiedItem {
  type: KnowledgeType;
  title: string;
  description: string;
  tags: string[];
  severity: 'critical' | 'warning' | 'suggestion';
  citation: string;
}

export interface IntakeJobRecord {
  id: string;
  status: IntakeJobStatus;
  config: IntakeConfig;
  pdfMeta: { totalPages: number; fileHash: string; fileSize: number } | null;
  toc: Array<{ title: string; page: number }> | null;
  stats: {
    itemsExtracted: number;
    itemsStored: number;
    itemsDeduped: number;
    itemsFailed: number;
  } | null;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

export interface IntakePreviewResult {
  items: ClassifiedItem[];
  chunkText: string;
  pageRange: { start: number; end: number };
}

export interface ContradictionFlag {
  newItemTitle: string;
  newItemType: string;
  existingEntryId: string;
  existingEntryTitle: string;
  existingEntryType: string;
  similarity: number;
}

export interface EnrichmentInfo {
  entryId: string;
  entryTitle: string;
  similarity: number;
  fieldsUpdated: string[];
}
