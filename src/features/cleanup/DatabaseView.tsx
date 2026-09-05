import React from 'react'
import type { AdminViewServerProps } from '@/engine'

import { getFeatureFlags } from '@/utilities/features'

import { FeatureCleanupCard, IndexTidyCard } from './DatabaseCleanupPanel'
import { getCleanupDb } from './guard'
import { planIndexRenames } from './indexNames'
import { formatBytes } from './size'
import { surveyDatabase } from './survey'
import { DATABASE_CSS } from './database.styles'

/**
 * The Database screen: one section per feature showing what it owns and what
 * that costs, with a cleanup control on the ones that are switched off.
 *
 * Rendered entirely on the server. The alternative - a client fetch to the
 * survey route - would mean the browser holding the internal route key, which
 * is a deploy secret. The buttons go through server actions instead; see
 * actions.ts.
 */

const baseClass = 'eg-database'

export const DatabaseView: React.FC<AdminViewServerProps> = async () => {
  const db = await getCleanupDb()

  if (!db) {
    return (
      <div className={baseClass}>
        {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
        <style dangerouslySetInnerHTML={{ __html: DATABASE_CSS }} />
        <h1 className={`${baseClass}__title`}>Database</h1>
        <p className={`${baseClass}__empty`}>
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
    <div className={baseClass}>
      {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
      <style dangerouslySetInnerHTML={{ __html: DATABASE_CSS }} />
      <header className={`${baseClass}__header`}>
        <h1 className={`${baseClass}__title`}>Database</h1>
        <p className={`${baseClass}__subtitle`}>
          Every feature keeps its own tables. Switching a feature off hides it, but its tables stay
          where they are - this is where you get that space back.
        </p>
      </header>

      <section className={`${baseClass}__summary`}>
        <div className={`${baseClass}__stat`}>
          <span className={`${baseClass}__stat-value`}>
            {survey.databaseBytes === null ? 'Unknown' : formatBytes(survey.databaseBytes)}
          </span>
          <span className={`${baseClass}__stat-label`}>Database size</span>
        </div>
        <div className={`${baseClass}__stat`}>
          <span className={`${baseClass}__stat-value`}>
            {survey.sizesAreExact ? '' : '~'}
            {formatBytes(reclaimable)}
          </span>
          <span className={`${baseClass}__stat-label`}>In switched-off features</span>
        </div>
        <div className={`${baseClass}__stat`}>
          <span className={`${baseClass}__stat-value`}>{off.length}</span>
          <span className={`${baseClass}__stat-label`}>Features switched off</span>
        </div>
      </section>

      <p className={`${baseClass}__note`} data-estimate={survey.sizesAreExact ? undefined : 'true'}>
        {survey.sizeNote}
      </p>

      <section className={`${baseClass}__section`}>
        <h2 className={`${baseClass}__section-title`}>Switched off</h2>
        {off.length === 0 ? (
          <p className={`${baseClass}__empty`}>Every feature is switched on.</p>
        ) : (
          off.map((feature) => (
            <FeatureCleanupCard
              estimated={!survey.sizesAreExact}
              feature={feature}
              key={feature.key}
            />
          ))
        )}
      </section>

      <section className={`${baseClass}__section`}>
        <h2 className={`${baseClass}__section-title`}>Switched on</h2>
        <p className={`${baseClass}__empty`}>
          These are in use. Switch a feature off in Site Settings before clearing its data.
        </p>
        {on.map((feature) => (
          <FeatureCleanupCard estimated={!survey.sizesAreExact} feature={feature} key={feature.key} />
        ))}
      </section>

      <section className={`${baseClass}__section`}>
        <h2 className={`${baseClass}__section-title`}>Maintenance</h2>
        <IndexTidyCard staleCount={survey.staleIndexCount} />
      </section>
    </div>
  )
}
