import React from 'react'
import Link from 'next/link'
import type { AdminViewServerProps } from 'payload'

import {
  readFeatureFlags,
  resolveEntityGroups,
  type ResolvedEntity,
  type ResolvedGroup,
} from '@/components/admin/shared/resolveEntities'

import {
  formatRelativeTime,
  getRecentActivity,
  getStatTiles,
  greetingFor,
} from './dashboardData'
import './dashboard.css'

/**
 * The portal's landing page.
 *
 * Replaces the engine's default card grid, which listed every collection and
 * global as an equally-sized box - fine as a directory, useless as a starting
 * point. This is laid out the way a CMS dashboard normally is: what you most
 * likely came to do, then how the site is doing, then what changed, and only
 * then the full grouped index.
 *
 * Everything is rendered on the server so counts and recent edits are real at
 * first paint rather than arriving after a client fetch. Which entities appear
 * comes from the same resolver as the sidebar, so a feature switched off
 * disappears from both.
 */

const baseClass = 'eg-dashboard'

/** Collections that get a prominent button, in order, when creatable. */
const QUICK_CREATE_SLUGS = ['pages', 'posts', 'products', 'events', 'media']

const RECENT_LIMIT = 8

const PlusIcon: React.FC = () => (
  <svg aria-hidden="true" className={`${baseClass}__plus`} viewBox="0 0 16 16">
    <path d="M8 3.5v9M3.5 8h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
  </svg>
)

const findEntity = (groups: ResolvedGroup[], slug: string): ResolvedEntity | undefined => {
  for (const group of groups) {
    const match = group.entities.find((entity) => entity.type === 'collections' && entity.slug === slug)
    if (match) return match
  }
  return undefined
}

export const Dashboard: React.FC<AdminViewServerProps> = async (props) => {
  const { i18n, payload: engine, permissions, user, visibleEntities } = props
  const req = props.initPageResult?.req

  if (!engine?.config) return null

  const flags = await readFeatureFlags(engine)

  const groups = resolveEntityGroups({
    engine,
    flags,
    i18n,
    permissions,
    visibleEntities,
  })

  // Both are read-only and independent, so there is no reason to wait for one
  // before starting the other.
  const [stats, recent] = await Promise.all([
    getStatTiles(engine, groups, req),
    getRecentActivity(engine, groups, RECENT_LIMIT, req),
  ])

  const now = new Date()

  const quickCreates = QUICK_CREATE_SLUGS.map((slug) => findEntity(groups, slug)).filter(
    (entity): entity is ResolvedEntity & { createHref: string } => Boolean(entity?.createHref),
  )

  // `user` is typed loosely across auth collections; read the display fields
  // defensively rather than asserting a shape this view does not own.
  const account = user as { email?: string; name?: string } | null | undefined
  const displayName = account?.name || account?.email?.split('@')[0] || 'there'

  return (
    <div className={baseClass}>
      <header className={`${baseClass}__header`}>
        <div>
          <h1 className={`${baseClass}__greeting`}>
            {greetingFor(now)}, {displayName}
          </h1>
          <p className={`${baseClass}__subtitle`}>Here is what is happening across your site.</p>
        </div>
        <a className={`${baseClass}__view-site`} href="/" rel="noreferrer" target="_blank">
          View site
        </a>
      </header>

      {quickCreates.length > 0 && (
        <section className={`${baseClass}__section`}>
          <h2 className={`${baseClass}__section-title`}>Create</h2>
          <div className={`${baseClass}__quick-actions`}>
            {quickCreates.map((entity) => (
              <Link className={`${baseClass}__quick-action`} href={entity.createHref} key={entity.slug}>
                <PlusIcon />
                <span>New {entity.singular.toLowerCase()}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.length > 0 && (
        <section className={`${baseClass}__section`}>
          <h2 className={`${baseClass}__section-title`}>At a glance</h2>
          <div className={`${baseClass}__stats`}>
            {stats.map((stat) => (
              <Link className={`${baseClass}__stat`} href={stat.href} key={stat.slug}>
                <span className={`${baseClass}__stat-count`}>{stat.count.toLocaleString()}</span>
                <span className={`${baseClass}__stat-label`}>{stat.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={`${baseClass}__section`}>
        <h2 className={`${baseClass}__section-title`}>Recently edited</h2>
        {recent.length === 0 ? (
          <p className={`${baseClass}__empty`}>
            Nothing has been edited yet. Create a page to get started.
          </p>
        ) : (
          <div className={`${baseClass}__table-wrap`}>
            <table className={`${baseClass}__table`}>
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link className={`${baseClass}__row-link`} href={row.href}>
                        {row.title}
                      </Link>
                    </td>
                    <td className={`${baseClass}__muted`}>{row.typeLabel}</td>
                    <td>
                      {row.status ? (
                        <span className={`${baseClass}__status ${baseClass}__status--${row.status}`}>
                          {row.status === 'published' ? 'Published' : 'Draft'}
                        </span>
                      ) : (
                        <span className={`${baseClass}__muted`}>-</span>
                      )}
                    </td>
                    <td className={`${baseClass}__muted`}>
                      {formatRelativeTime(row.updatedAt, now.getTime())}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {groups.map((group) => (
        <section className={`${baseClass}__section`} key={group.label}>
          <h2 className={`${baseClass}__section-title`}>{group.label}</h2>
          <ul className={`${baseClass}__index`}>
            {group.entities.map((entity) => (
              <li className={`${baseClass}__index-item`} key={`${entity.type}:${entity.slug}`}>
                <Link className={`${baseClass}__index-link`} href={entity.href}>
                  {entity.label}
                </Link>
                {entity.createHref && (
                  <Link
                    aria-label={`Create a new ${entity.singular.toLowerCase()}`}
                    className={`${baseClass}__index-add`}
                    href={entity.createHref}
                    title={`New ${entity.singular.toLowerCase()}`}
                  >
                    <PlusIcon />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default Dashboard
