import React from 'react'
import type { AdminViewServerProps } from '@/engine'

import { getFeatureFlags } from '@/utilities/features'

import { FeatureCleanupCard, IndexTidyCard } from './DatabaseCleanupPanel'
import { getCleanupDb } from './guard'
import { planIndexRenames } from './indexNames'
import { formatBytes } from './size'
import { surveyDatabase } from './survey'

/**
 * The Database screen: one section per feature showing what it owns and what
 * that costs, with a cleanup control on the ones that are switched off.
 *
 * Rendered entirely on the server. The alternative - a client fetch to the
 * survey route - would mean the browser holding the internal route key, which
 * is a deploy secret. The buttons go through server actions instead; see
 * actions.ts.
 */

const rootClassName =
  'flex flex-col gap-[calc(var(--base)*1.5)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)] max-w-[1100px]'
const mutedParagraphClassName = 'mt-[calc(var(--base)*0.25)] mx-0 mb-0 text-[var(--theme-elevation-600)]'
const statClassName =
  'flex flex-col gap-[calc(var(--base)*0.15)] p-[var(--base)] border border-[var(--theme-elevation-150)] rounded-[4px]'
const sectionTitleClassName = 'm-0 text-[1rem] uppercase tracking-[0.06em] text-[var(--theme-elevation-600)]'
const sectionClassName = 'flex flex-col gap-[calc(var(--base)*0.5)]'

export const DatabaseView: React.FC<AdminViewServerProps> = async () => {
  const db = await getCleanupDb()

  if (!db) {
    return (
      <div className={rootClassName}>
        <h1 className="m-0">Database</h1>
        <p className={mutedParagraphClassName}>
          No database binding is available in this environment, so there is nothing to survey.
        </p>
      </div>
    )
  }

  const stale = planIndexRenames(await db.listIndexes())
  const survey = await surveyDatabase(db, await getFeatureFlags(), stale.length)

  const off = survey.features.filter((feature) => !feature.enabled)
  const on = survey.features.filter((feature) => feature.enabled)
  const reclaimable = off.reduce((sum, feature) => sum + feature.totalBytes, 0)

  return (
    <div className={rootClassName}>
      <header>
        <h1 className="m-0">Database</h1>
        <p className={mutedParagraphClassName}>
          Every feature keeps its own tables. Switching a feature off hides it, but its tables stay
          where they are - this is where you get that space back.
        </p>
      </header>

      <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[var(--base)]">
        <div className={statClassName}>
          <span className="text-[1.5rem] font-semibold">
            {survey.databaseBytes === null ? 'Unknown' : formatBytes(survey.databaseBytes)}
          </span>
          <span className="text-[0.8rem] text-[var(--theme-elevation-600)]">Database size</span>
        </div>
        <div className={statClassName}>
          <span className="text-[1.5rem] font-semibold">
            {survey.sizesAreExact ? '' : '~'}
            {formatBytes(reclaimable)}
          </span>
          <span className="text-[0.8rem] text-[var(--theme-elevation-600)]">In switched-off features</span>
        </div>
        <div className={statClassName}>
          <span className="text-[1.5rem] font-semibold">{off.length}</span>
          <span className="text-[0.8rem] text-[var(--theme-elevation-600)]">Features switched off</span>
        </div>
      </section>

      <p
        className={`m-0 text-[0.85rem] ${
          survey.sizesAreExact
            ? 'text-[var(--theme-elevation-600)]'
            : 'py-[calc(var(--base)*0.5)] px-[calc(var(--base)*0.75)] border-l-[3px] border-[var(--theme-elevation-300)] text-[var(--theme-elevation-800)]'
        }`}
      >
        {survey.sizeNote}
      </p>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Switched off</h2>
        {off.length === 0 ? (
          <p className={mutedParagraphClassName}>Every feature is switched on.</p>
        ) : (
          off.map((feature) => (
            <FeatureCleanupCard estimated={!survey.sizesAreExact} feature={feature} key={feature.key} />
          ))
        )}
      </section>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Switched on</h2>
        <p className={mutedParagraphClassName}>
          These are in use. Switch a feature off in Site Settings before clearing its data.
        </p>
        {on.map((feature) => (
          <FeatureCleanupCard estimated={!survey.sizesAreExact} feature={feature} key={feature.key} />
        ))}
      </section>

      <section className={sectionClassName}>
        <h2 className={sectionTitleClassName}>Maintenance</h2>
        <IndexTidyCard staleCount={survey.staleIndexCount} />
      </section>
    </div>
  )
}
