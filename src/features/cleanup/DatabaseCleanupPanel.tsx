'use client'

import React from 'react'

import { cleanupFeatureAction, tidyIndexNamesAction } from './actions'
import { confirmationPhraseFor, type CleanupPlan } from './cleanup'
import { formatBytes } from './size'
import type { FeatureSurvey } from './survey'
import type { IndexTidyReport } from './indexNames'

/**
 * The interactive half of the Database screen.
 *
 * The flow is deliberately two-step and cannot be short-circuited: the button
 * only ever asks for the plan, and the plan is what reveals the confirmation
 * box. Even if someone got past that, the server re-checks the flag, the
 * confirmation phrase and the table list itself before it drops anything -
 * this component is a convenience, not the boundary.
 */

const baseClass = 'eg-database'

const sizeLabel = (bytes: number, estimated: boolean): string =>
  `${estimated && bytes > 0 ? '~' : ''}${formatBytes(bytes)}`

export const FeatureCleanupCard: React.FC<{
  feature: FeatureSurvey
  estimated: boolean
}> = ({ estimated, feature }) => {
  const [plan, setPlan] = React.useState<CleanupPlan | null>(null)
  const [typed, setTyped] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const phrase = confirmationPhraseFor(feature.key)
  const canDrop = !feature.enabled && feature.tables.length > 0

  const preview = async (): Promise<void> => {
    setBusy(true)
    setPlan(await cleanupFeatureAction({ feature: feature.key }))
    setTyped('')
    setBusy(false)
  }

  const drop = async (): Promise<void> => {
    setBusy(true)
    setPlan(await cleanupFeatureAction({ confirm: typed, execute: true, feature: feature.key }))
    setTyped('')
    setBusy(false)
  }

  return (
    <article className={`${baseClass}__feature`}>
      <header className={`${baseClass}__feature-head`}>
        <div>
          <h3 className={`${baseClass}__feature-name`}>{feature.label}</h3>
          <p className={`${baseClass}__feature-meta`}>
            {feature.tables.length === 0
              ? 'No tables of its own.'
              : `${feature.tables.length} table${feature.tables.length === 1 ? '' : 's'} · ${feature.totalRows.toLocaleString()} row${feature.totalRows === 1 ? '' : 's'} · ${sizeLabel(feature.totalBytes, estimated)}`}
          </p>
        </div>
        <span className={`${baseClass}__pill`} data-on={feature.enabled ? 'true' : undefined}>
          {feature.enabled ? 'On' : 'Off'}
        </span>
      </header>

      {feature.tables.length > 0 && (
        <details className={`${baseClass}__tables`}>
          <summary>Tables</summary>
          <table>
            <thead>
              <tr>
                <th>Table</th>
                <th>Rows</th>
                <th>{estimated ? 'Size (estimate)' : 'Size'}</th>
              </tr>
            </thead>
            <tbody>
              {feature.tables.map((table) => (
                <tr key={table.table}>
                  <td>
                    <code>{table.table}</code>
                    {table.alsoClaimedBy.length > 0 && (
                      <span className={`${baseClass}__shared`}>
                        also used by {table.alsoClaimedBy.join(', ')}
                      </span>
                    )}
                  </td>
                  <td>{table.rows.toLocaleString()}</td>
                  <td>{sizeLabel(table.bytes, estimated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {canDrop && (
        <div className={`${baseClass}__actions`}>
          <button className={`${baseClass}__button`} disabled={busy} onClick={preview} type="button">
            {plan ? 'Re-check' : 'Show what would be removed'}
          </button>
        </div>
      )}

      {plan && (
        <div className={`${baseClass}__plan`}>
          {plan.refusals.map((reason) => (
            <p className={`${baseClass}__refusal`} key={reason}>
              {reason}
            </p>
          ))}

          {plan.dropped.length > 0 && (
            <p className={`${baseClass}__done`}>
              Removed {plan.dropped.length} table{plan.dropped.length === 1 ? '' : 's'}. Reload to
              see the updated figures.
            </p>
          )}

          {plan.errors.map((error) => (
            <p className={`${baseClass}__refusal`} key={error.statement}>
              {error.statement}: {error.error}
            </p>
          ))}

          {plan.dryRun && plan.refusals.length === 0 && plan.tables.length > 0 && (
            <>
              <p className={`${baseClass}__plan-title`}>
                This will permanently delete {plan.tables.length} table
                {plan.tables.length === 1 ? '' : 's'} and everything in {plan.tables.length === 1 ? 'it' : 'them'}. There is no undo.
              </p>
              <ul className={`${baseClass}__plan-list`}>
                {plan.tables.map((table) => (
                  <li key={table}>
                    <code>{table}</code>
                  </li>
                ))}
              </ul>
              <label className={`${baseClass}__confirm`}>
                <span>
                  Type <code>{phrase}</code> to confirm
                </span>
                <input
                  autoComplete="off"
                  onChange={(event) => setTyped(event.target.value)}
                  type="text"
                  value={typed}
                />
              </label>
              <button
                className={`${baseClass}__button`}
                data-danger="true"
                disabled={busy || typed !== phrase}
                onClick={drop}
                type="button"
              >
                Delete these tables
              </button>
            </>
          )}
        </div>
      )}
    </article>
  )
}

export const IndexTidyCard: React.FC<{ staleCount: number }> = ({ staleCount }) => {
  const [report, setReport] = React.useState<IndexTidyReport | null>(null)
  const [busy, setBusy] = React.useState(false)

  const run = async (execute: boolean): Promise<void> => {
    setBusy(true)
    setReport(await tidyIndexNamesAction(execute))
    setBusy(false)
  }

  return (
    <article className={`${baseClass}__feature`}>
      <header className={`${baseClass}__feature-head`}>
        <div>
          <h3 className={`${baseClass}__feature-name`}>Tidy index names</h3>
          <p className={`${baseClass}__feature-meta`}>
            {staleCount === 0
              ? 'Every index is named after the table it sits on.'
              : `${staleCount} index${staleCount === 1 ? '' : 'es'} still named after a table's previous name.`}
          </p>
        </div>
      </header>

      <p className={`${baseClass}__feature-meta`}>
        Cosmetic only, and safe to run at any time: each index is recreated under its new name
        before the old one is removed, so no table is ever left without one.
      </p>

      <div className={`${baseClass}__actions`}>
        <button className={`${baseClass}__button`} disabled={busy} onClick={() => run(false)} type="button">
          Show what would change
        </button>
        {report && report.dryRun && report.renames.length > 0 && (
          <button className={`${baseClass}__button`} disabled={busy} onClick={() => run(true)} type="button">
            Rename {report.renames.length}
          </button>
        )}
      </div>

      {report && (
        <div className={`${baseClass}__plan`}>
          {report.renames.length === 0 && <p>Nothing to rename.</p>}
          {report.renamed.length > 0 && <p className={`${baseClass}__done`}>Renamed {report.renamed.length}.</p>}
          {report.dryRun && (
            <ul className={`${baseClass}__plan-list`}>
              {report.renames.map((rename) => (
                <li key={rename.from}>
                  <code>{rename.from}</code> → <code>{rename.to}</code>
                </li>
              ))}
            </ul>
          )}
          {report.errors.map((error) => (
            <p className={`${baseClass}__refusal`} key={error.statement || error.error}>
              {error.error}
            </p>
          ))}
        </div>
      )}
    </article>
  )
}
