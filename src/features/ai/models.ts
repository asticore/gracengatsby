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

export type AiProvider = keyof typeof AI_MODELS

export const AI_PROVIDERS: readonly AiProvider[] = ['claude', 'openai']

/** Per-request timeout. A slow provider should fail one picture, not hang a batch. */
export const AI_TIMEOUT_MS = 20_000

export const ANTHROPIC_VERSION = '2023-06-01'

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
