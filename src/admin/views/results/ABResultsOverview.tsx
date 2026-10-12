import Link from 'next/link'
import React from 'react'
import type { CollectionSlug, Engine, TypedUser } from '@/engine'
import { readStats } from '@/features/abTesting/events'
import { toActiveTest } from '@/features/abTesting/manifest'
import { formatUplift, summariseGoal } from '@/features/abTesting/overview'
import { buildResults } from '@/features/abTesting/results'
import { AB_TESTS_SLUG } from '@/features/abTesting/slugs'
import '../edit-tabs.css'
import '../list-section-tabs.css'

const READINESS_LABEL: Record<string, string> = {
  'no-data': 'No visitors yet',
  'too-few': 'Too few visitors',
  inconclusive: 'Not yet clear',
  significant: 'Clear result',
}

/**
 * The Results tab on the A/B tests list: one row per test and goal with the
 * leader, the uplift against the control and whether the numbers support
 * calling it, each linking to that test (its own Results tab has the full
 * tables). Server-rendered from the same rollups the per-test card reads.
 * Reads pass the signed-in user, so a test the user cannot read is not listed.
 */
export async function ABResultsOverview({ engine, user }: { engine: Engine; user: TypedUser | null }): Promise<React.ReactElement> {
  const { docs } = await engine
    .find({
      collection: AB_TESTS_SLUG as CollectionSlug,
      depth: 0,
      limit: 100,
      sort: '-updatedAt',
      user,
    })
    .catch(() => ({ docs: [] as unknown[] }))

  const rows = await Promise.all(
    docs.map(async (doc) => {
      const raw = doc as Record<string, unknown>
      const test = toActiveTest(raw)
      const goals = buildResults(test, await readStats(test.id))
      return { id: String(raw.id ?? test.id), test, status: String(raw.status ?? 'draft'), goals: goals.map(summariseGoal) }
    }),
  )

  if (rows.length === 0) return <p className="et-muted">No tests have been created yet.</p>

  return (
    <section aria-label="A/B test results" className="et-results">
      <p className="lst-overview-note">
        Visitors are counted once per test, the first time they are put into a variant. A winner is only named once the
        numbers support it; until then the leading variant is shown as a hint.
      </p>
      <div className="et-table-wrap">
        <table className="et-table">
          <thead>
            <tr>
              <th scope="col">Test</th>
              <th scope="col">Status</th>
              <th scope="col">Goal</th>
              <th scope="col" className="et-num">Visitors</th>
              <th scope="col">Winner</th>
              <th scope="col" className="et-num">Uplift</th>
              <th scope="col">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.goals.length === 0 ? (
                <tr key={row.id}>
                  <td className="et-clip">
                    <Link href={`/admin/collections/ab-tests/${row.id}#results`}>{row.test.name}</Link>
                  </td>
                  <td><span className="lst-pill">{row.status}</span></td>
                  <td colSpan={5} className="et-muted">No goals yet, so nothing is measured.</td>
                </tr>
              ) : (
                row.goals.map((goal, index) => (
                  <tr key={`${row.id}:${goal.goal}:${index}`}>
                    <td className="et-clip">
                      {index === 0 ? <Link href={`/admin/collections/ab-tests/${row.id}#results`}>{row.test.name}</Link> : null}
                    </td>
                    <td>{index === 0 ? <span className="lst-pill">{row.status}</span> : null}</td>
                    <td className="et-clip">{goal.goal}</td>
                    <td className="et-num">{goal.visitors.toLocaleString()}</td>
                    <td>
                      {goal.winner ? (
                        <span className="lst-pill lst-pill--win">{goal.winner}</span>
                      ) : goal.leader ? (
                        <span className="et-muted">{goal.leader} (leading)</span>
                      ) : (
                        <span className="et-muted">-</span>
                      )}
                    </td>
                    <td className="et-num">{formatUplift(goal.uplift)}</td>
                    <td>{READINESS_LABEL[goal.readiness] ?? goal.readiness}</td>
                  </tr>
                ))
              ),
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
