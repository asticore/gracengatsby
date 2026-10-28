/**
 * Machine translation providers: Google Cloud Translation (v2), DeepL, and the
 * AI models already used by Build with AI (Claude, OpenAI).
 *
 * Pure fetch, no node-only modules, so it runs on Workers. Each provider is a
 * small request builder plus a response parser; the network call is injected
 * (`fetch`) so every shape can be tested with a mocked response.
 *
 * Keys are passed in by the caller and go only into request headers. Errors carry
 * a code and a message built from the HTTP status, never the URL, the key or the
 * provider's response body, so nothing secret can reach a log or the admin screen.
 */

import { AI_MODELS, AI_TIMEOUT_MS, type AiProvider } from '@/features/ai/models'
import { callAiDetailed, AiError } from '@/features/ai/client'

export const MACHINE_PROVIDER_IDS = ['google', 'deepl', 'claude', 'openai'] as const
export type MachineProviderId = (typeof MACHINE_PROVIDER_IDS)[number]

export const MACHINE_PROVIDER_LABELS: Record<MachineProviderId, string> = {
  google: 'Google Cloud Translation',
  deepl: 'DeepL',
  claude: 'AI: Claude',
  openai: 'AI: OpenAI',
}

export const isMachineProviderId = (value: unknown): value is MachineProviderId =>
  typeof value === 'string' && (MACHINE_PROVIDER_IDS as readonly string[]).includes(value)

export type MachineErrorCode =
  | 'no_key'
  | 'auth'
  | 'quota'
  | 'rate'
  | 'bad_request'
  | 'unavailable'
  | 'bad_response'
  | 'timeout'
  | 'network'

export class MachineError extends Error {
  readonly code: MachineErrorCode
  constructor(code: MachineErrorCode, message: string) {
    super(message)
    this.name = 'MachineError'
    this.code = code
  }
}

export type MachineRequest = {
  texts: string[]
  /** BCP 47 tag of the source language, e.g. "en" or "en-GB". */
  source: string
  /** BCP 47 tag of the target language, e.g. "fr" or "pt-BR". */
  target: string
}

export type MachineCredentials = {
  apiKey: string
  /** DeepL only: 'free' or 'pro' or 'auto' (a key ending ":fx" is a free key). */
  deeplPlan?: string | null
}

export type MachineDeps = {
  fetch?: typeof fetch
  timeoutMs?: number
}

/** Batch sizes per provider call. Each provider has its own limits; these stay under them. */
export const GOOGLE_BATCH = 50
export const DEEPL_BATCH = 50
export const AI_BATCH = 20

export const GOOGLE_URL = 'https://translation.googleapis.com/language/translate/v2'
export const DEEPL_FREE_URL = 'https://api-free.deepl.com/v2/translate'
export const DEEPL_PRO_URL = 'https://api.deepl.com/v2/translate'

/** The primary subtag, lower case: "pt-BR" -> "pt". */
export const primaryLanguage = (tag: string): string => tag.trim().split(/[-_]/)[0].toLowerCase()

/**
 * DeepL target codes. Its target list is stricter than its source list: English and
 * Portuguese need a regional variant, and Chinese needs the bare code.
 */
export function deeplTarget(tag: string): string {
  const normalised = tag.trim().replace('_', '-')
  const base = primaryLanguage(normalised)
  if (base === 'en') return normalised.toLowerCase() === 'en-gb' ? 'EN-GB' : 'EN-US'
  if (base === 'pt') return normalised.toLowerCase() === 'pt-pt' ? 'PT-PT' : 'PT-BR'
  return base.toUpperCase()
}

export function deeplSource(tag: string): string {
  return primaryLanguage(tag).toUpperCase()
}

