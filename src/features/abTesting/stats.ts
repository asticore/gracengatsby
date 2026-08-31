/**
 * The statistics behind the results screen.
 *
 * The job here is not to declare a winner. It is to stop a person acting on
 * twelve visitors, which is the single most common way an A/B test loses money
 * - a 60% conversion rate on 5 of 8 visitors looks like a triumph and means
 * nothing at all. So every number that could be read as a verdict is gated on
 * the sample actually supporting it, and the gate is explicit in the output
 * rather than buried in a footnote.
 *
 * The test used is a two-sided two-proportion z-test against the control, with
 * a Wald interval on each rate. That is the standard fixed-horizon test, and
 * its assumption - that you decided the sample size before looking - is the one
 * nobody keeps. Refreshing a results page and stopping when p first dips under
 * 0.05 inflates the real error rate well past 5%. `verdictFor` says so in
 * words, because a caveat the reader never sees is not a caveat.
 */

/** Abramowitz & Stegun 7.1.26. Accurate to ~1.5e-7, far past what is needed here. */
const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * z)
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-z * z)
  return sign * y
}

/** Two-sided p-value for a z score. */
export const twoSidedP = (z: number): number => {
  if (!Number.isFinite(z)) return 1
  return Math.max(0, Math.min(1, 1 - erf(Math.abs(z) / Math.SQRT2)))
}

/**
 * The pooled two-proportion z-test.
 *
 * Null when it should not be run at all: an empty arm, or a cell so small that
 * the normal approximation is simply wrong. Returning a number there would be
 * worse than returning nothing, because a number gets acted on.
 */
export const proportionZ = (
  conversionsA: number,
  visitorsA: number,
  conversionsB: number,
  visitorsB: number,
): number | null => {
  if (visitorsA < 1 || visitorsB < 1) return null

  const pooled = (conversionsA + conversionsB) / (visitorsA + visitorsB)
  if (pooled <= 0 || pooled >= 1) return null

  // The usual rule of thumb: at least five expected successes and five
  // expected failures in each arm before a normal approximation is honest.
  const expected = [visitorsA * pooled, visitorsA * (1 - pooled), visitorsB * pooled, visitorsB * (1 - pooled)]
  if (expected.some((value) => value < 5)) return null

  const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / visitorsA + 1 / visitorsB))
  if (standardError === 0) return null

  return (conversionsB / visitorsB - conversionsA / visitorsA) / standardError
}

const Z_95 = 1.959964

/** 95% Wald interval, or null while the same small-cell rule says not to draw one. */
export const wilsonInterval = (
  conversions: number,
  visitors: number,
): { low: number; high: number } | null => {
  if (visitors < 30) return null
  const rate = conversions / visitors
  // Wilson rather than plain Wald: at rates near 0 or 1 - which is where
  // conversion rates live - Wald produces intervals that run past 0% or 100%.
  const denominator = 1 + (Z_95 * Z_95) / visitors
  const centre = rate + (Z_95 * Z_95) / (2 * visitors)
  const spread = Z_95 * Math.sqrt((rate * (1 - rate)) / visitors + (Z_95 * Z_95) / (4 * visitors * visitors))
  return {
    low: Math.max(0, (centre - spread) / denominator),
    high: Math.min(1, (centre + spread) / denominator),
  }
}

/**
 * Visitors needed per arm to detect the difference currently on screen, at 95%
 * confidence and 80% power.
 *
 * Shown so "not significant yet" comes with a number rather than a shrug. It is
 * an estimate of the sample the *observed* gap would need; a real gap that is
 * smaller needs more, which is the honest direction to err in.
 */
export const sampleNeededPerArm = (baseRate: number, testRate: number): number | null => {
  const difference = Math.abs(testRate - baseRate)
  if (difference <= 0 || baseRate <= 0 || baseRate >= 1) return null
  const pooled = (baseRate + testRate) / 2
  const n = (2 * pooled * (1 - pooled) * Math.pow(Z_95 + 0.8416, 2)) / (difference * difference)
  return Number.isFinite(n) ? Math.ceil(n) : null
}

/** The smallest arm below which nothing is said at all, however tempting the rate looks. */
export const MIN_VISITORS_PER_ARM = 100
