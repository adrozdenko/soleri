/**
 * LLM Client — Unified OpenAI/Anthropic caller with key pool rotation,
 * circuit breaker, retry, and model routing.
 *
 * Anthropic SDK is loaded via dynamic import on first use, keeping it
 * an optional peer dependency.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { homedir } from 'node:os';
import { LLMError } from './types.js';
import { CircuitBreaker, retry, parseRateLimitHeaders } from './utils.js';
import type { LLMCallOptions, LLMCallResult, RouteEntry, RoutingConfig } from './types.js';
import type { KeyPool } from './key-pool.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// =============================================================================
// MODEL ROUTER
// =============================================================================

function loadRoutingConfig(agentId: string): RoutingConfig {
  // Default task→model routing: cheap models for routine, powerful for reasoning.
  // Anthropic routes use extended thinking for quality decisions when available.
  // Agents can override via ~/.{agentId}/model-routing.json.
  const defaultRoutes: RouteEntry[] = [
    // OpenAI routes (default — works without Anthropic key)
    { caller: 'quality-gate', task: 'evaluate', model: 'gpt-4o', provider: 'openai' },
    { caller: 'classifier', task: 'classify', model: 'gpt-4o-mini', provider: 'openai' },
    { caller: 'knowledge-synthesizer', task: 'synthesize', model: 'gpt-4o', provider: 'openai' },
    { caller: 'content-classifier', model: 'gpt-4o-mini', provider: 'openai' },
    { caller: 'vault-linking', task: 'evaluate-links', model: 'gpt-4o-mini', provider: 'openai' },
    // Anthropic routes (higher quality when key available — extended thinking capable)
    {
      caller: 'quality-gate-anthropic',
      task: 'evaluate',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    },
    {
      caller: 'contradiction-evaluator',
      task: 'evaluate',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    },
    {
      caller: 'knowledge-synthesizer-anthropic',
      task: 'synthesize',
      model: 'claude-sonnet-4-20250514',
      provider: 'anthropic',
    },
    {
      caller: 'classifier-anthropic',
      task: 'classify',
      model: 'claude-haiku-4-5-20251001',
      provider: 'anthropic',
    },
  ];

  const defaultConfig: RoutingConfig = {
    routes: defaultRoutes,
    defaultOpenAIModel: 'gpt-4o-mini',
    defaultAnthropicModel: 'claude-sonnet-4-20250514',
  };

  const configPath = path.join(homedir(), `.${agentId}`, 'model-routing.json');

  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Partial<RoutingConfig>;
      if (data.routes && Array.isArray(data.routes)) {
        defaultConfig.routes = data.routes;
      }
      if (data.defaultOpenAIModel) {
        defaultConfig.defaultOpenAIModel = data.defaultOpenAIModel;
      }
      if (data.defaultAnthropicModel) {
        defaultConfig.defaultAnthropicModel = data.defaultAnthropicModel;
      }
    }
  } catch {
    // Config not available — use defaults
  }

  return defaultConfig;
}

function inferProvider(model: string): 'openai' | 'anthropic' {
  if (model.startsWith('claude-') || model.startsWith('anthropic/')) {
    return 'anthropic';
  }
  return 'openai';
}

class ModelRouter {
  private config: RoutingConfig;

  constructor(config?: RoutingConfig) {
    this.config = config ?? {
      routes: [],
      defaultOpenAIModel: 'gpt-4o-mini',
      defaultAnthropicModel: 'claude-sonnet-4-20250514',
    };
  }

  resolve(
    caller: string,
    task?: string,
    originalModel?: string,
  ): { model: string; provider: 'openai' | 'anthropic' } {
    if (task) {
      const exactMatch = this.config.routes.find((r) => r.caller === caller && r.task === task);
      if (exactMatch) {
        return { model: exactMatch.model, provider: exactMatch.provider };
      }
    }

    const callerMatch = this.config.routes.find((r) => r.caller === caller && !r.task);
    if (callerMatch) {
      return { model: callerMatch.model, provider: callerMatch.provider };
    }

    if (originalModel) {
      const provider = inferProvider(originalModel);
      return { model: originalModel, provider };
    }

    return { model: this.config.defaultOpenAIModel, provider: 'openai' };
  }

  getRoutes(): RouteEntry[] {
    return [...this.config.routes];
  }
}

// =============================================================================
// LLM CLIENT
// =============================================================================

// Anthropic SDK type — we only need the messages.create method shape
interface AnthropicClient {
  messages: {
    create(
      params: {
        model: string;
        max_tokens: number;
        system: string;
        messages: Array<{ role: string; content: string }>;
      },
      options?: { timeout: number },
    ): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    }>;
  };
}

type ResolvedLLMOptions = LLMCallOptions & { model: string; provider: 'openai' | 'anthropic' };

export class LLMClient {
  private openaiKeyPool: KeyPool;
  private anthropicKeyPool: KeyPool;
  private anthropicClient: AnthropicClient | null = null;
  private anthropicBreaker: CircuitBreaker;
  private anthropicKeyFingerprint: string = '';
  private router: ModelRouter;

  constructor(openaiKeyPool: KeyPool, anthropicKeyPool: KeyPool, agentId?: string) {
    this.openaiKeyPool = openaiKeyPool;
    this.anthropicKeyPool = anthropicKeyPool;
    this.anthropicBreaker = new CircuitBreaker({
      name: 'llm-anthropic',
      failureThreshold: 5,
      resetTimeoutMs: 60_000,
    });
    this.router = new ModelRouter(agentId ? loadRoutingConfig(agentId) : undefined);
  }

  async complete(options: LLMCallOptions): Promise<LLMCallResult> {
    const routed = this.router.resolve(options.caller, options.task, options.model);
    const resolved: ResolvedLLMOptions = {
      ...options,
      model: options.model ?? routed.model,
      provider: options.provider ?? routed.provider,
    };

    return resolved.provider === 'anthropic'
      ? this.callAnthropic(resolved)
      : this.callOpenAI(resolved);
  }

  isAvailable(): { openai: boolean; anthropic: boolean } {
    return {
      openai: this.openaiKeyPool.hasKeys,
      anthropic: this.anthropicKeyPool.hasKeys,
    };
  }

  getRoutes(): RouteEntry[] {
    return this.router.getRoutes();
  }

  // ===========================================================================
  // OPENAI
  // ===========================================================================

  private async callOpenAI(options: ResolvedLLMOptions): Promise<LLMCallResult> {
    const keyPool = this.openaiKeyPool.hasKeys ? this.openaiKeyPool : null;

    if (!keyPool) {
      throw new LLMError('OpenAI API key not configured', { retryable: false });
    }

    const start = Date.now();

    const doRequest = async (): Promise<LLMCallResult> => {
      const apiKey = keyPool.getActiveKey().expose();
      const keyIndex = keyPool.activeKeyIndex;

      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: options.model,
          messages: [
            { role: 'system', content: options.systemPrompt },
            { role: 'user', content: options.userPrompt },
          ],
          temperature: options.temperature ?? 0.3,
          max_completion_tokens: options.maxTokens ?? 500,
        }),
      });

      if (response.headers) {
        const rateLimits = parseRateLimitHeaders(response.headers);
        if (rateLimits.remaining !== null) {
          keyPool.updateQuota(keyIndex, rateLimits.remaining);
          keyPool.rotatePreemptive();
        }
      }

      if (!response.ok) {
        if (response.status === 429 && keyPool.poolSize > 1) {
          keyPool.rotateOnError();
        }

        const errorBody = await response.text();
        throw new LLMError(`OpenAI API error: ${response.status} - ${errorBody}`, {
          retryable: response.status === 429 || response.status >= 500,
          statusCode: response.status,
        });
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        text: data.choices[0]?.message?.content || '',
        model: options.model,
        provider: 'openai' as const,
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        durationMs: Date.now() - start,
      };
    };

    return retry(doRequest, { maxAttempts: 3 });
  }

  // ===========================================================================
  // ANTHROPIC
  // ===========================================================================

  private async callAnthropic(options: ResolvedLLMOptions): Promise<LLMCallResult> {
    const client = await this.getAnthropicClient();
    if (!client) {
      throw new LLMError('Anthropic API key not configured', { retryable: false });
    }

    const start = Date.now();

    return this.anthropicBreaker.call(() =>
      retry(
        async () => {
          const response = await client.messages.create(
            {
              model: options.model,
              max_tokens: options.maxTokens ?? 1024,
              system: options.systemPrompt,
              messages: [{ role: 'user', content: options.userPrompt }],
            },
            { timeout: 60_000 },
          );

          const text = response.content
            .filter(
              (block): block is { type: 'text'; text: string } =>
                block.type === 'text' && typeof block.text === 'string',
            )
            .map((block) => block.text)
            .join('\n');

          return {
            text,
            model: options.model,
            provider: 'anthropic' as const,
            inputTokens: response.usage?.input_tokens,
            outputTokens: response.usage?.output_tokens,
            durationMs: Date.now() - start,
          };
        },
        { maxAttempts: 2 },
      ),
    );
  }

  private async getAnthropicClient(): Promise<AnthropicClient | null> {
    if (!this.anthropicKeyPool.hasKeys) return null;

    const currentKey = this.anthropicKeyPool.getActiveKey().expose();
    const currentFingerprint = currentKey.slice(-8);

    if (currentFingerprint !== this.anthropicKeyFingerprint) {
      this.anthropicClient = null;
      this.anthropicKeyFingerprint = currentFingerprint;
    }

    if (this.anthropicClient) return this.anthropicClient;

    try {
      // Dynamic import — @anthropic-ai/sdk is an optional peer dep.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = await (Function('return import("@anthropic-ai/sdk")')() as Promise<{
        default: new (opts: { apiKey: string }) => AnthropicClient;
      }>);
      this.anthropicClient = new mod.default({ apiKey: currentKey });
      return this.anthropicClient;
    } catch {
      // SDK not installed — Anthropic provider unavailable
      return null;
    }
  }
}
