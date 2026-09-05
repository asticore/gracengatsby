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

const sizeLabel = (bytes: number, estimated: boolean): string =>
  `${estimated && bytes > 0 ? '~' : ''}${formatBytes(bytes)}`

const featureClassName =
  'flex flex-col gap-[calc(var(--base)*0.5)] p-[var(--base)] border border-[var(--theme-elevation-150)] rounded-[4px]'
const featureHeadClassName = 'flex items-start justify-between gap-[var(--base)]'
const featureMetaClassName = 'mt-[calc(var(--base)*0.25)] mx-0 mb-0 text-[var(--theme-elevation-600)]'
const actionsClassName = 'flex flex-wrap gap-[calc(var(--base)*0.5)]'
const buttonBaseClassName =
  'border [font-family:inherit] cursor-pointer rounded-[3px] bg-[var(--theme-elevation-0)] px-[calc(var(--base)*0.75)] py-[calc(var(--base)*0.35)] text-[0.85rem] disabled:cursor-not-allowed disabled:opacity-50'
const buttonDefaultClassName = `${buttonBaseClassName} border-[var(--theme-elevation-250)] text-[var(--theme-elevation-800)]`
const planClassName =
  'flex flex-col gap-[calc(var(--base)*0.4)] rounded-[3px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] p-[calc(var(--base)*0.75)] text-[0.85rem]'
const planListClassName = 'm-0 max-h-[260px] overflow-y-auto pl-[calc(var(--base)*1.25)]'
const refusalClassName = 'm-0 text-[var(--theme-error-500,var(--theme-elevation-800))]'
const doneClassName = 'm-0 text-[var(--theme-success-500,var(--theme-elevation-800))]'
const tableCellClassName =
  'whitespace-nowrap border-b border-[var(--theme-elevation-100)] px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.25)] text-right'

