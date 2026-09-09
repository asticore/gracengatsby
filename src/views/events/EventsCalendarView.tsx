import Link from 'next/link'
import type { Payload, PayloadRequest } from 'payload'

interface EventsListData {
  docs: Array<Record<string, unknown>>
  page?: number
  totalPages?: number
  hasPrevPage?: boolean
  hasNextPage?: boolean
  totalDocs?: number
}

interface EventsCalendarViewProps {
  collectionConfig?: { slug?: string }
  data?: EventsListData
  hasCreatePermission?: boolean
  newDocumentURL?: string
  payload?: Payload
  searchParams?: Record<string, string | string[] | undefined>
  user?: PayloadRequest['user']
}

type ViewMode = 'list' | 'calendar'

const SORTABLE_COLUMNS = [
  { field: 'title', label: 'Title' },
  { field: 'startDate', label: 'Start Date' },
  { field: 'eventType', label: 'Type' },
] as const

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/** `YYYY-MM` (UTC) for grouping/linking - avoids local-timezone month drift. */
function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/** `YYYY-MM-DD` (UTC) for grouping events onto calendar day cells. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function parseMonthParam(value: string | undefined): { year: number; month: number } {
  const match = value?.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2]) - 1
    if (month >= 0 && month <= 11) return { year, month }
  }
  const now = new Date()
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
}

/**
 * Custom List view for the Events collection - a month calendar OR a
 * sortable/searchable table, switched with a toggle (mirrors the same
 * gallery/list toggle built for Media's admin list, per the same "don't
 * replace what's there, add an option" feedback). Registered via Events.ts's
 * `admin.components.views.list.Component`; before this, Events had no
 * admin.components.views override at all (100% stock Payload list/edit),
 * and no calendar feature exists anywhere else in the app.
 *
 * List mode reuses Payload's own already-fetched `data` for the current
 * page/sort/search - identical mechanism to MediaGalleryView's list mode
 * (sort/search links change the URL, Payload's own list-view route re-runs
 * `payload.find()` server-side with those params before this component
 * re-renders), so it stays a plain server component with no client-side
 * query state.
 *
 * Calendar mode is different: it needs every event across a whole visible
 * month regardless of the list route's own page size, not a paginated
 * slice - so instead of relying on `data`, it runs its own direct
 * `payload.find()` scoped to the visible month's date range (with
 * `overrideAccess: false` so a non-admin viewer only ever sees what
 * `adminOrPublishedStatus` already allows them to see elsewhere, same as
 * the stock list would enforce).
 */
