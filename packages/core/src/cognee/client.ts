import type {
  CogneeConfig,
  CogneeSearchResult,
  CogneeSearchType,
  CogneeStatus,
  CogneeAddResult,
  CogneeCognifyResult,
} from './types.js';
import type { IntelligenceEntry } from '../intelligence/types.js';

// ─── Defaults ──────────────────────────────────────────────────────
// Aligned with Salvador MCP's battle-tested Cognee integration.

const DEFAULT_SERVICE_EMAIL = 'soleri-agent@cognee.dev';
const DEFAULT_SERVICE_PASSWORD = 'soleri-cognee-local';

/** Only allow default service credentials for local endpoints. */
function isLocalUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    );
  } catch {
    return false;
  }
}

const DEFAULT_CONFIG: CogneeConfig = {
  baseUrl: 'http://localhost:8000',
  dataset: 'vault',
  timeoutMs: 30_000,
  searchTimeoutMs: 120_000, // Ollama cold start can take 90s
  healthTimeoutMs: 5_000,
  healthCacheTtlMs: 60_000,
  cognifyDebounceMs: 30_000,
};

// ─── CogneeClient ──────────────────────────────────────────────────

export class CogneeClient {
  private config: CogneeConfig;
  private healthCache: { status: CogneeStatus; cachedAt: number } | null = null;
  private accessToken: string | null = null;
  private cognifyTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pendingDatasets: Set<string> = new Set();

  constructor(config?: Partial<CogneeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Strip trailing slash
    this.config.baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    // Pre-set token if provided
    if (this.config.apiToken) {
      this.accessToken = this.config.apiToken;
    }
  }

  // ─── Health ────────────────────────────────────────────────────

  get isAvailable(): boolean {
    if (!this.healthCache) return false;
    const age = Date.now() - this.healthCache.cachedAt;
    if (age > this.config.healthCacheTtlMs) return false;
    return this.healthCache.status.available;
  }

  async healthCheck(): Promise<CogneeStatus> {
    const start = Date.now();
    try {
      // Cognee health endpoint is GET / (returns {"message":"Hello, World, I am alive!"})
      const res = await globalThis.fetch(`${this.config.baseUrl}/`, {
        signal: AbortSignal.timeout(this.config.healthTimeoutMs),
      });
      const latencyMs = Date.now() - start;
      if (res.ok) {
        const status: CogneeStatus = { available: true, url: this.config.baseUrl, latencyMs };
        this.healthCache = { status, cachedAt: Date.now() };
        return status;
      }
      const status: CogneeStatus = {
        available: false,
        url: this.config.baseUrl,
        latencyMs,
        error: `HTTP ${res.status}`,
      };
      this.healthCache = { status, cachedAt: Date.now() };
      return status;
    } catch (err) {
      const latencyMs = Date.now() - start;
      const status: CogneeStatus = {
        available: false,
        url: this.config.baseUrl,
        latencyMs,
        error: err instanceof Error ? err.message : String(err),
      };
      this.healthCache = { status, cachedAt: Date.now() };
      return status;
    }
  }

  /**
   * Refresh health cache if stale, then return current status.
   * Use this before operations that need a fresh availability check.
   */
  async ensureHealthy(): Promise<CogneeStatus> {
    if (!this.isAvailable) {
      return this.healthCheck();
    }
    return this.healthCache!.status;
  }

  // ─── Ingest ────────────────────────────────────────────────────