/** Which DeepL endpoint to use. A free key ends in ":fx" and only works on the free host. */
export function deeplUrl(credentials: MachineCredentials): string {
  const plan = credentials.deeplPlan === 'free' || credentials.deeplPlan === 'pro' ? credentials.deeplPlan : 'auto'
  if (plan === 'free') return DEEPL_FREE_URL
  if (plan === 'pro') return DEEPL_PRO_URL
  return credentials.apiKey.trim().endsWith(':fx') ? DEEPL_FREE_URL : DEEPL_PRO_URL
}

const chunks = <T,>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** Maps an HTTP status to a code and an admin-safe message. The provider name is fixed text. */
export function errorForStatus(provider: MachineProviderId, status: number): MachineError {
  const name = MACHINE_PROVIDER_LABELS[provider]
  if (provider === 'deepl' && status === 456) return new MachineError('quota', `${name} character quota is used up for this key.`)
  if (status === 401 || status === 403) return new MachineError('auth', `${name} rejected the API key. Check it in Integrations.`)
  if (status === 429) return new MachineError('rate', `${name} rate limit reached. Wait a minute and try again.`)
  if (status === 400 || status === 413) return new MachineError('bad_request', `${name} could not translate this text.`)
  if (status >= 500) return new MachineError('unavailable', `${name} is unavailable right now. Try again shortly.`)
  return new MachineError('unavailable', `${name} returned an unexpected error (${status}).`)
}

async function postJson(
  provider: MachineProviderId,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  deps: MachineDeps,
): Promise<unknown> {
  const fetchImpl = deps.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? AI_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!response.ok) throw errorForStatus(provider, response.status)
    return await response.json().catch((): null => null)
  } catch (error) {
    if (error instanceof MachineError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new MachineError('timeout', `${MACHINE_PROVIDER_LABELS[provider]} did not answer in time.`)
    }
    throw new MachineError('network', `${MACHINE_PROVIDER_LABELS[provider]} could not be reached.`)
  } finally {
    clearTimeout(timer)
  }
}

// --- Google Cloud Translation v2 --------------------------------------------

/** Request body for Google's v2 translate endpoint. Pure. */
export function buildGoogleBody(texts: string[], source: string, target: string): Record<string, unknown> {
  return { q: texts, source: primaryLanguage(source), target: primaryLanguage(target), format: 'text' }
}

/** Pulls translatedText out of Google's reply. Throws bad_response when the count is wrong. */
export function parseGoogleResponse(body: unknown, expected: number): string[] {
  const list = (body as { data?: { translations?: Array<{ translatedText?: unknown }> } } | null)?.data?.translations
  if (!Array.isArray(list)) throw new MachineError('bad_response', 'Google sent back an unexpected reply.')
  const out = list.map((entry) => (typeof entry?.translatedText === 'string' ? entry.translatedText : null))
  if (out.length !== expected || out.some((text) => text === null)) {
    throw new MachineError('bad_response', 'Google sent back an unexpected reply.')
  }
  return out as string[]
}

async function translateGoogle(request: MachineRequest, credentials: MachineCredentials, deps: MachineDeps): Promise<string[]> {
  const results: string[] = []
  for (const batch of chunks(request.texts, GOOGLE_BATCH)) {
    const body = await postJson(
      'google',
      GOOGLE_URL,
      { 'x-goog-api-key': credentials.apiKey },
      buildGoogleBody(batch, request.source, request.target),
      deps,
    )
    results.push(...parseGoogleResponse(body, batch.length))
  }
  return results
}

// --- DeepL -------------------------------------------------------------------

/** Request body for DeepL's translate endpoint. Pure. */
export function buildDeeplBody(texts: string[], source: string, target: string): Record<string, unknown> {
  return { text: texts, source_lang: deeplSource(source), target_lang: deeplTarget(target) }
}

/** Pulls the translated texts out of DeepL's reply. */
export function parseDeeplResponse(body: unknown, expected: number): string[] {
  const list = (body as { translations?: Array<{ text?: unknown }> } | null)?.translations
  if (!Array.isArray(list)) throw new MachineError('bad_response', 'DeepL sent back an unexpected reply.')
  const out = list.map((entry) => (typeof entry?.text === 'string' ? entry.text : null))
  if (out.length !== expected || out.some((text) => text === null)) {
    throw new MachineError('bad_response', 'DeepL sent back an unexpected reply.')
  }
  return out as string[]
}

