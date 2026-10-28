/**
 * Translation status, approval rules and assignment - the pure part.
 *
 * Nothing in here touches the engine, the database or React, so the same rules
 * run in the collection write hook (the one enforcement point, so every write
 * path is covered), in the bulk admin route, in the overview screen and in the
 * tests. If a rule is changed, it is changed once, here.
 *
 * The four statuses a translation can be in:
 *   missing       - no value (or an empty one). Never stored as a choice; derived.
 *   machine_draft - a provider wrote it; a person still has to check it.
 *   needs_review  - a person wrote or edited it, or the source text has changed
 *                   since it was translated (the snapshot in `sourceText` no
 *                   longer matches). Waiting for a reviewer when review is on.
 *   approved      - checked and signed off. The only status the public site can
 *                   use when `requireReview` is on.
 */

import type { MultilingualSettings } from './settings'

export const TRANSLATION_STATUSES = ['missing', 'machine_draft', 'needs_review', 'approved'] as const
export type TranslationStatus = (typeof TRANSLATION_STATUSES)[number]

/** What a client may ask for. `missing` is a consequence of an empty value, never a choice. */
export const WRITABLE_STATUSES = ['machine_draft', 'needs_review', 'approved'] as const

export const STATUS_LABELS: Record<TranslationStatus, string> = {
  missing: 'Missing',
  machine_draft: 'Machine draft',
  needs_review: 'Needs review',
  approved: 'Approved',
}

/** Worst first. An item's status in a language is the worst of its fields. */
const SEVERITY: Record<TranslationStatus, number> = { missing: 0, needs_review: 1, machine_draft: 2, approved: 3 }

export function parseStatus(value: unknown): TranslationStatus | null {
  return typeof value === 'string' && (TRANSLATION_STATUSES as readonly string[]).includes(value)
    ? (value as TranslationStatus)
    : null
}

export function isWritableStatus(value: unknown): value is (typeof WRITABLE_STATUSES)[number] {
  return typeof value === 'string' && (WRITABLE_STATUSES as readonly string[]).includes(value)
}

/** The fields of a stored row the status rules read. */
export type StatusInput = {
  value?: string | null
  status?: string | null
  /** Snapshot of the source text at the time the translation was saved. */
  sourceText?: string | null
}

/**
 * The status of one translation.
 *
 * `currentSourceText` is what the source reads like now. Pass it whenever it is
 * known: a snapshot that no longer matches it is stale, and stale means
 * needs_review whatever was stored. Omit it and staleness is not checked.
 *
 * A row written before the status column existed has no status. Those were
 * saved by someone who could edit them, so they count as approved; the
 * migration gives existing rows the same value explicitly.
 */
export function computeTranslationStatus(input: StatusInput, currentSourceText?: string): TranslationStatus {
  if (!input.value || input.value.trim().length === 0) return 'missing'

  if (
    currentSourceText !== undefined &&
    input.sourceText !== null &&
    input.sourceText !== undefined &&
    input.sourceText !== currentSourceText
  ) {
    return 'needs_review'
  }

  const stored = parseStatus(input.status) ?? 'approved'
  // A value with a 'missing' status is inconsistent; the safe reading is that it needs a look.
  return stored === 'missing' ? 'needs_review' : stored
}

/**
 * Whether the public site may show this translation.
 *
 * Review off: anything with text in it is shown, including machine drafts - the
 * site owner chose not to have a review step, and that choice is the setting.
 * Review on: only an approved, current translation is shown. The public overlay
 * calls this; the rule lives here so the overlay cannot quietly disagree with
 * the admin screen about what "approved" means.
 */
export function isTranslationPublishable(
  row: StatusInput | null | undefined,
  settings: Pick<MultilingualSettings, 'requireReview'>,
  currentSourceText?: string,
): boolean {
  if (!row) return false
  const status = computeTranslationStatus(row, currentSourceText)
  if (status === 'missing') return false
  if (!settings.requireReview) return true
  return status === 'approved'
}

