import React from 'react'
import type { AdminViewServerProps, CollectionSlug } from '@/engine'

import { getEngine } from '@/lib/engine'

import { readStats } from '../events'
import { toActiveTest } from '../manifest'
import { buildResults } from '../results'
import { abTestingEnabled } from '../settings'
import { AB_TESTS_SLUG } from '../slugs'
import type { ActiveTest, GoalResult } from '../types'

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

const percent = (value: number): string => `${(value * 100).toFixed(2)}%`

const signed = (value: number | null): string =>
  value === null ? '-' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`

const mutedClassName = 'text-[var(--theme-elevation-600)]'
const dimClassName = 'text-[var(--theme-elevation-400)]'
const tableHeadCellBase = 'border-b border-[var(--theme-elevation-100)] px-[0.6rem] py-[0.4rem] font-medium text-[var(--theme-elevation-600)]'
const tableBodyCellBase = 'border-b border-[var(--theme-elevation-100)] px-[0.6rem] py-[0.4rem]'

const GoalTable: React.FC<{ goal: GoalResult }> = ({ goal }) => (
  <div className="mt-[1.25rem]">
    <h3 className="mx-0 mt-0 mb-[0.4rem] text-[0.95rem]">{goal.label}</h3>
    <table className="w-full border-collapse text-[0.85rem]">
      <thead>
        <tr>
          <th className={`${tableHeadCellBase} text-left`}>Variant</th>
          <th className={`${tableHeadCellBase} text-right`}>Visitors</th>
          <th className={`${tableHeadCellBase} text-right`}>Conversions</th>
          <th className={`${tableHeadCellBase} text-right`}>Rate</th>
          <th className={`${tableHeadCellBase} text-right`}>95% range</th>
          <th className={`${tableHeadCellBase} text-right`}>Change</th>
          <th className={`${tableHeadCellBase} text-right`}>p</th>
        </tr>
      </thead>
      <tbody>
        {goal.variants.map((variant) => (
          <tr key={variant.key}>
            <td className={`${tableBodyCellBase} text-left`}>
              {variant.label}
              {variant.isControl && <span className="ml-[0.35rem] text-[0.75rem] text-[var(--theme-elevation-500)]">control</span>}
            </td>
            <td className={`${tableBodyCellBase} text-right`}>{variant.visitors.toLocaleString()}</td>
            <td className={`${tableBodyCellBase} text-right`}>{variant.conversions.toLocaleString()}</td>
            <td className={`${tableBodyCellBase} text-right`}>{percent(variant.rate)}</td>
            <td className={`${tableBodyCellBase} text-right ${variant.interval ? '' : dimClassName}`}>
              {variant.interval
                ? `${percent(variant.interval.low)} - ${percent(variant.interval.high)}`
                : 'too few'}
            </td>
            <td className={`${tableBodyCellBase} text-right ${variant.lift === null ? dimClassName : ''}`}>
              {variant.isControl ? '-' : signed(variant.lift)}
            </td>
            <td className={`${tableBodyCellBase} text-right ${variant.pValue === null ? dimClassName : ''}`}>
              {variant.pValue === null ? 'n/a' : variant.pValue.toFixed(3)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    <p
      className={`mx-0 mt-[0.6rem] mb-0 border-l-[length:3px] border-solid bg-[var(--theme-elevation-50)] px-[0.7rem] py-[0.55rem] text-[0.82rem] leading-[1.45] ${
        goal.readiness === 'too-few' || goal.readiness === 'no-data'
          ? 'border-l-[color:var(--theme-warning-500,#b58900)]'
          : goal.readiness === 'significant'
            ? 'border-l-[color:var(--theme-success-500,#2e7d32)]'
            : 'border-l-[color:var(--theme-elevation-200)]'
      }`}
    >
      {goal.verdict}
    </p>
  </div>
)

const TestCard: React.FC<{ test: ActiveTest; status: string; goals: GoalResult[] }> = ({
  test,
  status,
  goals,
}) => (
  <section className="mb-[1.5rem] rounded-[4px] border border-[var(--theme-elevation-150)] pt-[1rem] px-[1.25rem] pb-[1.25rem]">
    <header className="mb-[0.25rem] flex flex-wrap items-baseline gap-[0.75rem]">
      <h2 className="m-0 text-[1.1rem]">{test.name}</h2>
      <span className="rounded-[2px] border border-[var(--theme-elevation-200)] px-[0.4rem] py-[0.1rem] text-[0.7rem] uppercase tracking-[0.05em]">
        {status}
      </span>
      <span className="text-[0.8rem] text-[var(--theme-elevation-500)]">
        {test.targetPath || 'no target path'} - {test.scope === 'block' ? 'one section' : 'whole page'}
      </span>
    </header>
    {goals.length === 0 ? (
      <p className={mutedClassName}>This test has no goals yet, so there is nothing to measure.</p>
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
    <div className="py-[var(--base,1rem)]">
      <header>
        <h1 className="mx-0 mt-0 mb-[0.25rem]">A/B test results</h1>
        <p className={`mx-0 mt-0 mb-[1.5rem] max-w-[44rem] ${mutedClassName}`}>
          Visitors are counted once per test, the first time they are put into an arm - so these are
          people, not page views. Percentages before a few hundred visitors per arm are mostly noise;
          the note under each table says whether the numbers support a decision yet.
          {!enabled && ' A/B testing is currently switched off in Site Settings, so nothing new is being recorded.'}
        </p>
      </header>

      {cards.length === 0 ? (
        <p className={mutedClassName}>No tests have been created yet.</p>
      ) : (
        cards.map((card) => (
          <TestCard key={card.test.id} test={card.test} status={card.status} goals={card.goals} />
        ))
      )}
    </div>
  )
}

export default ABResultsView
