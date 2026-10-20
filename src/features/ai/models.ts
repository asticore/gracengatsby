/**
 * The model each provider is asked for. Change a model here and nothing else.
 *
 * Both are small, cheap vision models: alt text is short and runs over a whole
 * library, so speed and cost matter more than depth.
 */
export const AI_MODELS = {
  claude: 'claude-haiku-4-5',
  openai: 'gpt-4o-mini',
} as const

/**
 * The models the Build with AI feature asks for. This is the one place to change
 * them: the builder writes whole sections, so it uses a stronger model than alt text.
 */
export const AI_BUILDER_MODELS = {
  claude: 'claude-sonnet-4-5',
  openai: 'gpt-4o',
} as const

export type AiProvider = keyof typeof AI_MODELS

/**
 * The models an admin may choose for the builder, per provider, with the list price in US dollars
 * per million tokens (input, output). Prices only feed the spend estimate; they are not a bill.
 */
export const AI_BUILDER_MODEL_OPTIONS: Record<AiProvider, ReadonlyArray<{ value: string; label: string; inPerM: number; outPerM: number }>> = {
  claude: [
    { value: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', inPerM: 3, outPerM: 15 },
    { value: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (cheaper)', inPerM: 1, outPerM: 5 },
    { value: 'claude-opus-4-1', label: 'Claude Opus 4.1 (strongest)', inPerM: 15, outPerM: 75 },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o', inPerM: 2.5, outPerM: 10 },
    { value: 'gpt-4o-mini', label: 'GPT-4o mini (cheaper)', inPerM: 0.15, outPerM: 0.6 },
    { value: 'gpt-4.1', label: 'GPT-4.1', inPerM: 2, outPerM: 8 },
  ],
}

/** True when `model` is on the builder allowlist for the provider. */
export function isAllowedBuilderModel(provider: AiProvider, model: unknown): model is string {
  return typeof model === 'string' && AI_BUILDER_MODEL_OPTIONS[provider].some((option) => option.value === model)
}

/** The model to use: the requested one, else the configured one, else the default; always on the allowlist. */
export function resolveBuilderModel(provider: AiProvider, ...candidates: unknown[]): string {
  for (const candidate of candidates) if (isAllowedBuilderModel(provider, candidate)) return candidate
  return AI_BUILDER_MODELS[provider]
}

/** Estimated cost in millionths of a US dollar. Unknown models use the dearest price on the list. */
export function estimateCostMicro(provider: AiProvider, model: string, inputTokens: number, outputTokens: number): number {
  const options = AI_BUILDER_MODEL_OPTIONS[provider]
  const found = options.find((option) => option.value === model)
  const inPrice = found?.inPerM ?? Math.max(...options.map((o) => o.inPerM))
  const outPrice = found?.outPerM ?? Math.max(...options.map((o) => o.outPerM))
  return Math.round(Math.max(0, inputTokens) * inPrice + Math.max(0, outputTokens) * outPrice)
}

export const AI_PROVIDERS: readonly AiProvider[] = ['claude', 'openai']

/** Per-request timeout. A slow provider should fail one picture, not hang a batch. */
export const AI_TIMEOUT_MS = 20_000

export const ANTHROPIC_VERSION = '2023-06-01'

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
