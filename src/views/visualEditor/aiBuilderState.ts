import type { SectionNode } from '@/lib/sectionTree'
import { createSseParser, parseBuilderEvent, type SseMessage } from '@/features/ai/streamParse'

/**
 * Pure helpers for the "Build with AI" dock tab: request building, response
 * normalising, outline editing and limits. Kept free of React so they can be
 * unit tested. The server (POST /api/admin-ai-builder) owns the real checks;
 * these only keep the UI inside the same limits and shape the server expects.
 */

export const AI_BUILDER_ENDPOINT = '/api/admin-ai-builder'
export const INTEGRATIONS_HREF = '/admin/globals/integrations'

export const AI_LIMITS = {
  brief: 4000,
  example: 2000,
  examples: 3,
  answer: 1000,
  outlineItems: 20,
  outlineTitle: 120,
  outlineSummary: 600,
} as const

export type AiProvider = 'claude' | 'openai'
export type AiMode = 'section' | 'page' | 'edit'
export type AiProviders = Record<AiProvider, boolean>
export type AiAnswer = { q: string; a: string }
export type AiOutlineItem = { title: string; summary: string }

export const AI_PROVIDER_ORDER: readonly AiProvider[] = ['claude', 'openai']
export const AI_PROVIDER_LABELS: Record<AiProvider, string> = { claude: 'Claude', openai: 'OpenAI' }

export const AI_QUICK_STARTS: readonly string[] = [
  'Hero with headline, short text and two buttons',
  '3-column feature cards with icons',
  'FAQ accordion with 6 questions',
]

export class AiBuilderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiBuilderError'
  }
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null

/** Removes every `_id` key (editor-only ids) from a value, recursively. */
export function stripIdKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripIdKeys)
  const record = asRecord(value)
  if (!record) return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(record)) {
    if (key === '_id') continue
    out[key] = stripIdKeys(child)
  }
  return out
}

/** Every node in a section subtree (the section itself, its columns' blocks, and nested sections). */
export function collectSubtree(section: SectionNode): SectionNode[] {
  const out: SectionNode[] = [section]
  for (const column of section.columns ?? []) {
    for (const child of column.blocks ?? []) out.push(...collectSubtree(child as SectionNode))
  }
  return out
}

/** Returns an error message, or null when the brief can be sent. */
export function validateBrief(brief: string): string | null {
  if (!brief.trim()) return 'Describe what you want first.'
  if (brief.length > AI_LIMITS.brief) return `Keep the brief under ${AI_LIMITS.brief} characters.`
  return null
}

/** Non-empty trimmed examples, at most AI_LIMITS.examples of them. */
export function cleanExamples(examples: readonly string[]): string[] {
  return examples
    .map((example) => example.trim())
    .filter((example) => example.length > 0)
    .slice(0, AI_LIMITS.examples)
}

/** Which providers the server reports as connected, in display order. */
export function connectedProviders(providers: AiProviders | null | undefined): AiProvider[] {
  if (!providers) return []
  return AI_PROVIDER_ORDER.filter((provider) => providers[provider] === true)
}

/** The provider to show: the chosen one when still connected, else the first connected one. */
export function pickProvider(chosen: AiProvider, connected: readonly AiProvider[]): AiProvider | null {
  if (connected.includes(chosen)) return chosen
  return connected[0] ?? null
}

/** The "edit selected section" mode only makes sense with a top-level section selected. */
export function effectiveMode(mode: AiMode, hasSelection: boolean): AiMode {
  return mode === 'edit' && !hasSelection ? 'section' : mode
}

export type AiRequestInput = {
  provider: AiProvider
  mode: AiMode
  brief: string
  examples?: readonly string[]
  answers?: readonly AiAnswer[]
  outline?: readonly AiOutlineItem[]
  selection?: unknown
  pageTitle?: string
  history?: readonly AiHistoryEntry[]
  /** The last built sections, sent when refining. */
  current?: readonly SectionNode[]
}

export type AiHistoryEntry = { role: 'user' | 'assistant'; text: string }