export const FeatureCleanupCard: React.FC<{
  feature: FeatureSurvey
  estimated: boolean
}> = ({ estimated, feature }) => {
  const [plan, setPlan] = React.useState<CleanupPlan | null>(null)
  const [typed, setTyped] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const phrase = confirmationPhraseFor(feature.key)
  const canDrop = !feature.enabled && feature.tables.length > 0
  const confirmDisabled = busy || typed !== phrase

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
    <article className={featureClassName}>
      <header className={featureHeadClassName}>
        <div>
          <h3 className="m-0 text-[1rem]">{feature.label}</h3>
          <p className={featureMetaClassName}>
            {feature.tables.length === 0
              ? 'No tables of its own.'
              : `${feature.tables.length} table${feature.tables.length === 1 ? '' : 's'} · ${feature.totalRows.toLocaleString()} row${feature.totalRows === 1 ? '' : 's'} · ${sizeLabel(feature.totalBytes, estimated)}`}
          </p>
        </div>
        <span
          className={`whitespace-nowrap rounded-[999px] border px-[10px] py-[2px] text-[0.75rem] ${
            feature.enabled
              ? 'border-[var(--theme-success-500,var(--theme-elevation-400))] text-[var(--theme-success-500,var(--theme-elevation-800))]'
              : 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-600)]'
          }`}
        >
          {feature.enabled ? 'On' : 'Off'}
        </span>
      </header>

      {feature.tables.length > 0 && (
        <details>
          <summary>Tables</summary>
          <table className="mt-[calc(var(--base)*0.5)] w-full border-collapse text-[0.85rem]">
            <thead>
              <tr>
                <th className="border-b border-[var(--theme-elevation-100)] px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.25)] text-left">
                  Table
                </th>
                <th className={tableCellClassName}>Rows</th>
                <th className={tableCellClassName}>{estimated ? 'Size (estimate)' : 'Size'}</th>
              </tr>
            </thead>
            <tbody>
              {feature.tables.map((table) => (
                <tr key={table.table}>
                  <td className="border-b border-[var(--theme-elevation-100)] px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.25)] text-left">
                    <code>{table.table}</code>
                    {table.alsoClaimedBy.length > 0 && (
                      <span className="block text-[0.75rem] text-[var(--theme-warning-500,var(--theme-elevation-600))]">
                        also used by {table.alsoClaimedBy.join(', ')}
                      </span>
                    )}
                  </td>
                  <td className={tableCellClassName}>{table.rows.toLocaleString()}</td>
                  <td className={tableCellClassName}>{sizeLabel(table.bytes, estimated)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {canDrop && (
        <div className={actionsClassName}>
          <button className={buttonDefaultClassName} disabled={busy} onClick={preview} type="button">
            {plan ? 'Re-check' : 'Show what would be removed'}
          </button>
        </div>
      )}

      {plan && (
        <div className={planClassName}>
          {plan.refusals.map((reason) => (
            <p className={refusalClassName} key={reason}>
              {reason}
            </p>
          ))}

          {plan.dropped.length > 0 && (
            <p className={doneClassName}>
              Removed {plan.dropped.length} table{plan.dropped.length === 1 ? '' : 's'}. Reload to
              see the updated figures.
            </p>
          )}

          {plan.errors.map((error) => (
            <p className={refusalClassName} key={error.statement}>
              {error.statement}: {error.error}
            </p>
          ))}

          {plan.dryRun && plan.refusals.length === 0 && plan.tables.length > 0 && (
            <>
              <p className="m-0 font-semibold">
                This will permanently delete {plan.tables.length} table
                {plan.tables.length === 1 ? '' : 's'} and everything in {plan.tables.length === 1 ? 'it' : 'them'}. There is no undo.
              </p>
              <ul className={planListClassName}>
                {plan.tables.map((table) => (
                  <li key={table}>
                    <code>{table}</code>
                  </li>
                ))}
              </ul>
              <label className="flex max-w-[320px] flex-col gap-[calc(var(--base)*0.25)]">
                <span>
                  Type <code>{phrase}</code> to confirm
                </span>
                <input
                  autoComplete="off"
                  className="[font:inherit] rounded-[3px] border border-[var(--theme-elevation-250)] bg-[var(--theme-input-bg,var(--theme-elevation-0))] p-[calc(var(--base)*0.35)] text-inherit"
                  onChange={(event) => setTyped(event.target.value)}
                  type="text"
                  value={typed}
                />
              </label>
              <button
                className={`${buttonBaseClassName} ${
                  confirmDisabled
                    ? 'border-[var(--theme-elevation-250)] text-[var(--theme-elevation-800)]'
                    : 'border-[var(--theme-error-500,var(--theme-elevation-800))] text-[var(--theme-error-500,var(--theme-elevation-800))]'
                }`}
                disabled={confirmDisabled}
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
    <article className={featureClassName}>
      <header className={featureHeadClassName}>
        <div>
          <h3 className="m-0 text-[1rem]">Tidy index names</h3>
          <p className={featureMetaClassName}>
            {staleCount === 0
              ? 'Every index is named after the table it sits on.'
              : `${staleCount} index${staleCount === 1 ? '' : 'es'} still named after a table's previous name.`}
          </p>
        </div>
      </header>

      <p className={featureMetaClassName}>
        Cosmetic only, and safe to run at any time: each index is recreated under its new name
        before the old one is removed, so no table is ever left without one.
      </p>

      <div className={actionsClassName}>
        <button className={buttonDefaultClassName} disabled={busy} onClick={() => run(false)} type="button">
          Show what would change
        </button>
        {report && report.dryRun && report.renames.length > 0 && (
          <button className={buttonDefaultClassName} disabled={busy} onClick={() => run(true)} type="button">
            Rename {report.renames.length}
          </button>
        )}
      </div>

      {report && (
        <div className={planClassName}>
          {report.renames.length === 0 && <p>Nothing to rename.</p>}
          {report.renamed.length > 0 && <p className={doneClassName}>Renamed {report.renamed.length}.</p>}
          {report.dryRun && (
            <ul className={planListClassName}>
              {report.renames.map((rename) => (
                <li key={rename.from}>
                  <code>{rename.from}</code> → <code>{rename.to}</code>
                </li>
              ))}
            </ul>
          )}
          {report.errors.map((error) => (
            <p className={refusalClassName} key={error.statement || error.error}>
              {error.error}
            </p>
          ))}
        </div>
      )}
    </article>
  )
}
