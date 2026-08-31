import { abTestingEnabled, type EngineLike } from './settings'
import { AB_TESTS_SLUG } from './slugs'
import type { ActiveTest, GoalSpec, GoalType, TestScope, VariantSpec } from './types'

/**
 * The list of currently running tests, cached in the isolate.
 *
 * Assignment itself never touches the database - that is what the signed
 * cookie buys - but *something* has to know a test exists, and the edge cache
 * key has to know before the page is even built. Reading the collection on
 * every request would put a query in front of every cached page, which is the
 * one thing page caching exists to avoid.
 *
 * So the manifest is read once and reused for MANIFEST_TTL_MS. Test
 * definitions change when a person edits them, which is on the order of once a
 * week; a minute of staleness means a freshly started test takes up to a
 * minute to reach every isolate, and a freshly stopped one keeps serving its
 * variants for up to a minute. Neither corrupts a result: assignments already
 * made are already in cookies, and the events table records the variant that
 * was actually served.
 */

const MANIFEST_TTL_MS = 60_000

type Cached = { at: number; tests: ActiveTest[] }

let cache: Cached | null = null
let inFlight: Promise<ActiveTest[]> | null = null

const idOf = (value: unknown): string | null => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  const id = (value as { id?: string | number }).id
  return id === undefined || id === null ? null : String(id)
}

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const GOAL_TYPES: GoalType[] = ['page-visited', 'element-clicked', 'form-submitted', 'order-placed']

type RawVariant = Record<string, unknown>
type RawGoal = Record<string, unknown>
type RawTest = Record<string, unknown>

const toVariants = (rows: unknown): VariantSpec[] => {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row, index) => {
      const raw = row as RawVariant
      const key = text(raw.key) ?? String.fromCharCode(65 + index)
      return {
        key,
        label: text(raw.label) ?? `Variant ${key}`,
        weight: typeof raw.weight === 'number' && Number.isFinite(raw.weight) ? raw.weight : 0,
        isControl: Boolean(raw.isControl),
        pageId: idOf(raw.page),
        templateId: idOf(raw.template),
      }
    })
    .filter((variant) => Boolean(variant.key))
}

const toGoals = (rows: unknown): GoalSpec[] => {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row, index) => {
      const raw = row as RawGoal
      const type = GOAL_TYPES.find((candidate) => candidate === raw.type) ?? 'page-visited'
      const key = text(raw.key) ?? `g${index + 1}`
      return {
        key,
        label: text(raw.label) ?? key,
        type,
        path: text(raw.path),
        selector: text(raw.selector),
        formId: idOf(raw.form),
      }
    })
    .filter((goal) => Boolean(goal.key))
}

/**
 * A test only counts as running when its window is open too. The dates are
 * checked here rather than in the query so a test with no dates set - the
 * common case - needs no date clause at all.
 */
const withinWindow = (raw: RawTest, now: number): boolean => {
  const starts = text(raw.startsAt)
  const ends = text(raw.endsAt)
  if (starts && Date.parse(starts) > now) return false
  if (ends && Date.parse(ends) < now) return false
  return true
}

export const toActiveTest = (raw: RawTest): ActiveTest => ({
  id: String(raw.id),
  name: text(raw.name) ?? 'Untitled test',
  scope: (raw.scope === 'block' ? 'block' : 'page') as TestScope,
  pageId: idOf(raw.page),
  targetPath: text(raw.targetPath) ?? '',
  blockId: text(raw.blockId),
  variants: toVariants(raw.variants),
  goals: toGoals(raw.goals),
})

type FindEngine = EngineLike & {
  find(args: {
    collection: string
    where?: unknown
    depth?: number
    limit?: number
    overrideAccess?: boolean
  }): Promise<{ docs: unknown[] }>
}

const load = async (engine: FindEngine): Promise<ActiveTest[]> => {
  if (!(await abTestingEnabled(engine))) return []

  const { docs } = await engine.find({
    collection: AB_TESTS_SLUG,
    where: { status: { equals: 'running' } },
    // depth 0 keeps the relationships as ids. The runtime only ever compares
    // them, and resolving them would fan one query out into dozens.
    depth: 0,
    limit: 100,
    overrideAccess: true,
  })

  const now = Date.now()
  return docs
    .map((doc) => doc as RawTest)
    .filter((raw) => withinWindow(raw, now))
    .map(toActiveTest)
    // A single-arm test is not a test. Serving it would count impressions
    // against a comparison that can never be made.
    .filter((test) => test.variants.length >= 2)
}

/** Never throws: a failed read degrades to "no tests", which renders the original. */
export const getTestManifest = async (engine: FindEngine): Promise<ActiveTest[]> => {
  const now = Date.now()
  if (cache && now - cache.at < MANIFEST_TTL_MS) return cache.tests
  if (inFlight) return inFlight

  inFlight = load(engine)
    .then((tests) => {
      cache = { at: Date.now(), tests }
      return tests
    })
    .catch((): ActiveTest[] => {
      cache = { at: Date.now(), tests: [] }
      return []
    })
    .finally(() => {
      inFlight = null
    })

  return inFlight
}

/** Called after a test is saved, so an edit is visible immediately. */
export const clearTestManifest = (): void => {
  cache = null
}