export type AiBuilderRequest = {
  action: 'plan' | 'build'
  provider: AiProvider
  mode: AiMode
  brief: string
  examples?: string[]
  answers?: AiAnswer[]
  outline?: AiOutlineItem[]
  selection?: unknown
  pageTitle?: string
  history?: AiHistoryEntry[]
  current?: unknown
}

export const AI_HISTORY_MAX = 6
export const AI_HISTORY_TEXT_MAX = 1000

/** Keeps the newest AI_HISTORY_MAX valid entries; trims text and drops empty or malformed ones. */
export function trimHistory(entries: readonly unknown[] | null | undefined, max: number = AI_HISTORY_MAX): AiHistoryEntry[] {
  const out: AiHistoryEntry[] = []
  for (const entry of entries ?? []) {
    const record = asRecord(entry)
    if (!record || (record.role !== 'user' && record.role !== 'assistant')) continue
    const text = cleanText(record.text, AI_HISTORY_TEXT_MAX)
    if (text) out.push({ role: record.role, text })
  }
  return max > 0 ? out.slice(-max) : []
}

/** Builds the JSON body for a plan or build call. Empty optional fields are left out. */
export function buildAiRequest(action: 'plan' | 'build', input: AiRequestInput): AiBuilderRequest {
  const body: AiBuilderRequest = {
    action,
    provider: input.provider,
    mode: input.mode,
    brief: input.brief.trim(),
  }
  const examples = cleanExamples(input.examples ?? [])
  if (examples.length) body.examples = examples

  const answers = (input.answers ?? [])
    .map((pair) => ({ q: pair.q.trim(), a: pair.a.trim() }))
    .filter((pair) => pair.q.length > 0 && pair.a.length > 0)
  if (answers.length) body.answers = answers

  if (action === 'build' && input.outline && input.outline.length) {
    body.outline = input.outline.map((item) => ({ title: item.title.trim(), summary: item.summary.trim() }))
  }
  const history = trimHistory(input.history)
  if (history.length) body.history = history
  if (input.current && input.current.length) body.current = stripIdKeys(input.current)
  if (input.mode === 'edit' && input.selection !== undefined) body.selection = stripIdKeys(input.selection)
  const pageTitle = input.pageTitle?.trim()
  if (pageTitle) body.pageTitle = pageTitle
  return body
}

const failureText = (data: unknown, status?: number): string => {
  const error = asRecord(data)?.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  return status ? `The AI request failed (HTTP ${status}).` : 'The AI request failed.'
}

/** Reads { providers } from GET. Returns null when the shape is wrong. */
export function normaliseProviders(data: unknown): AiProviders | null {
  const providers = asRecord(asRecord(data)?.providers)
  if (!providers) return null
  return { claude: providers.claude === true, openai: providers.openai === true }
}

const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

/** Keeps only items with a title; trims and caps the text. */
export function normaliseOutline(raw: readonly unknown[]): AiOutlineItem[] {
  const items: AiOutlineItem[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) continue
    const title = cleanText(record.title, AI_LIMITS.outlineTitle)
    if (!title) continue
    items.push({ title, summary: cleanText(record.summary, AI_LIMITS.outlineSummary) })
    if (items.length >= AI_LIMITS.outlineItems) break
  }
  return items
}

export type AiPlanResult = { kind: 'questions'; questions: string[] } | { kind: 'outline'; outline: AiOutlineItem[] }

/** Throws AiBuilderError for ok:false, empty or unknown plan responses. */
export function normalisePlan(data: unknown, status?: number): AiPlanResult {
  const record = asRecord(data)
  if (!record || record.ok !== true) throw new AiBuilderError(failureText(data, status))
  if (Array.isArray(record.outline)) {
    const outline = normaliseOutline(record.outline)
    if (outline.length) return { kind: 'outline', outline }
    throw new AiBuilderError('The AI returned an empty outline. Try again with a more specific brief.')
  }
  if (Array.isArray(record.questions)) {
    const questions = record.questions
      .map((question) => cleanText(question, AI_LIMITS.answer * 2))
      .filter((question) => question.length > 0)
    if (questions.length) return { kind: 'questions', questions }
  }
  throw new AiBuilderError('The AI did not return a plan. Try again.')
}

