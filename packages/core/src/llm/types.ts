const REDACTED = '[REDACTED]';

export class SecretString {
  #value: string;

  constructor(value: string) {
    this.#value = value;
  }

  expose(): string {
    return this.#value;
  }

  get isSet(): boolean {
    return this.#value.length > 0;
  }

  toString(): string {
    return REDACTED;
  }
  toJSON(): string {
    return REDACTED;
  }
  [Symbol.toPrimitive](): string {
    return REDACTED;
  }
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return REDACTED;
  }
}

export class LLMError extends Error {
  retryable: boolean;
  statusCode?: number;

  constructor(message: string, options?: { retryable?: boolean; statusCode?: number }) {
    super(message);
    this.name = 'LLMError';
    this.retryable = options?.retryable ?? false;
    this.statusCode = options?.statusCode;
    Object.setPrototypeOf(this, LLMError.prototype);
  }
}

export interface LLMCallOptions {
  provider: 'openai' | 'anthropic';
  model: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  caller: string;
  task?: string;
}

export interface LLMCallResult {
  text: string;
  model: string;
  provider: 'openai' | 'anthropic';
  inputTokens?: number;
  outputTokens?: number;
  durationMs: number;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  name: string;
}

export interface CircuitBreakerSnapshot {
  state: CircuitState;
  failureCount: number;
  lastFailureAt: number | null;
}

export interface KeyPoolConfig {
  keys: string[];
  preemptiveThreshold?: number;
}

export interface KeyStatus {
  index: number;
  circuitState: CircuitBreakerSnapshot;
  remainingQuota: number | null;
}

export interface RouteEntry {
  caller: string;
  task?: string;
  model: string;
  provider: 'openai' | 'anthropic';
}

export interface RoutingConfig {
  routes: RouteEntry[];
  defaultOpenAIModel: string;
  defaultAnthropicModel: string;
}

export interface RateLimitInfo {
  remaining: number | null;
  resetMs: number | null;
  retryAfterMs: number | null;
}

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: number;
  shouldRetry?: (error: unknown) => boolean;
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}
