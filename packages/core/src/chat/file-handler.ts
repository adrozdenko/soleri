/**
 * File Handler — intent detection and multimodal message building for chat transports.
 *
 * Provides transport-agnostic utilities for handling files sent by users:
 * - Intent detection: should this file be viewed (vision), read as text, or ingested?
 * - Multimodal message building for Anthropic API (ImageBlock, DocumentBlock)
 * - Temp file management
 *
 * The actual file download is transport-specific (Telegram, Discord, etc.)
 * and belongs in forge templates.
 */

import { mkdirSync, writeFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

// ─── Constants ────────────────────────────────────────────────────────

/** Maximum file size in bytes (Telegram limit). */
export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/** File extensions treated as readable text. */
export const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.py',
  '.rb',
  '.rs',
  '.go',
  '.java',
  '.kt',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.cs',
  '.php',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.md',
  '.txt',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.html',
  '.css',
  '.scss',
  '.sql',
  '.graphql',
  '.prisma',
  '.env',
  '.gitignore',
  '.dockerfile',
  '.csv',
  '.log',
]);

/** MIME types supported for vision (ImageBlock). */
export const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

/** Keywords that indicate the user wants to ingest/learn from the file. */
export const INTAKE_KEYWORDS = [
  'learn',
  'ingest',
  'absorb',
  'study',
  'memorize',
  'remember',
  'read this',
  'save this',
  'store this',
  'add to vault',
  'add to knowledge',
];

// ─── Types ────────────────────────────────────────────────────────────

export type FileIntent = 'vision' | 'text' | 'intake';

export interface FileInfo {
  /** Original filename. */
  name: string;
  /** MIME type. */
  mimeType: string;
  /** File size in bytes. */
  size: number;
  /** File content as Buffer. */
  data: Buffer;
}

export interface MultimodalContent {
  type: 'image' | 'document' | 'text';
  /** For image: base64 data. For document: base64 data. For text: the text content. */
  content: string;
  /** MIME type (for image/document). */
  mimeType?: string;
  /** Source filename. */
  filename?: string;
}

// ─── Intent Detection ─────────────────────────────────────────────────

/**
 * Detect what the user wants to do with a file based on its type and
 * any accompanying text message.
 */
export function detectFileIntent(
  filename: string,
  mimeType: string,
  userText?: string,
): FileIntent {
  const ext = extname(filename).toLowerCase();
  const textLower = userText?.toLowerCase() ?? '';

  // Check for intake keywords first
  if (userText && INTAKE_KEYWORDS.some((kw) => textLower.includes(kw))) {
    return 'intake';
  }

  // Text files → read as text
  if (TEXT_EXTENSIONS.has(ext)) {
    return 'text';
  }

  // Images → vision
  if (IMAGE_MIME_TYPES.has(mimeType) || mimeType.startsWith('image/')) {
    return 'vision';
  }

  // PDFs → vision (DocumentBlock)
  if (mimeType === 'application/pdf' || ext === '.pdf') {
    return 'vision';
  }

  // Default: try vision
  return 'vision';
}

// ─── Multimodal Message Building ──────────────────────────────────────

/**
 * Build multimodal content from a file for the Anthropic API.
 */
export function buildMultimodalContent(file: FileInfo, intent: FileIntent): MultimodalContent {
  const ext = extname(file.name).toLowerCase();

  if (intent === 'text' || TEXT_EXTENSIONS.has(ext)) {
    return {
      type: 'text',
      content: file.data.toString('utf-8'),
      filename: file.name,
    };
  }

  if (IMAGE_MIME_TYPES.has(file.mimeType)) {
    return {
      type: 'image',
      content: file.data.toString('base64'),
      mimeType: file.mimeType,
      filename: file.name,
    };
  }

  // PDF and other documents
  return {
    type: 'document',
    content: file.data.toString('base64'),
    mimeType: file.mimeType,
    filename: file.name,
  };
}

// ─── Temp File Management ─────────────────────────────────────────────

/**
 * Save a file to a temp directory with timestamp prefix.
 * Returns the full path.
 */
export function saveTempFile(uploadDir: string, filename: string, data: Buffer): string {
  mkdirSync(uploadDir, { recursive: true });
  const safeName = filename.replace(/[^\w.-]/g, '_');
  const path = join(uploadDir, `${Date.now()}-${safeName}`);
  writeFileSync(path, data);
  return path;
}

/**
 * Clean up temp files older than maxAgeMs.
 */
export function cleanupTempFiles(uploadDir: string, maxAgeMs: number = 3_600_000): number {
  let removed = 0;
  try {
    const cutoff = Date.now() - maxAgeMs;
    const files = readdirSync(uploadDir);
    for (const file of files) {
      const filePath = join(uploadDir, file);
      try {
        const stat = statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          rmSync(filePath);
          removed++;
        }
      } catch {
        // Skip files we can't stat
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }
  return removed;
}

/**
 * Strip base64 data from multimodal content for session persistence.
 * Replaces binary content with a size placeholder to prevent session bloat.
 */
export function sanitizeForPersistence(content: MultimodalContent): MultimodalContent {
  if (content.type === 'text') return content;

  const sizeKb = Math.round(Buffer.byteLength(content.content, 'base64') / 1024);
  return {
    ...content,
    content: `[${content.type}: ${content.filename ?? 'file'}, ${sizeKb}KB]`,
  };
}
