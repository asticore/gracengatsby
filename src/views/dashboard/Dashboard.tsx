import React from 'react'
import Link from 'next/link'
import type { AdminViewServerProps } from '@/engine'

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

/** Collections that get a prominent button, in order, when creatable. */
const QUICK_CREATE_SLUGS = ['pages', 'posts', 'products', 'events', 'media']

const RECENT_LIMIT = 8

const PlusIcon: React.FC = () => (
  <svg aria-hidden="true" className="h-[calc(var(--base)*0.85)] w-[calc(var(--base)*0.85)] shrink-0" viewBox="0 0 16 16">
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

  const sectionTitleClassName =
    'mb-[calc(var(--base)*0.6)] mt-0 text-[calc(var(--base)*0.7)] font-semibold uppercase tracking-[0.08em] text-[var(--theme-elevation-500)]'
  const mutedClassName = 'whitespace-nowrap text-[var(--theme-elevation-600)]'

  return (
    <div className="flex flex-col gap-[calc(var(--base)*1.75)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)] max-w-[1600px]">
      <header className="flex flex-wrap items-end justify-between gap-[var(--base)] border-b border-[var(--theme-elevation-150)] pb-[calc(var(--base)*0.75)]">
        <div>
          <h1 className="m-0 text-[calc(var(--base)*1.5)] leading-[1.2] font-semibold max-md:text-[calc(var(--base)*1.25)]">
            {greetingFor(now)}, {displayName}
          </h1>
          <p className="mx-0 mb-0 mt-[calc(var(--base)*0.25)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-600)]">
            Here is what is happening across your site.
          </p>
        </div>
        <a
          className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.4)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-700)] no-underline [transition:border-color_0.15s_ease,color_0.15s_ease] hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]"
          href="/"
          rel="noreferrer"
          target="_blank"
        >
          View site
        </a>
      </header>

      {quickCreates.length > 0 && (
        <section>
          <h2 className={sectionTitleClassName}>Create</h2>
          <div className="flex flex-wrap gap-[calc(var(--base)*0.5)]">
            {quickCreates.map((entity) => (
              <Link
                className="inline-flex items-center gap-[calc(var(--base)*0.35)] rounded-[4px] border border-[var(--ac-gold)] px-[calc(var(--base)*0.9)] py-[calc(var(--base)*0.5)] text-[calc(var(--base)*0.82)] font-medium text-[var(--ac-gold)] no-underline [transition:background-color_0.15s_ease,color_0.15s_ease] hover:bg-[var(--ac-gold)] hover:text-[var(--theme-elevation-0)]"
                href={entity.createHref}
                key={entity.slug}
              >
                <PlusIcon />
                <span>New {entity.singular.toLowerCase()}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {stats.length > 0 && (
        <section>
          <h2 className={sectionTitleClassName}>At a glance</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-[calc(var(--base)*0.5)] max-md:grid-cols-[repeat(auto-fill,minmax(120px,1fr))]">
            {stats.map((stat) => (
              <Link
                className="flex flex-col gap-[calc(var(--base)*0.15)] rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--ac-surface)] px-[calc(var(--base)*0.9)] py-[calc(var(--base)*0.75)] no-underline [transition:border-color_0.15s_ease] hover:border-[var(--ac-gold)]"
                href={stat.href}
                key={stat.slug}
              >
                <span className="text-[calc(var(--base)*1.4)] font-semibold leading-[1.1] text-[var(--theme-elevation-900)]">
                  {stat.count.toLocaleString()}
                </span>
                <span className="text-[calc(var(--base)*0.72)] text-[var(--theme-elevation-600)]">{stat.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className={sectionTitleClassName}>Recently edited</h2>
        {recent.length === 0 ? (
          <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
            Nothing has been edited yet. Create a page to get started.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--ac-surface)]">
            <table className="w-full border-collapse text-[calc(var(--base)*0.8)]">
              <thead>
                <tr>
                  <th
                    className="whitespace-nowrap border-b border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] text-left text-[calc(var(--base)*0.68)] font-semibold uppercase tracking-[0.06em] text-[var(--theme-elevation-500)]"
                    scope="col"
                  >
                    Title
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] text-left text-[calc(var(--base)*0.68)] font-semibold uppercase tracking-[0.06em] text-[var(--theme-elevation-500)]"
                    scope="col"
                  >
                    Type
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] text-left text-[calc(var(--base)*0.68)] font-semibold uppercase tracking-[0.06em] text-[var(--theme-elevation-500)]"
                    scope="col"
                  >
                    Status
                  </th>
                  <th
                    className="whitespace-nowrap border-b border-[var(--theme-elevation-150)] px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] text-left text-[calc(var(--base)*0.68)] font-semibold uppercase tracking-[0.06em] text-[var(--theme-elevation-500)]"
                    scope="col"
                  >
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row, index) => {
                  const isLast = index === recent.length - 1
                  const tdClassName = `px-[calc(var(--base)*0.8)] py-[calc(var(--base)*0.55)] align-middle ${
                    isLast ? '' : 'border-b border-[var(--theme-elevation-100)]'
                  }`
                  return (
                    <tr key={row.id} className="hover:bg-[var(--ac-ground)]">
                      <td className={tdClassName}>
                        <Link
                          className="font-medium text-[var(--theme-elevation-900)] no-underline hover:text-[var(--ac-gold)]"
                          href={row.href}
                        >
                          {row.title}
                        </Link>
                      </td>
                      <td className={`${tdClassName} ${mutedClassName}`}>{row.typeLabel}</td>
                      <td className={tdClassName}>
                        {row.status ? (
                          <span
                            className={`inline-block whitespace-nowrap rounded-[3px] px-[calc(var(--base)*0.45)] py-[calc(var(--base)*0.15)] text-[calc(var(--base)*0.68)] font-medium ${
                              row.status === 'published'
                                ? 'bg-[color-mix(in_srgb,var(--ac-gold)_14%,transparent)] text-[var(--ac-gold)]'
                                : 'bg-[var(--theme-elevation-100)] text-[var(--theme-elevation-600)]'
                            }`}
                          >
                            {row.status === 'published' ? 'Published' : 'Draft'}
                          </span>
                        ) : (
                          <span className={mutedClassName}>-</span>
                        )}
                      </td>
                      <td className={`${tdClassName} ${mutedClassName}`}>
                        {formatRelativeTime(row.updatedAt, now.getTime())}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {groups.map((group) => (
        <section key={group.label}>
          <h2 className={sectionTitleClassName}>{group.label}</h2>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[calc(var(--base)*0.3)] p-0">
            {group.entities.map((entity) => (
              <li
                className="flex items-stretch overflow-hidden rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--ac-surface)] [transition:border-color_0.15s_ease] hover:border-[var(--theme-elevation-300)]"
                key={`${entity.type}:${entity.slug}`}
              >
                <Link
                  className="flex-1 px-[calc(var(--base)*0.75)] py-[calc(var(--base)*0.5)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-800)] no-underline hover:text-[var(--ac-gold)]"
                  href={entity.href}
                >
                  {entity.label}
                </Link>
                {entity.createHref && (
                  <Link
                    aria-label={`Create a new ${entity.singular.toLowerCase()}`}
                    className="flex w-[calc(var(--base)*2)] items-center justify-center border-l border-[var(--theme-elevation-150)] text-[var(--theme-elevation-500)] no-underline [transition:background-color_0.15s_ease,color_0.15s_ease] hover:bg-[var(--ac-gold)] hover:text-[var(--theme-elevation-0)]"
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