export type AiMediaPlaceholder = { alt: string; query: string }
export type AiBuildResult = { sections: SectionNode[]; warnings: string[]; mediaPlaceholders: AiMediaPlaceholder[] }

/** Defensive read of the optional mediaPlaceholders list. */
export function normaliseMediaPlaceholders(raw: unknown): AiMediaPlaceholder[] {
  if (!Array.isArray(raw)) return []
  const out: AiMediaPlaceholder[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) continue
    const alt = cleanText(record.alt, 200)
    const query = cleanText(record.query, 200)
    if (!alt && !query) continue
    out.push({ alt: alt || query, query })
    if (out.length >= 20) break
  }
  return out
}

/** Throws AiBuilderError for ok:false or when no usable section comes back. */
export function normaliseBuild(data: unknown, status?: number): AiBuildResult {
  const record = asRecord(data)
  if (!record || record.ok !== true) throw new AiBuilderError(failureText(data, status))
  const sections = (Array.isArray(record.sections) ? record.sections : []).filter(
    (node): node is SectionNode => typeof asRecord(node)?.blockType === 'string',
  )
  if (!sections.length) throw new AiBuilderError('The AI did not return any sections. Try again or change the brief.')
  const warnings = (Array.isArray(record.warnings) ? record.warnings : []).filter(
    (warning): warning is string => typeof warning === 'string' && warning.trim().length > 0,
  )
  return { sections, warnings, mediaPlaceholders: normaliseMediaPlaceholders(record.mediaPlaceholders) }
}

export type AiUsage = { calls: number; inputTokens: number; outputTokens: number; estCostUsd: number; capUsd: number }

/** Reads the optional usage object. Returns null when absent or malformed. */
export function normaliseUsage(data: unknown): AiUsage | null {
  const record = asRecord(asRecord(data)?.usage)
  if (!record) return null
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  return {
    calls: Math.floor(num(record.calls)),
    inputTokens: num(record.inputTokens),
    outputTokens: num(record.outputTokens),
    estCostUsd: num(record.estCostUsd),
    capUsd: num(record.capUsd),
  }
}

const money = (value: number): string => (value >= 100 ? value.toFixed(0) : value.toFixed(2))

/** "This month: 12 builds, ~$1.20 of $10.00" (cap part left out when there is no cap). */
export function usageText(usage: AiUsage | null | undefined): string {
  if (!usage) return ''
  const builds = `${usage.calls} ${usage.calls === 1 ? 'build' : 'builds'}`
  const cost = `~$${money(usage.estCostUsd)}`
  return usage.capUsd > 0 ? `This month: ${builds}, ${cost} of $${money(usage.capUsd)}` : `This month: ${builds}, ${cost}`
}

/** A warning once spend reaches 80% of the cap; a stronger one at or over the cap. Empty string otherwise. */
export function usageWarning(usage: AiUsage | null | undefined): string {
  if (!usage || usage.capUsd <= 0) return ''
  if (usage.estCostUsd >= usage.capUsd) return 'You have reached the monthly AI budget. Builds may be refused until it resets or the cap is raised.'
  if (usage.estCostUsd >= usage.capUsd * 0.8) return 'You are close to the monthly AI budget.'
  return ''
}

export type AiStage = 'Planning' | 'Building' | 'Checking'
export const AI_CHECKING_AFTER_SECONDS = 20

/** The server does not stream, so Checking is shown for the tail of a long build. */
export function stageLabel(action: 'plan' | 'build', elapsedSeconds: number): AiStage {
  if (action === 'plan') return 'Planning'
  return elapsedSeconds >= AI_CHECKING_AFTER_SECONDS ? 'Checking' : 'Building'
}

