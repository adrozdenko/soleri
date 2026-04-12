/**
 * Intake facade — content ingestion ops.
 * intake_ingest_book, intake_process, intake_status, intake_preview,
 * ingest_url, ingest_text, ingest_batch, list_sources, get_source, source_entries.
 */

import type { OpDefinition } from '../../facades/types.js';
import type { AgentRuntime } from '../types.js';
import { createIntakeOps } from '../intake-ops.js';
import { SourceRegistry } from '../../intake/source-registry.js';
import { OperationLogger } from '../../vault/operation-log.js';

export function createIntakeFacadeOps(runtime: AgentRuntime): OpDefinition[] {
  const { intakePipeline, textIngester, vault } = runtime;

  // Create source registry and operation logger from vault provider (idempotent table creation)
  let sourceRegistry: SourceRegistry | null = null;
  let opLogger: OperationLogger | null = null;
  try {
    if (vault) {
      const provider = vault.getProvider();
      sourceRegistry = new SourceRegistry(provider);
      opLogger = new OperationLogger(provider);
      if (textIngester) {
        textIngester.setSourceRegistry(sourceRegistry);
      }
    }
  } catch {
    // Source registry and logger are optional — degrade gracefully
  }

  return createIntakeOps(intakePipeline, textIngester, sourceRegistry, opLogger);
}
