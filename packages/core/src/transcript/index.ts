// ─── Transcript Memory Lane ─────────────────────────────────────────
export type {
  TranscriptSourceKind,
  TranscriptSession,
  TranscriptRole,
  TranscriptMessage,
  TranscriptSegmentKind,
  TranscriptSegment,
  TranscriptSearchHit,
  TranscriptSearchOptions,
  TranscriptCaptureInput,
  TranscriptCaptureResult,
} from './types.js';

export type { JsonlParseOptions } from './jsonl-parser.js';
export {
  parseTranscriptJsonl,
  flattenAssistantContent,
  flattenUserContent,
  estimateTokens,
} from './jsonl-parser.js';

export type { WindowOptions } from './segmenter.js';
export { segmentByExchange, segmentByWindow, segmentMessages, hashContent } from './segmenter.js';

export type { RankerCandidate, RankOptions } from './ranker.js';
export {
  rankTranscriptCandidates,
  computeExactPhrase,
  computeTokenOverlap,
  generateExcerpt,
} from './ranker.js';

export {
  captureTranscriptSession,
  searchTranscriptSegments,
  getTranscriptSession,
  getTranscriptMessages,
  archiveTranscriptSession,
} from '../vault/vault-transcripts.js';