export function progressText(action: 'plan' | 'build', elapsedSeconds: number): string {
  return `${stageLabel(action, elapsedSeconds)}... ${Math.max(0, Math.floor(elapsedSeconds))}s`
}

export type SavedPrompt = { id: string; name: string; brief: string }
export const SAVED_PROMPTS_KEY = 've-ai-saved-prompts'
export const SAVED_PROMPTS_MAX = 20

/** Cleans a parsed list: valid entries only, unique ids, newest first, capped. */
export function sanitiseSavedPrompts(raw: unknown): SavedPrompt[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: SavedPrompt[] = []
  for (const entry of raw) {
    const record = asRecord(entry)
    if (!record) continue
    const id = typeof record.id === 'string' ? record.id : ''
    const name = cleanText(record.name, 60)
    const brief = cleanText(record.brief, AI_LIMITS.brief)
    if (!id || !name || !brief || seen.has(id)) continue
    seen.add(id)
    out.push({ id, name, brief })
    if (out.length >= SAVED_PROMPTS_MAX) break
  }
  return out
}

/** Adds (or replaces the same-named) prompt at the front; oldest drop off past the cap. Returns the list unchanged when name or brief is empty. */
export function addSavedPrompt(list: readonly SavedPrompt[], name: string, brief: string, id: string): SavedPrompt[] {
  const cleanName = name.trim().slice(0, 60)
  const cleanBrief = brief.trim().slice(0, AI_LIMITS.brief)
  if (!cleanName || !cleanBrief) return [...list]
  const rest = list.filter((item) => item.name.toLowerCase() !== cleanName.toLowerCase())
  return [{ id, name: cleanName, brief: cleanBrief }, ...rest].slice(0, SAVED_PROMPTS_MAX)
}

export function deleteSavedPrompt(list: readonly SavedPrompt[], id: string): SavedPrompt[] {
  return list.filter((item) => item.id !== id)
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>
const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

export function loadSavedPrompts(storage: StorageLike | null = defaultStorage()): SavedPrompt[] {
  try {
    const text = storage?.getItem(SAVED_PROMPTS_KEY)
    return text ? sanitiseSavedPrompts(JSON.parse(text)) : []
  } catch {
    return []
  }
}

/** Returns false when the browser refused the write. */
export function storeSavedPrompts(list: readonly SavedPrompt[], storage: StorageLike | null = defaultStorage()): boolean {
  try {
    if (!storage) return false
    storage.setItem(SAVED_PROMPTS_KEY, JSON.stringify(sanitiseSavedPrompts(list)))
    return true
  } catch {
    return false
  }
}

/** Turns a saved template's blocks into example text: id-free JSON cut to the example size cap. */
export function templateExampleText(name: string, blocks: unknown): string {
  const nodes = Array.isArray(blocks) ? blocks : []
  if (!nodes.length) return ''
  const head = `Template "${name.trim().slice(0, 60)}": `
  const json = JSON.stringify(stripIdKeys(nodes)) ?? ''
  return (head + json).slice(0, AI_LIMITS.example)
}

export type AiTemplateExample = { id: string; name: string; text: string }

/** Reads /api/page-templates docs into example choices; section templates first, empty ones dropped. */
export function normaliseTemplateExamples(data: unknown): AiTemplateExample[] {
  const docs = asRecord(data)?.docs
  if (!Array.isArray(docs)) return []
  const sections: AiTemplateExample[] = []
  const others: AiTemplateExample[] = []
  for (const doc of docs) {
    const record = asRecord(doc)
    if (!record) continue
    const name = cleanText(record.name, 60) || 'Untitled'
    const text = templateExampleText(name, record.blocks)
    if (!text) continue
    const item = { id: String(record.id ?? name), name, text }
    ;(record.kind === 'section' ? sections : others).push(item)
  }
  return [...sections, ...others]
}

/** GET /api/page-templates for the example picker. Returns [] on any failure. */
export async function fetchTemplateExamples(signal?: AbortSignal): Promise<AiTemplateExample[]> {
  try {
    const res = await fetch('/api/page-templates?limit=50&depth=0&sort=-updatedAt', { credentials: 'include', signal })
    if (!res.ok) return []
    return normaliseTemplateExamples(await readJsonBody(res))
  } catch {
    return []
  }
}

/** Returns an error message, or null when the outline can be built. */
export function validateOutline(outline: readonly AiOutlineItem[]): string | null {
  if (outline.length === 0) return 'Add at least one section to the outline.'
  if (outline.some((item) => item.title.trim() === '')) return 'Every outline item needs a title.'
  return null
}

export function moveOutlineItem(list: readonly AiOutlineItem[], index: number, delta: -1 | 1): AiOutlineItem[] {
  const target = index + delta
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return [...list]
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item)
  return next
}

