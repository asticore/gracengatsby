import { readStats, type StatRow } from './events'
import {
  MIN_VISITORS_PER_ARM,
  proportionZ,
  sampleNeededPerArm,
  twoSidedP,
  wilsonInterval,
} from './stats'
import type { ActiveTest, GoalResult, ReadinessLevel, VariantResult } from './types'

/**
 * Turns the rollup rows into the table the results screen draws.
 *
 * One block per goal, because a variant that wins on clicks and loses on orders
 * is the normal case and a single blended "conversion rate" would hide it.
 */

const rate = (conversions: number, visitors: number): number =>
  visitors > 0 ? conversions / visitors : 0

const verdictFor = (
  readiness: ReadinessLevel,
  best: VariantResult | null,
  neededPerArm: number | null,
): string => {
  switch (readiness) {
    case 'no-data':
      return 'No visitors have been counted for this goal yet.'
    case 'too-few':
      return `Too early to say anything. Every arm needs at least ${MIN_VISITORS_PER_ARM} visitors and a handful of conversions before these percentages mean more than noise.`
    case 'inconclusive':
      return neededPerArm
        ? `No significant difference yet. If the gap on screen is the real one, it would take roughly ${neededPerArm.toLocaleString()} visitors per arm to show up as significant - keep running.`
        : 'No significant difference yet. The arms are performing close enough that the data cannot separate them.'
    case 'significant':
      return best
        ? `${best.label} is ahead by ${((best.lift ?? 0) * 100).toFixed(1)}% and the difference clears the 95% bar (p = ${(best.pValue ?? 0).toFixed(3)}). Worth noting: this test was checked repeatedly rather than at a pre-set sample size, which makes a 95% result somewhat weaker than it sounds. Treat it as a strong signal, not a proof.`
        : 'A difference clears the 95% bar.'
    default:
      return ''
  }
}

const buildGoal = (
  test: ActiveTest,
  goalKey: string,
  goalLabel: string,
  goalType: GoalResult['type'],
  visitorsBy: Map<string, number>,
  conversionsBy: Map<string, number>,
): GoalResult => {
  const control =
    test.variants.find((variant) => variant.isControl)?.key ?? test.variants[0]?.key ?? ''

  const controlVisitors = visitorsBy.get(control) ?? 0
  const controlConversions = conversionsBy.get(control) ?? 0
  const controlRate = rate(controlConversions, controlVisitors)

  const variants: VariantResult[] = test.variants.map((variant) => {
    const visitors = visitorsBy.get(variant.key) ?? 0
    const conversions = conversionsBy.get(variant.key) ?? 0
    const isControl = variant.key === control
    const observed = rate(conversions, visitors)

    const z = isControl
      ? null
      : proportionZ(controlConversions, controlVisitors, conversions, visitors)

    return {
      key: variant.key,
      label: variant.label,
      isControl,
      visitors,
      conversions,
      rate: observed,
      interval: wilsonInterval(conversions, visitors),
      lift: isControl || controlRate === 0 ? null : (observed - controlRate) / controlRate,
      pValue: z === null ? null : twoSidedP(z),
    }
  })

  const totalVisitors = variants.reduce((sum, variant) => sum + variant.visitors, 0)
  const smallestArm = variants.reduce((min, variant) => Math.min(min, variant.visitors), Infinity)
  const testable = variants.some((variant) => variant.pValue !== null)

  let readiness: ReadinessLevel = 'inconclusive'
  if (totalVisitors === 0) readiness = 'no-data'
  else if (smallestArm < MIN_VISITORS_PER_ARM || !testable) readiness = 'too-few'

  const challengers = variants.filter((variant) => !variant.isControl && variant.pValue !== null)
  const best = challengers.reduce<VariantResult | null>(
    (found, variant) => (found === null || (variant.pValue ?? 1) < (found.pValue ?? 1) ? variant : found),
    null,
  )

  if (readiness === 'inconclusive' && best && (best.pValue ?? 1) < 0.05) readiness = 'significant'

  const neededPerArm =
    readiness === 'inconclusive' && best ? sampleNeededPerArm(controlRate, best.rate) : null

  return {
    key: goalKey,
    label: goalLabel,
    type: goalType,
    variants,
    readiness,
    verdict: verdictFor(readiness, readiness === 'significant' ? best : null, neededPerArm),
    neededPerArm,
  }
}

/** The whole results table for one test, built from a single indexed read. */
export const buildResults = (test: ActiveTest, rows: StatRow[]): GoalResult[] => {
  // The impression rows carry goal_key '' - they are the denominator every
  // goal shares, because a visitor counts once per test however many goals it
  // has.
  const visitorsBy = new Map<string, number>()
  for (const row of rows) {
    if (row.goal_key !== '') continue
    visitorsBy.set(row.variant_key, (visitorsBy.get(row.variant_key) ?? 0) + Number(row.visitors ?? 0))
  }

  return test.goals.map((goal) => {
    const conversionsBy = new Map<string, number>()
    for (const row of rows) {
      if (row.goal_key !== goal.key) continue
      conversionsBy.set(
        row.variant_key,
        (conversionsBy.get(row.variant_key) ?? 0) + Number(row.conversions ?? 0),
      )
    }
    return buildGoal(test, goal.key, goal.label, goal.type, visitorsBy, conversionsBy)
  })
}

export const resultsForTest = async (test: ActiveTest): Promise<GoalResult[]> =>
  buildResults(test, await readStats(test.id))

/** Total revenue attributed to each arm, for the order-placed goals. */
export const revenueByVariant = (rows: StatRow[]): Map<string, number> => {
  const totals = new Map<string, number>()
  for (const row of rows) {
    if (row.goal_key === '') continue
    totals.set(row.variant_key, (totals.get(row.variant_key) ?? 0) + Number(row.value_total ?? 0))
  }
  return totals
}
