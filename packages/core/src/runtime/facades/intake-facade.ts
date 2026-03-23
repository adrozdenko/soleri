/**
 * Intake facade — content ingestion ops.
 * intake_ingest_book, intake_process, intake_status, intake_preview,
 * ingest_url, ingest_text, ingest_batch.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createIntakeOps } from '../intake-ops.js';

export function createIntakeFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { intakePipeline, textIngester } = runtime;
  return createIntakeOps(intakePipeline, textIngester);
}
