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
import type {
  LLMCallOptions,
  LLMCallResult,
  ProviderName,
  RouteEntry,
  RoutingConfig,
} from './types.js';
import type { KeyPool } from './key-pool.js';
import { probeClaudeCLI } from './probe.js';
import { callClaudeCLI } from './claude-cli-provider.js';

// =============================================================================
// CONSTANTS
// =============================================================================

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// =============================================================================
// MODEL ROUTER
// =============================================================================

function loadRoutingConfig(agentId: string): RoutingConfig {
  // Default routing: claude-cli (Claude Code passthrough) for all curator + linking work.
  // The fallback chain in LLMClient.complete() handles claude-cli → anthropic SDK → openai SDK
  // automatically, so failures of the primary provider degrade gracefully.
  // Agents can override via ~/.{agentId}/model-routing.json.
  const defaultRoutes: RouteEntry[] = [
    {
      caller: 'quality-gate',
      task: 'evaluate',
      model: 'claude-sonnet-4-6',
      provider: 'claude-cli',
    },
    { caller: 'classifier', task: 'classify', model: 'claude-haiku-4-5', provider: 'claude-cli' },
    {
      caller: 'knowledge-synthesizer',
      task: 'synthesize',
      model: 'claude-sonnet-4-6',
      provider: 'claude-cli',
    },
    { caller: 'content-classifier', model: 'claude-haiku-4-5', provider: 'claude-cli' },
    {
      caller: 'vault-linking',
      task: 'evaluate-links',
      model: 'claude-haiku-4-5',
      provider: 'claude-cli',
    },
    {
      caller: 'contradiction-evaluator',
      task: 'evaluate',
      model: 'claude-sonnet-4-6',
      provider: 'claude-cli',
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

function inferProvider(model: string): ProviderName {
  if (model.startsWith('claude-') || model.startsWith('anthropic/')) {
    return 'anthropic';
  }
  return 'openai';
}

const FALLBACK_ORDER: ProviderName[] = ['claude-cli', 'anthropic', 'openai'];

function buildAttemptList(primary: ProviderName): ProviderName[] {
  const rest = FALLBACK_ORDER.filter((p) => p !== primary);
  return [primary, ...rest];
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
  ): { model: string; provider: ProviderName } {
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

type ResolvedLLMOptions = LLMCallOptions & { model: string; provider: ProviderName };

interface ModelDefaults {
  'claude-cli': string;
  anthropic: string;
  openai: string;
}

const FALLBACK_MODELS: ModelDefaults = {
  'claude-cli': 'claude-sonnet-4-6',
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
};

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
    const primary = options.provider ?? routed.provider;
    const order = buildAttemptList(primary);

    const attempted: ProviderName[] = [];
    let lastErr: unknown;

    for (const provider of order) {
      const model =
        provider === primary ? (options.model ?? routed.model) : FALLBACK_MODELS[provider];
      const resolved: ResolvedLLMOptions = { ...options, model, provider };

      const available = await this.providerAvailable(provider);
      if (!available) continue;

      attempted.push(provider);
      try {
        const result = await this.dispatch(resolved);
        return attempted.length > 1 ? { ...result, attemptedProviders: attempted } : result;
      } catch (err) {
        lastErr = err;
      }
    }

    if (lastErr instanceof Error) {
      throw new LLMError(
        `All LLM providers failed (tried ${attempted.join(', ') || 'none'}): ${lastErr.message}`,
        { retryable: false },
      );
    }
    throw new LLMError(`No LLM provider available (tried ${order.join(', ')})`, {
      retryable: false,
    });
  }

  private async providerAvailable(provider: ProviderName): Promise<boolean> {
    if (provider === 'claude-cli') return (await probeClaudeCLI()).available;
    if (provider === 'anthropic') return this.anthropicKeyPool.hasKeys;
    return this.openaiKeyPool.hasKeys;
  }

  private dispatch(options: ResolvedLLMOptions): Promise<LLMCallResult> {
    if (options.provider === 'claude-cli') return this.callClaudeCLI(options);
    if (options.provider === 'anthropic') return this.callAnthropic(options);
    return this.callOpenAI(options);
  }

  private async callClaudeCLI(options: ResolvedLLMOptions): Promise<LLMCallResult> {
    const probe = await probeClaudeCLI();
    if (!probe.available || !probe.path) {
      throw new LLMError('claude CLI not available', { retryable: false });
    }
    return callClaudeCLI({
      binary: probe.path,
      model: options.model,
      systemPrompt: options.systemPrompt,
      userPrompt: options.userPrompt,
    });
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
        signal: AbortSignal.timeout(60_000),
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