/** The worst status of a set (an item across its fields, or a language across its items). */
export function worstStatus(statuses: readonly TranslationStatus[]): TranslationStatus {
  if (statuses.length === 0) return 'approved'
  return statuses.reduce((worst, next) => (SEVERITY[next] < SEVERITY[worst] ? next : worst))
}

// --- Assignment -------------------------------------------------------------

export type TranslationRule = { translators: number[]; reviewers: number[] }
export type TranslationRules = Record<string, TranslationRule>

const positiveIds = (value: unknown): number[] => {
  const list: unknown[] = Array.isArray(value) ? value : []
  const ids = list.map((entry) => Number(entry)).filter((id) => Number.isInteger(id) && id > 0)
  return [...new Set(ids)]
}

/**
 * Per-language rules from the stored JSON. Tolerant on purpose: a malformed
 * value reads as "no rules", which means no reviewer is required for that
 * language, so a bad save can never lock every translator out.
 */
export function parseTranslationRules(value: unknown): TranslationRules {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return {}
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

  const rules: TranslationRules = {}
  for (const [locale, entry] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) continue
    const record = (entry ?? {}) as Record<string, unknown>
    rules[locale] = { translators: positiveIds(record.translators), reviewers: positiveIds(record.reviewers) }
  }
  return rules
}

/** Stored as a JSON array of user ids, or null when nobody is assigned. */
export function parseAssignedTo(value: unknown): number[] {
  if (Array.isArray(value)) return positiveIds(value)
  if (typeof value === 'string' && value.trim()) {
    try {
      return positiveIds(JSON.parse(value))
    } catch {
      return []
    }
  }
  return []
}

/** Accepts a list or the JSON text a textarea field sends; stores the JSON text, or null for nobody. */
export function serialiseAssignedTo(ids: unknown): string | null {
  const list = parseAssignedTo(ids)
  return list.length > 0 ? JSON.stringify(list) : null
}

export const reviewersFor = (rules: TranslationRules, locale: string): number[] => rules[locale]?.reviewers ?? []
export const translatorsFor = (rules: TranslationRules, locale: string): number[] => rules[locale]?.translators ?? []

/**
 * Who should be working on one translation right now.
 *
 * An explicit assignment on the row (an item override) wins. Otherwise the
 * language's rules apply: translators while the text is missing or a machine
 * draft, reviewers once it is waiting for review.
 */
export function effectiveAssignees(args: {
  status: TranslationStatus
  assignedTo: unknown
  locale: string
  rules: TranslationRules
}): number[] {
  if (args.status === 'approved') return []
  const override = parseAssignedTo(args.assignedTo)
  if (override.length > 0) return override
  if (args.status === 'needs_review') {
    const reviewers = reviewersFor(args.rules, args.locale)
    if (reviewers.length > 0) return reviewers
  }
  return translatorsFor(args.rules, args.locale)
}

// --- Permissions ------------------------------------------------------------

export type TranslationActor = {
  id: number
  isAdmin: boolean
}

export type GateResult = { ok: true } | { ok: false; reason: string }

/**
 * May this person approve a translation into this language?
 *
 * Review off: yes - approval is the editor's own sign-off, and the collection's
 * own access rules already decided they may write translations at all.
 * Review on: a named reviewer for the language may, and so may an admin unless
 * the site has switched admin bypass off. A locale with no reviewers therefore
 * accepts approval from admins only, which is the safe way round.
 */
export function canApproveTranslation(
  actor: TranslationActor,
  locale: string,
  settings: Pick<MultilingualSettings, 'requireReview' | 'adminsBypassReview' | 'translationRules'>,
): GateResult {
  if (!settings.requireReview) return { ok: true }
  if (actor.isAdmin && settings.adminsBypassReview) return { ok: true }
  if (reviewersFor(settings.translationRules, locale).includes(actor.id)) return { ok: true }
  return { ok: false, reason: `Only a reviewer for ${locale} can approve this translation.` }
}

// --- The write rule ---------------------------------------------------------

export type TranslationWriteCurrent = {
  value?: string | null
  status?: string | null
  sourceText?: string | null
  reviewedBy?: number | null
  reviewedAt?: string | null
  assignedTo?: unknown
}