  async addEntries(entries: IntelligenceEntry[]): Promise<CogneeAddResult> {
    if (entries.length === 0) return { added: 0 };
    if (!this.isAvailable) await this.healthCheck();
    if (!this.isAvailable)
      return { added: 0, code: 'UNAVAILABLE', error: 'Cognee health check not passing' };

    const attempt = async (token: string | null): Promise<Response> => {
      const formData = new FormData();
      formData.append('datasetName', this.config.dataset);
      for (const entry of entries) {
        const text = this.serializeEntry(entry);
        const blob = new Blob([text], { type: 'text/plain' });
        formData.append('data', blob, `${entry.id}.txt`);
      }
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      return globalThis.fetch(`${this.config.baseUrl}/api/v1/add`, {
        method: 'POST',
        headers,
        body: formData,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    };

    try {
      let token: string | null;
      try {
        token = await this.ensureAuth();
      } catch (authErr) {
        return {
          added: 0,
          code: 'AUTH_FAILED',
          error: authErr instanceof Error ? authErr.message : String(authErr),
        };
      }

      let res = await attempt(token);

      // Retry once on 401 — token may have expired
      if (res.status === 401) {
        this.accessToken = null; // force re-auth
        try {
          token = await this.ensureAuth();
        } catch (authErr) {
          return {
            added: 0,
            code: 'AUTH_FAILED',
            error: `Re-auth failed after 401: ${authErr instanceof Error ? authErr.message : String(authErr)}`,
          };
        }
        res = await attempt(token);
      }

      if (!res.ok) {
        return { added: 0, code: 'COGNEE_ERROR', error: `HTTP ${res.status}` };
      }

      this.scheduleCognify(this.config.dataset);
      return { added: entries.length };
    } catch (err) {
      return {
        added: 0,
        code: 'NETWORK_ERROR',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async cognify(dataset?: string): Promise<CogneeCognifyResult> {
    if (!this.isAvailable) await this.healthCheck();
    if (!this.isAvailable) return { status: 'unavailable' };

    try {
      const res = await this.post('/api/v1/cognify', {
        datasets: [dataset ?? this.config.dataset],
      });

      if (!res.ok) return { status: `error: HTTP ${res.status}` };
      return { status: 'ok' };
    } catch (err) {
      return { status: `error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // ─── Cognify debounce ───────────────────────────────────────────

  /**
   * Schedule a debounced cognify for a dataset.
   * Sliding window: each call resets the timer. When it expires,
   * cognify fires once. Prevents pipeline dedup on rapid ingests.
   */
  private scheduleCognify(dataset: string): void {
    const existing = this.cognifyTimers.get(dataset);
    if (existing) clearTimeout(existing);

    this.pendingDatasets.add(dataset);

    const timer = setTimeout(() => {
      this.cognifyTimers.delete(dataset);
      this.pendingDatasets.delete(dataset);
      this.post('/api/v1/cognify', { datasets: [dataset] }).catch(() => {});
    }, this.config.cognifyDebounceMs);

    // Unref so the timer doesn't keep the process alive during shutdown
    if (typeof timer === 'object' && 'unref' in timer) (timer as NodeJS.Timeout).unref();

    this.cognifyTimers.set(dataset, timer);
  }

  /** Flush all pending debounced cognify calls immediately. */
  async flushPendingCognify(): Promise<void> {
    const datasets = [...this.pendingDatasets];
    for (const timer of this.cognifyTimers.values()) clearTimeout(timer);
    this.cognifyTimers.clear();
    this.pendingDatasets.clear();

    if (datasets.length === 0) return;

    await Promise.allSettled(
      datasets.map((ds) => this.post('/api/v1/cognify', { datasets: [ds] }).catch(() => {})),
    );
  }

  /** Cancel all pending cognify calls without firing them. For test teardown. */
  resetPendingCognify(): void {
    for (const timer of this.cognifyTimers.values()) clearTimeout(timer);
    this.cognifyTimers.clear();
    this.pendingDatasets.clear();
  }

  // ─── Search ────────────────────────────────────────────────────

  async search(
    query: string,
    opts?: { searchType?: CogneeSearchType; limit?: number },
  ): Promise<CogneeSearchResult[]> {
    // Auto-refresh health cache if null or stale
    if (!this.isAvailable) {
      await this.healthCheck();
    }
    if (!this.isAvailable) return [];

    // Default to CHUNKS (pure vector similarity) — GRAPH_COMPLETION requires
    // the LLM to produce instructor-compatible JSON which small local models
    // (llama3.2) can't do reliably, causing infinite retries and timeouts.
    const searchType = opts?.searchType ?? 'CHUNKS';
    const topK = opts?.limit ?? 10;

    try {
      const res = await this.post(
        '/api/v1/search',
        { query, search_type: searchType, datasets: [this.config.dataset], topK },
        this.config.searchTimeoutMs,
      );

      if (!res.ok) return [];

      const data = (await res.json()) as Array<{
        id?: string;
        text?: string;
        score?: number;
        payload?: { id?: string };
      }>;

      // Position-based scoring when Cognee omits scores.
      // Cognee returns results ordered by relevance but may not include numeric scores.
      return data.slice(0, topK).map((item, idx) => ({
        id: item.payload?.id ?? item.id ?? '',
        score: item.score ?? positionScore(idx, data.length),
        text: typeof item.text === 'string' ? item.text : String(item.text ?? ''),
        searchType,
      }));
    } catch {
      return [];
    }
  }

  // ─── Config access ─────────────────────────────────────────────

  getConfig(): Readonly<CogneeConfig> {
    return { ...this.config };
  }

  getStatus(): CogneeStatus | null {
    return this.healthCache?.status ?? null;
  }

  // ─── Delete ──────────────────────────────────────────────────────

  async deleteEntries(entryIds: string[]): Promise<{ deleted: number }> {
    if (entryIds.length === 0) return { deleted: 0 };
    if (!this.isAvailable) await this.healthCheck();
    if (!this.isAvailable) return { deleted: 0 };

    try {
      const res = await this.post('/api/v1/delete', {
        datasetName: this.config.dataset,
        entryIds,
      });

      if (!res.ok) return { deleted: 0 };
      return { deleted: entryIds.length };
    } catch {
      return { deleted: 0 };
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────
  // Auto-register + login pattern from Salvador MCP.
  // Tries login first (account may already exist), falls back to register.

  private async ensureAuth(): Promise<string> {
    if (this.accessToken) return this.accessToken;

    const email = this.config.serviceEmail ?? DEFAULT_SERVICE_EMAIL;
    const password = this.config.servicePassword ?? DEFAULT_SERVICE_PASSWORD;

    // Refuse default credentials for non-local endpoints
    if (
      !isLocalUrl(this.config.baseUrl) &&
      email === DEFAULT_SERVICE_EMAIL &&
      password === DEFAULT_SERVICE_PASSWORD
    ) {
      throw new Error('Explicit Cognee credentials are required for non-local endpoints');
    }

    // Try login first (use timeoutMs, not healthTimeoutMs — auth can be slow on cold start)
    const loginResp = await globalThis.fetch(`${this.config.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (loginResp.ok) {
      const data = (await loginResp.json()) as { access_token: string };
      this.accessToken = data.access_token;
      return this.accessToken;
    }

    // Register, then retry login
    await globalThis.fetch(`${this.config.baseUrl}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    const retryLogin = await globalThis.fetch(`${this.config.baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(password)}`,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!retryLogin.ok) {
      throw new Error(`Cognee auth failed: HTTP ${retryLogin.status}`);
    }

    const retryData = (await retryLogin.json()) as { access_token: string };
    this.accessToken = retryData.access_token;
    return this.accessToken;
  }

  private async authHeaders(): Promise<Record<string, string>> {
    try {
      const token = await this.ensureAuth();
      return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    } catch {
      // Fall back to no auth (works if AUTH_REQUIRED=false)
      return { 'Content-Type': 'application/json' };
    }
  }

  // ─── Private helpers ───────────────────────────────────────────

  private serializeEntry(entry: IntelligenceEntry): string {
    // Prefix with vault ID so we can cross-reference search results back to vault entries.
    // Cognee assigns its own UUIDs to chunks — the vault ID would otherwise be lost.
    const parts = [`[vault-id:${entry.id}]`, entry.title, entry.description];
    if (entry.context) parts.push(entry.context);
    if (entry.tags.length > 0) parts.push(`Tags: ${entry.tags.join(', ')}`);
    return parts.join('\n');
  }

  private async post(path: string, body: unknown, timeoutMs?: number): Promise<Response> {
    const headers = await this.authHeaders();
    const res = await globalThis.fetch(`${this.config.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs ?? this.config.timeoutMs),
    });

    // Token expired — clear cached token, re-auth, and retry once
    if (res.status === 401 && this.accessToken) {
      this.accessToken = null;
      const retryHeaders = await this.authHeaders();
      return globalThis.fetch(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: retryHeaders,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs ?? this.config.timeoutMs),
      });
    }

    return res;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────

/** Position-based score: first result gets ~1.0, last gets ~0.05. */
function positionScore(index: number, total: number): number {
  if (total <= 1) return 1.0;
  return Math.max(0.05, 1.0 - (index / (total - 1)) * 0.95);
}