export function updateOutlineItem(list: readonly AiOutlineItem[], index: number, patch: Partial<AiOutlineItem>): AiOutlineItem[] {
  return list.map((item, i) => (i === index ? { ...item, ...patch } : item))
}

export function removeOutlineItem(list: readonly AiOutlineItem[], index: number): AiOutlineItem[] {
  return list.filter((_item, i) => i !== index)
}

export function addOutlineItem(list: readonly AiOutlineItem[]): AiOutlineItem[] {
  if (list.length >= AI_LIMITS.outlineItems) return [...list]
  return [...list, { title: '', summary: '' }]
}

async function readJsonBody(res: Response): Promise<unknown> {
  try {
    return (await res.json()) as unknown
  } catch {
    return null
  }
}

/** GET the connected providers. Throws AiBuilderError on failure. */
export async function fetchAiProviders(signal?: AbortSignal): Promise<AiProviders> {
  const res = await fetch(AI_BUILDER_ENDPOINT, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
  const data: unknown = await readJsonBody(res)
  if (!res.ok) throw new AiBuilderError(failureText(data, res.status))
  const providers = normaliseProviders(data)
  if (!providers) throw new AiBuilderError('Unexpected response from the AI builder.')
  return providers
}

/** GET providers plus the optional usage block. */
export async function fetchAiStatus(signal?: AbortSignal): Promise<{ providers: AiProviders; usage: AiUsage | null }> {
  const res = await fetch(AI_BUILDER_ENDPOINT, { method: 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal })
  const data: unknown = await readJsonBody(res)
  if (!res.ok) throw new AiBuilderError(failureText(data, res.status))
  const providers = normaliseProviders(data)
  if (!providers) throw new AiBuilderError('Unexpected response from the AI builder.')
  return { providers, usage: normaliseUsage(data) }
}

/** POST a plan or build call. Returns the parsed body; throws AiBuilderError on failure. */
export async function postAiBuilder(body: AiBuilderRequest, signal?: AbortSignal, onProgress?: (chars: number) => void): Promise<unknown> {
  const res = await fetch(AI_BUILDER_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: onProgress ? 'text/event-stream, application/json' : 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  if (onProgress && res.ok && (res.headers.get('content-type') ?? '').includes('text/event-stream') && res.body) {
    return readBuilderStream(res.body, onProgress)
  }
  const data: unknown = await readJsonBody(res)
  if (!res.ok || !asRecord(data)?.ok) throw new AiBuilderError(failureText(data, res.status))
  return data
}

/** Reads the progress stream. Progress is a character count only; the result is applied from 'done'. */
export async function readBuilderStream(stream: ReadableStream<Uint8Array>, onProgress: (chars: number) => void): Promise<unknown> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = createSseParser()
  let result: unknown = null
  const handle = (messages: SseMessage[]) => {
    for (const message of messages) {
      const event = parseBuilderEvent(message)
      if (!event) continue
      if (event.event === 'delta') onProgress(event.data.chars)
      else if (event.event === 'done') result = event.data
      else if (event.event === 'error') throw new AiBuilderError(event.data.error)
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    handle(parser.feed(decoder.decode(value, { stream: true })))
  }
  handle(parser.flush())
  if (!asRecord(result)?.ok) throw new AiBuilderError('The AI builder stopped before finishing. Try again.')
  return result
}