export async function EventsCalendarView(props: EventsCalendarViewProps) {
  const { collectionConfig, data, hasCreatePermission, newDocumentURL, payload, searchParams, user } = props
  const adminRoute = payload?.config?.routes?.admin ?? '/admin'
  const slug = collectionConfig?.slug ?? 'events'

  const sp = searchParams ?? {}
  const strParam = (key: string): string | undefined => {
    const value = sp[key]
    return typeof value === 'string' ? value : undefined
  }
  const view: ViewMode = strParam('view') === 'calendar' ? 'calendar' : 'list'
  const currentSort = strParam('sort') ?? ''
  const currentSearch = strParam('search') ?? ''

  const buildHref = (overrides: Record<string, string | undefined>, keepPage = false): string => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(sp)) {
      if (key === 'page' && !keepPage) continue
      if (key in overrides) continue
      if (typeof value === 'string') params.set(key, value)
    }
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) continue
      params.set(key, value)
    }
    const qs = params.toString()
    return qs ? `?${qs}` : '?'
  }

  const tabClass = (active: boolean) =>
    `rounded-[4px] border px-[calc(var(--base)*0.7)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.78)] font-medium no-underline [transition:border-color_0.15s_ease,color_0.15s_ease] ${
      active
        ? 'border-[var(--ac-gold)] text-[var(--ac-gold)]'
        : 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-600)] hover:border-[var(--theme-elevation-400)]'
    }`

  const header = (totalCount: number) => (
    <header className="flex flex-wrap items-end justify-between gap-[var(--base)] border-b border-[var(--theme-elevation-150)] pb-[calc(var(--base)*0.75)]">
      <div>
        <h1 className="m-0 text-[calc(var(--base)*1.5)] leading-[1.2] font-semibold">Events</h1>
        <p className="mx-0 mb-0 mt-[calc(var(--base)*0.25)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-600)]">
          {totalCount} event{totalCount === 1 ? '' : 's'}
        </p>
      </div>
      {hasCreatePermission && newDocumentURL ? (
        <Link
          href={newDocumentURL}
          className="inline-flex items-center gap-[calc(var(--base)*0.35)] rounded-[4px] border border-[var(--ac-gold)] px-[calc(var(--base)*0.9)] py-[calc(var(--base)*0.5)] text-[calc(var(--base)*0.82)] font-medium text-[var(--ac-gold)] no-underline [transition:background-color_0.15s_ease,color_0.15s_ease] hover:bg-[var(--ac-gold)] hover:text-[var(--theme-elevation-0)]"
        >
          Add new
        </Link>
      ) : null}
    </header>
  )

  const modeTabs = (
    <div className="flex items-center gap-[calc(var(--base)*0.4)]">
      <Link href={buildHref({ view: undefined })} className={tabClass(view === 'list')}>
        List
      </Link>
      <Link href={buildHref({ view: 'calendar' })} className={tabClass(view === 'calendar')}>
        Calendar
      </Link>
    </div>
  )

  if (view === 'calendar') {
    const { year, month } = parseMonthParam(strParam('month'))
    const monthStart = new Date(Date.UTC(year, month, 1))
    const monthEnd = new Date(Date.UTC(year, month + 1, 1))
    // Pad out to full weeks (Sun-Sat) so the grid always has complete rows.
    const gridStart = new Date(monthStart)
    gridStart.setUTCDate(gridStart.getUTCDate() - gridStart.getUTCDay())
    const gridEnd = new Date(monthEnd)
    const trailingGap = (7 - gridEnd.getUTCDay()) % 7
    gridEnd.setUTCDate(gridEnd.getUTCDate() + trailingGap)

    const eventsByDay = new Map<string, Array<{ id: string; title: string; status?: string }>>()
    if (payload) {
      const result = await payload.find({
        collection: slug as 'events',
        depth: 0,
        limit: 0,
        overrideAccess: false,
        sort: 'startDate',
        user,
        where: {
          startDate: { greater_than_equal: gridStart.toISOString(), less_than: gridEnd.toISOString() },
        },
      })
      for (const doc of result.docs as unknown as Array<Record<string, unknown>>) {
        const startDate = typeof doc.startDate === 'string' ? new Date(doc.startDate) : null
        if (!startDate || Number.isNaN(startDate.getTime())) continue
        const key = dayKey(startDate)
        const list = eventsByDay.get(key) ?? []
        list.push({
          id: String(doc.id),
          title: typeof doc.title === 'string' ? doc.title : String(doc.id),
          status: typeof doc._status === 'string' ? doc._status : undefined,
        })
        eventsByDay.set(key, list)
      }
    }
    const totalCount = Array.from(eventsByDay.values()).reduce((sum, list) => sum + list.length, 0)

    const monthLabel = monthStart.toLocaleDateString(undefined, { year: 'numeric', month: 'long', timeZone: 'UTC' })
    const prevMonth = new Date(Date.UTC(year, month - 1, 1))
    const nextMonth = new Date(Date.UTC(year, month + 1, 1))

    const days: Date[] = []
    for (let d = new Date(gridStart); d < gridEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      days.push(new Date(d))
    }
    const todayKey = dayKey(new Date())

    return (
      <div className="flex flex-col gap-[calc(var(--base)*1.25)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)]">
        {header(totalCount)}
        <div className="flex flex-wrap items-center justify-between gap-[var(--base)]">
          {modeTabs}
          <div className="flex items-center gap-[calc(var(--base)*0.5)]">
            <Link
              href={buildHref({ view: 'calendar', month: monthKey(prevMonth) })}
              className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.3)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-700)] no-underline hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]"
            >
              ← Prev
            </Link>
            <span className="min-w-[calc(var(--base)*7)] text-center text-[calc(var(--base)*0.9)] font-medium">{monthLabel}</span>
            <Link
              href={buildHref({ view: 'calendar', month: monthKey(nextMonth) })}
              className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.3)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-700)] no-underline hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]"
            >
              Next →
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-[1px] overflow-hidden rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-150)]">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="bg-[var(--theme-elevation-50)] px-[calc(var(--base)*0.4)] py-[calc(var(--base)*0.3)] text-center text-[calc(var(--base)*0.7)] font-medium uppercase tracking-[0.04em] text-[var(--theme-elevation-600)]">
              {label}
            </div>
          ))}
          {days.map((d) => {
            const key = dayKey(d)
            const inMonth = d.getUTCMonth() === month
            const dayEvents = eventsByDay.get(key) ?? []
            return (
              <div
                key={key}
                className={`flex min-h-[calc(var(--base)*5)] flex-col gap-[calc(var(--base)*0.15)] p-[calc(var(--base)*0.3)] ${
                  inMonth ? 'bg-[var(--ac-surface)]' : 'bg-[var(--theme-elevation-50)]'
                }`}
              >
                <span
                  className={`text-[calc(var(--base)*0.72)] ${
                    key === todayKey
                      ? 'font-semibold text-[var(--ac-gold)]'
                      : inMonth
                        ? 'text-[var(--theme-elevation-700)]'
                        : 'text-[var(--theme-elevation-400)]'
                  }`}
                >
                  {d.getUTCDate()}
                </span>
                {dayEvents.map((ev) => (
                  <Link
                    key={ev.id}
                    href={`${adminRoute}/collections/${slug}/${ev.id}`}
                    className={`truncate rounded-[3px] px-[calc(var(--base)*0.25)] py-[calc(var(--base)*0.1)] text-[calc(var(--base)*0.65)] no-underline ${
                      ev.status === 'draft'
                        ? 'bg-[var(--theme-elevation-100)] text-[var(--theme-elevation-600)]'
                        : 'bg-[var(--ac-gold)] text-[var(--theme-elevation-0)]'
                    }`}
                    title={ev.title}
                  >
                    {ev.title}
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // List mode.
  const docs = data?.docs ?? []
  const page = data?.page ?? 1
  const totalPages = data?.totalPages ?? 1
  const totalDocs = data?.totalDocs ?? 0
  const pageHref = (targetPage: number) => buildHref({ page: String(targetPage) }, true)
  const sortHref = (field: string): string => {
    const next = currentSort === field ? `-${field}` : field
    return buildHref({ sort: next })
  }
  const sortIndicator = (field: string): string => {
    if (currentSort === field) return ' ↑'
    if (currentSort === `-${field}`) return ' ↓'
    return ''
  }

  return (
    <div className="flex flex-col gap-[calc(var(--base)*1.25)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)]">
      {header(totalDocs)}

      <div className="flex flex-wrap items-center justify-between gap-[var(--base)]">
        {modeTabs}
        <form method="GET" className="flex items-center gap-[calc(var(--base)*0.4)]">
          <input type="hidden" name="view" value="list" />
          {currentSort ? <input type="hidden" name="sort" value={currentSort} /> : null}
          <input
            type="search"
            name="search"
            defaultValue={currentSearch}
            placeholder="Search title..."
            className="rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-900)] outline-none focus:border-[var(--ac-gold)]"
          />
          <button
            type="submit"
            className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.78)] text-[var(--theme-elevation-700)] hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]"
          >
            Search
          </button>
          {currentSearch ? (
            <Link href={buildHref({ search: undefined })} className="text-[calc(var(--base)*0.78)] text-[var(--theme-elevation-500)] no-underline hover:text-[var(--ac-gold)]">
              Clear
            </Link>
          ) : null}
        </form>
      </div>

      {docs.length === 0 ? (
        <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
          {currentSearch ? `No events match "${currentSearch}".` : 'No events yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[4px] border border-[var(--theme-elevation-150)]">
          <table className="w-full border-collapse text-[calc(var(--base)*0.8)]">
            <thead>
              <tr className="border-b border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] text-left">
                {SORTABLE_COLUMNS.map(({ field, label }) => (
                  <th key={field} className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.5)] font-medium text-[var(--theme-elevation-600)]">
                    <Link href={sortHref(field)} className="no-underline hover:text-[var(--ac-gold)]">
                      {label}
                      {sortIndicator(field)}
                    </Link>
                  </th>
                ))}
                <th className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.5)] font-medium text-[var(--theme-elevation-600)]">Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const id = String(doc.id)
                const editHref = `${adminRoute}/collections/${slug}/${id}`
                const status = typeof doc._status === 'string' ? doc._status : ''
                return (
                  <tr key={id} className="border-b border-[var(--theme-elevation-100)] last:border-b-0 hover:bg-[var(--theme-elevation-50)]">
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)]">
                      <Link href={editHref} className="font-medium text-[var(--theme-elevation-900)] no-underline hover:text-[var(--ac-gold)]">
                        {typeof doc.title === 'string' ? doc.title : id}
                      </Link>
                    </td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{formatDate(doc.startDate)}</td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">
                      {typeof doc.eventType === 'string' ? doc.eventType : ''}
                    </td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)] capitalize">{status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-[calc(var(--base)*0.5)] pt-[calc(var(--base)*0.5)]">
          <Link
            href={data?.hasPrevPage ? pageHref(page - 1) : '#'}
            aria-disabled={!data?.hasPrevPage}
            className={`rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.7)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.8)] no-underline ${
              data?.hasPrevPage
                ? 'text-[var(--theme-elevation-700)] hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]'
                : 'pointer-events-none text-[var(--theme-elevation-300)]'
            }`}
          >
            Previous
          </Link>
          <span className="text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-600)]">
            Page {page} of {totalPages}
          </span>
          <Link
            href={data?.hasNextPage ? pageHref(page + 1) : '#'}
            aria-disabled={!data?.hasNextPage}
            className={`rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.7)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.8)] no-underline ${
              data?.hasNextPage
                ? 'text-[var(--theme-elevation-700)] hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]'
                : 'pointer-events-none text-[var(--theme-elevation-300)]'
            }`}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </div>
  )
}