export type TranslationWriteIncoming = {
  value?: string | null
  sourceText?: string | null
  status?: unknown
  assignedTo?: unknown
  machineProvider?: string | null
}

export type TranslationWriteResult =
  | { ok: true; patch: Record<string, unknown>; status: TranslationStatus }
  | { ok: false; code: 400 | 403; message: string }

const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').trim() === (b ?? '').trim()

/**
 * What a save is allowed to do, and what the row becomes.
 *
 * - Clearing the text makes the row missing again and forgets any approval.
 * - Changing the text makes it needs_review when review is on, and approved when
 *   it is off (the editor's own sign-off, as above). A machine provider writing
 *   the text makes it a machine_draft instead.
 * - Asking for approved is checked against canApproveTranslation. A refused
 *   approval fails the whole save rather than quietly saving the text unapproved,
 *   so the caller can say why.
 * - Asking for approval on an already-approved, unchanged row is a no-op, not a
 *   fresh approval, and is not checked again.
 */
export function evaluateTranslationWrite(args: {
  current: TranslationWriteCurrent | null
  incoming: TranslationWriteIncoming
  locale: string
  actor: TranslationActor
  settings: Pick<MultilingualSettings, 'requireReview' | 'adminsBypassReview' | 'translationRules'>
  now: string
}): TranslationWriteResult {
  const { current, incoming, locale, actor, settings, now } = args
  const patch: Record<string, unknown> = {}

  const previousValue = current?.value ?? ''
  const nextValue = incoming.value !== undefined ? (incoming.value ?? '') : previousValue
  const valueChanged = incoming.value !== undefined && !sameText(nextValue, previousValue)

  if (incoming.status !== undefined && incoming.status !== null && !isWritableStatus(incoming.status)) {
    return { ok: false, code: 400, message: `Status must be one of: ${WRITABLE_STATUSES.join(', ')}.` }
  }
  const requested = isWritableStatus(incoming.status) ? incoming.status : null

  if (incoming.value !== undefined) patch.value = nextValue
  if (incoming.sourceText !== undefined) patch.sourceText = incoming.sourceText
  if (incoming.assignedTo !== undefined) patch.assignedTo = serialiseAssignedTo(incoming.assignedTo)
  if (incoming.machineProvider !== undefined) patch.machineProvider = incoming.machineProvider || null

  if (nextValue.trim().length === 0) {
    patch.status = 'missing'
    patch.reviewedBy = null
    patch.reviewedAt = null
    return { ok: true, patch, status: 'missing' }
  }

  // The source moved since this was last saved, and nobody is approving it
  // now: an approval made against the old source no longer stands.
  const sourceMoved =
    incoming.sourceText !== undefined && current?.sourceText != null && current.sourceText !== incoming.sourceText
  const alreadyApproved = current ? parseStatus(current.status) === 'approved' && !sourceMoved : false
  let status: TranslationStatus = current ? (parseStatus(current.status) ?? 'approved') : 'approved'
  if (status === 'missing') status = 'needs_review'

  if (valueChanged) {
    if (requested === 'machine_draft' || (incoming.machineProvider && requested === null)) {
      status = 'machine_draft'
    } else {
      status = settings.requireReview ? 'needs_review' : 'approved'
    }
  }

  if (!valueChanged && sourceMoved && requested === null && settings.requireReview) {
    status = 'needs_review'
  }

  if (requested !== null && requested !== 'approved') {
    status = requested
  }

  const becomesApproved = requested === 'approved' && (!alreadyApproved || valueChanged)
  if (becomesApproved) {
    const gate = canApproveTranslation(actor, locale, settings)
    if (gate.ok === false) return { ok: false, code: 403, message: gate.reason }
    status = 'approved'
    patch.reviewedBy = actor.id
    patch.reviewedAt = now
  } else if (requested === 'approved') {
    // Already approved and unchanged: a no-op, nothing to check or record.
    status = 'approved'
  } else if (status !== 'approved' || valueChanged) {
    patch.reviewedBy = null
    patch.reviewedAt = null
  }

  patch.status = status
  return { ok: true, patch, status }
}
