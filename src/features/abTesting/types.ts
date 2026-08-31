/** Shapes shared across the feature. Nothing here touches the database. */

export type TestStatus = 'draft' | 'running' | 'stopped'

/** What the test swaps out: the whole page, or one section on it. */
export type TestScope = 'page' | 'block'

export type GoalType = 'page-visited' | 'element-clicked' | 'form-submitted' | 'order-placed'

export type VariantSpec = {
  /** Stable within the test. Stored in the visitor cookie and in every event row. */
  key: string
  label: string
  /** Relative share of traffic. Normalised against the other variants at pick time. */
  weight: number
  /** The control renders the original content - no alternative page or template. */
  isControl: boolean
  /** Scope 'page': the page rendered instead of the original. */
  pageId: string | null
  /** Scope 'block': the template whose sections replace the targeted section. */
  templateId: string | null
}

export type GoalSpec = {
  key: string
  label: string
  type: GoalType
  /** page-visited: the path that counts as the conversion. */
  path: string | null
  /** element-clicked: a CSS selector, matched by a delegated listener. */
  selector: string | null
  /** form-submitted: which form, or null for any form on the page. */
  formId: string | null
}

/** One running test, flattened from the collection document. */
export type ActiveTest = {
  id: string
  name: string
  scope: TestScope
  /** The page under test. Every test targets exactly one page. */
  pageId: string | null
  /** Denormalised at save time so the edge can match a request without a lookup. */
  targetPath: string
  /** Scope 'block': the id of the section being replaced. */
  blockId: string | null
  variants: VariantSpec[]
  goals: GoalSpec[]
}

/**
 * What the signed cookie carries.
 *
 * `a` is kept even when a test's weights later change: a visitor who has been
 * counted under one variant must keep seeing it, or the two arms stop being
 * comparable. `c` is a dedupe set, so one person converting twice on the same
 * goal is still one conversion.
 */
export type VisitorState = {
  v: 1
  /** Random, opaque, ours. Not linked to any account. */
  id: string
  /** testId -> variant key. */
  a: Record<string, string>
  /** `${testId}:${goalKey}` -> 1. */
  c: Record<string, 1>
}

/** The per-request answer the render path and the cache key both read. */
export type AbContext = {
  enabled: boolean
  visitor: VisitorState
  /** Tests targeting the page being rendered. What the render path swaps on. */
  tests: ActiveTest[]
  /**
   * Every running test, not just this page's. A conversion usually happens
   * somewhere other than the page under test - a thank-you page, a checkout -
   * so attribution needs the whole list.
   */
  allTests: ActiveTest[]
  /** testId -> variant key, for every test this visitor has ever been bucketed into. */
  assignments: Record<string, string>
  /** True when the cookie needs writing back (new visitor, or a new assignment). */
  changed: boolean
}

/** One row of the results table. */
export type VariantResult = {
  key: string
  label: string
  isControl: boolean
  visitors: number
  conversions: number
  /** conversions / visitors, or 0 when nobody has arrived yet. */
  rate: number
  /** 95% Wald interval on the rate. Null while the normal approximation is invalid. */
  interval: { low: number; high: number } | null
  /** Relative change against the control. Null for the control itself. */
  lift: number | null
  /** Two-sided p-value against the control. Null when the test cannot be run yet. */
  pValue: number | null
}

export type ReadinessLevel = 'no-data' | 'too-few' | 'inconclusive' | 'significant'

export type GoalResult = {
  key: string
  label: string
  type: GoalType
  variants: VariantResult[]
  readiness: ReadinessLevel
  /** Plain-English statement of what the numbers do and do not yet support. */
  verdict: string
  /** Visitors still needed per arm before the current gap could be called. */
  neededPerArm: number | null
}
