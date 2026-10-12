import type { GoalResult } from './types'

/**
 * One line per goal for the Results tab on the A/B tests list: who is ahead,
 * by how much, and whether the numbers support calling it. Pure, so the list
 * screen and the tests share it.
 */
export type GoalSummary = {
  goal: string
  /** Label of the leading variant when the result is significant, otherwise null. */
  winner: string | null
  /** Relative change of the winner against the control (0.12 = 12% better), or of the best arm when there is no winner yet. */
  uplift: number | null
  /** Label of the arm the uplift belongs to. */
  leader: string | null
  readiness: GoalResult['readiness']
  visitors: number
}

export function summariseGoal(goal: GoalResult): GoalSummary {
  const visitors = goal.variants.reduce((total, variant) => total + variant.visitors, 0)
  const challengers = goal.variants.filter((variant) => !variant.isControl && variant.lift !== null)
  const best = challengers.reduce<(typeof challengers)[number] | null>(
    (top, variant) => (top === null || (variant.lift as number) > (top.lift as number) ? variant : top),
    null,
  )

  if (goal.readiness === 'significant') {
    if (best !== null && (best.lift as number) > 0) {
      return { goal: goal.label, winner: best.label, uplift: best.lift, leader: best.label, readiness: goal.readiness, visitors }
    }
    // Significant, but no challenger beat the control: the control is the winner.
    const control = goal.variants.find((variant) => variant.isControl)
    return {
      goal: goal.label,
      winner: control?.label ?? null,
      uplift: best?.lift ?? null,
      leader: control?.label ?? null,
      readiness: goal.readiness,
      visitors,
    }
  }

  return {
    goal: goal.label,
    winner: null,
    uplift: best?.lift ?? null,
    leader: best?.label ?? null,
    readiness: goal.readiness,
    visitors,
  }
}

/** "+12.3%" / "-4.0%" / "-" for a relative change. */
export function formatUplift(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}
