import type { SectionNode } from '@/lib/sectionTree'

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
}

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

export type AiBuildResult = { sections: SectionNode[]; warnings: string[] }

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
  return { sections, warnings }
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

/** POST a plan or build call. Returns the parsed body; throws AiBuilderError on failure. */
export async function postAiBuilder(body: AiBuilderRequest, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(AI_BUILDER_ENDPOINT, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
  const data: unknown = await readJsonBody(res)
  if (!res.ok || !asRecord(data)?.ok) throw new AiBuilderError(failureText(data, res.status))
  return data
}
