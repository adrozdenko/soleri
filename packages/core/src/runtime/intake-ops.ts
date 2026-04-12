/**
 * Intake operations — 7 ops for book/PDF and text/URL ingestion.
 *
 * Ops: intake_ingest_book, intake_process, intake_status, intake_preview,
 *       ingest_url, ingest_text, ingest_batch.
 */

import { z } from 'zod';
import type { OpDefinition } from '../facades/types.js';
import type { IntakePipeline } from '../intake/intake-pipeline.js';
import type { TextIngester, IngestSource } from '../intake/text-ingester.js';
import type { SourceRegistry } from '../intake/source-registry.js';
import type { OperationLogger } from '../vault/operation-log.js';
import { coerceArray } from './schema-helpers.js';

/**
 * Create the 7 intake operations.
 *
 * The pipeline and textIngester are optional — when null, affected ops return a graceful error.
 */
export function createIntakeOps(
  pipeline: IntakePipeline | null,
  textIngester?: TextIngester | null,
  sourceRegistry?: SourceRegistry | null,
  opLogger?: OperationLogger | null,
): OpDefinition[] {
  return [
    // ─── Ingest Book ──────────────────────────────────────────────
    {
      name: 'intake_ingest_book',
      description:
        'Ingest a PDF book — parse, hash, chunk into fixed-size page windows, and create a resumable job.',
      auth: 'write',
      schema: z.object({
        pdfPath: z.string().describe('Absolute path to the PDF file.'),
        title: z.string().describe('Book title for citation and chunk labeling.'),
        domain: z.string().describe('Knowledge domain (e.g., "design-systems", "accessibility").'),
        author: z.string().optional().describe('Book author for metadata.'),
        chunkPageSize: z.number().optional().describe('Number of pages per chunk. Defaults to 10.'),
        tags: z
          .array(z.string())
          .optional()
          .describe('Additional tags applied to all extracted entries.'),
      }),
      handler: async (params) => {
        if (!pipeline) {
          return { error: 'Intake pipeline not configured' };
        }
        const config = {
          pdfPath: params.pdfPath as string,
          title: params.title as string,
          domain: params.domain as string,
          author: params.author as string | undefined,
          chunkPageSize: params.chunkPageSize as number | undefined,
          tags: params.tags as string[] | undefined,
        };
        return pipeline.ingestBook(config);
      },
    },

    // ─── Process Chunks ───────────────────────────────────────────
    {
      name: 'intake_process',
      description:
        'Process pending chunks for a job — extract text, classify via LLM, dedup, and store unique items in the vault.',
      auth: 'write',
      schema: z.object({
        jobId: z.string().describe('Job ID returned from intake_ingest_book.'),
        count: z
          .number()
          .optional()
          .describe('Max number of chunks to process in this batch. Defaults to 5.'),
      }),
      handler: async (params) => {
        if (!pipeline) {
          return { error: 'Intake pipeline not configured' };
        }
        return pipeline.processChunks(params.jobId as string, params.count as number | undefined);
      },
    },

    // ─── Status ───────────────────────────────────────────────────
    {
      name: 'intake_status',
      description:
        'Get intake job status. With jobId: returns job record and chunks. Without: lists all jobs.',
      auth: 'read',
      schema: z.object({
        jobId: z.string().optional().describe('Job ID to inspect. Omit to list all jobs.'),
      }),
      handler: async (params) => {
        if (!pipeline) {
          return { error: 'Intake pipeline not configured' };
        }
        const jobId = params.jobId as string | undefined;
        if (jobId) {
          const job = pipeline.getJob(jobId);
          if (!job) {
            return { error: `Job not found: ${jobId}` };
          }
          const chunks = pipeline.getChunks(jobId);
          return { job, chunks };
        }
        return { jobs: pipeline.listJobs() };
      },
    },

    // ─── Preview ──────────────────────────────────────────────────
    {
      name: 'intake_preview',
      description:
        'Preview what the pipeline would extract from a page range — parses and classifies without storing.',
      auth: 'read',
      schema: z.object({
        pdfPath: z.string().describe('Absolute path to the PDF file.'),
        title: z.string().describe('Book title for citation context.'),
        domain: z.string().describe('Knowledge domain for classification context.'),
        pageStart: z.number().describe('First page of the range (1-indexed, inclusive).'),
        pageEnd: z.number().describe('Last page of the range (1-indexed, inclusive).'),
      }),
      handler: async (params) => {
        if (!pipeline) {
          return { error: 'Intake pipeline not configured' };
        }
        const { pdfPath, title, domain, pageStart, pageEnd } = params as {
          pdfPath: string;
          title: string;
          domain: string;
          pageStart: number;
          pageEnd: number;
        };
        return pipeline.preview({ pdfPath, title, domain }, pageStart, pageEnd);
      },
    },

    // ─── URL Ingestion (#203) ──────────────────────────────────────
    {
      name: 'ingest_url',
      description:
        'Fetch a URL, extract text, classify into knowledge items via LLM, dedup against vault, and store. ' +
        'Returns count of ingested entries and duplicates skipped.',
      auth: 'write',
      schema: z.object({
        url: z.string().describe('URL to fetch and ingest'),
        domain: z.string().optional().describe('Knowledge domain (default: general)'),
        tags: z.array(z.string()).optional().describe('Additional tags for all extracted entries'),
      }),
      handler: async (params) => {
        if (!textIngester) return { error: 'Text ingester not configured (LLM client required)' };
        const result = await textIngester.ingestUrl(params.url as string, {
          domain: params.domain as string | undefined,
          tags: params.tags as string[] | undefined,
        });
        if (opLogger && result.ingested > 0) {
          try {
            opLogger.log(
              'ingest',
              'ingest_url',
              `Ingested ${result.ingested} from ${params.url}`,
              result.ingested,
              { url: params.url, duplicates: result.duplicates, enriched: result.enriched },
            );
          } catch {
            /* best-effort */
          }
        }
        return result;
      },
    },

    // ─── Text/Transcript Ingestion (#203) ──────────────────────────
    {
      name: 'ingest_text',
      description:
        'Ingest raw text (article, transcript, notes) — classify via LLM, dedup, and store. ' +
        'Use for transcripts, copied articles, meeting notes, etc.',
      auth: 'write',
      schema: z.object({
        text: z.string().describe('The text content to ingest'),
        title: z.string().describe('Title for the source material'),
        sourceType: z
          .enum(['article', 'transcript', 'notes', 'documentation'])
          .optional()
          .default('notes')
          .describe('Type of source material'),
        url: z.string().optional().describe('Source URL if available'),
        author: z.string().optional().describe('Author of the source material'),
        domain: z.string().optional().describe('Knowledge domain (default: general)'),
        tags: z.array(z.string()).optional().describe('Additional tags'),
      }),
      handler: async (params) => {
        if (!textIngester) return { error: 'Text ingester not configured (LLM client required)' };
        const source: IngestSource = {
          type: params.sourceType as 'article' | 'transcript' | 'notes' | 'documentation',
          title: params.title as string,
          url: params.url as string | undefined,
          author: params.author as string | undefined,
        };
        const result = await textIngester.ingestText(params.text as string, source, {
          domain: params.domain as string | undefined,
          tags: params.tags as string[] | undefined,
        });
        if (opLogger && result.ingested > 0) {
          try {
            opLogger.log(
              'ingest',
              'ingest_text',
              `Ingested ${result.ingested} from "${source.title}"`,
              result.ingested,
              { sourceType: source.type, duplicates: result.duplicates, enriched: result.enriched },
            );
          } catch {
            /* best-effort */
          }
        }
        return result;
      },
    },

    // ─── Batch Ingestion (#203) ────────────────────────────────────
    {
      name: 'ingest_batch',
      description:
        'Ingest multiple text items in one call. Each item has its own source metadata. Processed sequentially.',
      auth: 'write',
      schema: z.object({
        items: coerceArray(
          z
            .object({
              text: z.string(),
              title: z.string(),
              sourceType: z.enum(['article', 'transcript', 'notes', 'documentation']).optional(),
              url: z.string().optional(),
              author: z.string().optional(),
              domain: z.string().optional(),
              tags: z.array(z.string()).optional(),
            })
            .strict(),
        ).describe('Array of items to ingest (at least 1)'),
      }),
      handler: async (params) => {
        if (!textIngester) return { error: 'Text ingester not configured (LLM client required)' };
        const items = (params.items as Array<Record<string, unknown>>).map((item) => ({
          text: item.text as string,
          source: {
            type: (item.sourceType as string | undefined) ?? 'notes',
            title: item.title as string,
            url: item.url as string | undefined,
            author: item.author as string | undefined,
          } as IngestSource,
          opts: {
            domain: item.domain as string | undefined,
            tags: item.tags as string[] | undefined,
          },
        }));
        return textIngester.ingestBatch(items);
      },
    },

    // ─── Source Registry (#LLM-Wiki) ──────────────────────────────
    {
      name: 'list_sources',
      description:
        'List ingested sources with provenance tracking. Shows what was ingested and when.',
      auth: 'read',
      schema: z.object({
        domain: z.string().optional().describe('Filter by domain'),
        limit: z.number().optional().default(50).describe('Max results'),
      }),
      handler: async (params) => {
        if (!sourceRegistry) return { error: 'Source registry not configured' };
        return {
          sources: sourceRegistry.listSources({
            domain: params.domain as string | undefined,
            limit: params.limit as number,
          }),
        };
      },
    },
    {
      name: 'get_source',
      description: 'Get details for a specific ingested source.',
      auth: 'read',
      schema: z.object({
        sourceId: z.string().describe('Source ID to look up'),
      }),
      handler: async (params) => {
        if (!sourceRegistry) return { error: 'Source registry not configured' };
        const source = sourceRegistry.getSource(params.sourceId as string);
        if (!source) return { error: `Source not found: ${params.sourceId}` };
        return source;
      },
    },
    {
      name: 'source_entries',
      description: 'Get all vault entry IDs spawned from a specific source.',
      auth: 'read',
      schema: z.object({
        sourceId: z.string().describe('Source ID to look up'),
      }),
      handler: async (params) => {
        if (!sourceRegistry) return { error: 'Source registry not configured' };
        const entryIds = sourceRegistry.getSourceEntries(params.sourceId as string);
        return { sourceId: params.sourceId, entryIds, count: entryIds.length };
      },
    },
  ];
}