async function translateDeepl(request: MachineRequest, credentials: MachineCredentials, deps: MachineDeps): Promise<string[]> {
  const url = deeplUrl(credentials)
  const results: string[] = []
  for (const batch of chunks(request.texts, DEEPL_BATCH)) {
    const body = await postJson(
      'deepl',
      url,
      { authorization: `DeepL-Auth-Key ${credentials.apiKey}` },
      buildDeeplBody(batch, request.source, request.target),
      deps,
    )
    results.push(...parseDeeplResponse(body, batch.length))
  }
  return results
}

// --- AI (Claude / OpenAI, the same clients Build with AI uses) ---------------

export const AI_TRANSLATE_SYSTEM = (source: string, target: string): string =>
  `You translate website copy from ${source} to ${target}. Keep HTML tags, placeholders in braces, numbers, email addresses and URLs exactly as they are. ` +
  'You receive a JSON array of strings. Reply with only a JSON array of the same length, with one translation per input string, in the same order. No commentary.'

/** Parses the model's reply as a JSON array of strings of the expected length. Tolerates a code fence. */
export function parseAiArray(text: string, expected: number): string[] {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    throw new MachineError('bad_response', 'The AI model sent back an unexpected reply.')
  }
  if (!Array.isArray(parsed) || parsed.length !== expected || !parsed.every((item) => typeof item === 'string')) {
    throw new MachineError('bad_response', 'The AI model sent back an unexpected reply.')
  }
  return parsed as string[]
}

async function translateAi(
  provider: 'claude' | 'openai',
  request: MachineRequest,
  credentials: MachineCredentials,
  deps: MachineDeps,
): Promise<string[]> {
  const results: string[] = []
  for (const batch of chunks(request.texts, AI_BATCH)) {
    try {
      const { text } = await callAiDetailed(
        {
          provider: provider as AiProvider,
          system: AI_TRANSLATE_SYSTEM(primaryLanguage(request.source), primaryLanguage(request.target)),
          prompt: JSON.stringify(batch),
          maxTokens: Math.min(4000, 400 + batch.reduce((n, s) => n + s.length, 0)),
          temperature: 0,
          model: AI_MODELS[provider as AiProvider],
        },
        { apiKey: credentials.apiKey, fetch: deps.fetch, timeoutMs: deps.timeoutMs },
      )
      results.push(...parseAiArray(text, batch.length))
    } catch (error) {
      if (error instanceof MachineError) throw error
      if (error instanceof AiError) {
        const status = error.status
        if (status === null) throw new MachineError('network', error.message)
        throw errorForStatus(provider, status)
      }
      throw error
    }
  }
  return results
}

/**
 * Translates a list of strings with one provider. Order is preserved. Throws
 * MachineError for every failure, with a code the caller can act on.
 */
export async function translateWithProvider(
  provider: MachineProviderId,
  request: MachineRequest,
  credentials: MachineCredentials,
  deps: MachineDeps = {},
): Promise<string[]> {
  if (request.texts.length === 0) return []
  if (!credentials.apiKey || !credentials.apiKey.trim()) {
    throw new MachineError('no_key', `No ${MACHINE_PROVIDER_LABELS[provider]} API key is set in Integrations.`)
  }
  const creds = { ...credentials, apiKey: credentials.apiKey.trim() }
  if (provider === 'google') return translateGoogle(request, creds, deps)
  if (provider === 'deepl') return translateDeepl(request, creds, deps)
  return translateAi(provider, request, creds, deps)
}

/** The AI provider behind a machine provider id, or null for the two non-AI providers. */
export const aiProviderOf = (provider: MachineProviderId): 'claude' | 'openai' | null =>
  provider === 'claude' || provider === 'openai' ? provider : null
