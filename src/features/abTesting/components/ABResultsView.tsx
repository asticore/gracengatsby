import React from 'react'
import type { AdminViewServerProps, CollectionSlug } from '@/engine'

import { getEngine } from '@/lib/engine'

import { readStats } from '../events'
import { toActiveTest } from '../manifest'
import { buildResults } from '../results'
import { abTestingEnabled } from '../settings'
import { AB_TESTS_SLUG } from '../slugs'
import type { ActiveTest, GoalResult } from '../types'
import { AB_RESULTS_CSS } from './abResults.styles'

/**
 * The results screen.
 *
 * Rendered on the server: the numbers come from the rollup table, which is a
 * handful of rows per test, so there is nothing here worth a client fetch and
 * no reason to hand the browser a database shape it does not need.
 *
 * Stopped and draft tests are shown alongside running ones. A stopped test is
 * exactly when somebody wants to look at its results, and hiding it would make
 * "stop the test" feel like "delete the answer".
 */

const baseClass = 'eg-ab'

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`

const signed = (value: number | null): string =>
  value === null ? '-' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`

const GoalTable: React.FC<{ goal: GoalResult }> = ({ goal }) => (
  <div className={`${baseClass}__goal`}>
    <h3 className={`${baseClass}__goal-name`}>{goal.label}</h3>
    <table className={`${baseClass}__table`}>
      <thead>
        <tr>
          <th>Variant</th>
          <th>Visitors</th>
          <th>Conversions</th>
          <th>Rate</th>
          <th>95% range</th>
          <th>Change</th>
          <th>p</th>
        </tr>
      </thead>
      <tbody>
        {goal.variants.map((variant) => (
          <tr key={variant.key}>
            <td>
              {variant.label}
              {variant.isControl && <span className={`${baseClass}__control`}>control</span>}
            </td>
            <td>{variant.visitors.toLocaleString()}</td>
            <td>{variant.conversions.toLocaleString()}</td>
            <td>{percent(variant.rate)}</td>
            <td className={variant.interval ? undefined : `${baseClass}__dim`}>
              {variant.interval
                ? `${percent(variant.interval.low)} - ${percent(variant.interval.high)}`
                : 'too few'}
            </td>
            <td className={variant.lift === null ? `${baseClass}__dim` : undefined}>
              {variant.isControl ? '-' : signed(variant.lift)}
            </td>
            <td className={variant.pValue === null ? `${baseClass}__dim` : undefined}>
              {variant.pValue === null ? 'n/a' : variant.pValue.toFixed(3)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p className={`${baseClass}__verdict ${baseClass}__verdict--${goal.readiness}`}>{goal.verdict}</p>
  </div>
)

const TestCard: React.FC<{ test: ActiveTest; status: string; goals: GoalResult[] }> = ({
  test,
  status,
  goals,
}) => (
  <section className={`${baseClass}__test`}>
    <header className={`${baseClass}__test-head`}>
      <h2 className={`${baseClass}__test-name`}>{test.name}</h2>
      <span className={`${baseClass}__status`}>{status}</span>
      <span className={`${baseClass}__meta`}>
        {test.targetPath || 'no target path'} - {test.scope === 'block' ? 'one section' : 'whole page'}
      </span>
    </header>
    {goals.length === 0 ? (
      <p className={`${baseClass}__empty`}>This test has no goals yet, so there is nothing to measure.</p>
    ) : (
      goals.map((goal) => <GoalTable key={goal.key} goal={goal} />)
    )}
  </section>
)

export const ABResultsView: React.FC<AdminViewServerProps> = async () => {
  const engine = await getEngine()
  const enabled = await abTestingEnabled(engine)

  const { docs } = await engine
    // The generated slug union does not contain this collection until it is
    // registered in the config and types are regenerated - see the same cast in
    // the Members feature's gate field.
    .find({
      collection: AB_TESTS_SLUG as CollectionSlug,
      depth: 0,
      limit: 100,
      overrideAccess: true,
      sort: '-updatedAt',
    })
    .catch(() => ({ docs: [] as unknown[] }))

  const cards = await Promise.all(
    docs.map(async (doc) => {
      const raw = doc as Record<string, unknown>
      const test = toActiveTest(raw)
      return {
        test,
        status: String(raw.status ?? 'draft'),
        goals: buildResults(test, await readStats(test.id)),
      }
    }),
  )

  return (
    <div className={baseClass}>
      {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
      <style dangerouslySetInnerHTML={{ __html: AB_RESULTS_CSS }} />
      <header>
        <h1 className={`${baseClass}__title`}>A/B test results</h1>
        <p className={`${baseClass}__subtitle`}>
          Visitors are counted once per test, the first time they are put into an arm - so these are
          people, not page views. Percentages before a few hundred visitors per arm are mostly noise;
          the note under each table says whether the numbers support a decision yet.
          {!enabled && ' A/B testing is currently switched off in Site Settings, so nothing new is being recorded.'}
        </p>
      </header>

      {cards.length === 0 ? (
        <p className={`${baseClass}__empty`}>No tests have been created yet.</p>
      ) : (
        cards.map((card) => (
          <TestCard key={card.test.id} test={card.test} status={card.status} goals={card.goals} />
        ))
      )}
    </div>
  )
}

export default ABResultsView
