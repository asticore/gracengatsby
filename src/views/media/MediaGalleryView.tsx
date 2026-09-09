import Link from 'next/link'
import type { Payload } from 'payload'

import { MediaGalleryGrid, type GalleryDoc } from './MediaGalleryGrid'

interface MediaListData {
  docs: Array<Record<string, unknown>>
  page?: number
  totalPages?: number
  hasPrevPage?: boolean
  hasNextPage?: boolean
  totalDocs?: number
}

interface MediaGalleryViewProps {
  collectionConfig?: { slug?: string }
  data?: MediaListData
  hasCreatePermission?: boolean
  newDocumentURL?: string
  payload?: Payload
  searchParams?: Record<string, string | string[] | undefined>
}

type ViewMode = 'gallery' | 'list'

const SORTABLE_COLUMNS = [
  { field: 'filename', label: 'Filename' },
  { field: 'mimeType', label: 'Type' },
  { field: 'filesize', label: 'Size' },
  { field: 'updatedAt', label: 'Updated' },
] as const

function formatFilesize(bytes: unknown): string {
  const n = typeof bytes === 'number' ? bytes : Number(bytes)
  if (!n || n <= 0 || Number.isNaN(n)) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string') return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Custom List view for the Media collection - a thumbnail gallery OR a
 * sortable/searchable table, switched with a toggle, instead of picking one
 * and losing the other. Registered via Media.ts's
 * `admin.components.views.list.Component`.
 *
 * A prior version of this file replaced Payload's stock list outright with
 * the gallery, which lost search/sort entirely - this restores an equivalent
 * (a real table, sortable by clicking a column, searchable by filename)
 * without pulling in Payload's own client-only DefaultListView, which
 * expects a much larger prop surface (columns, listPreferences, a
 * ListQueryProvider, etc.) that this read-only server component doesn't
 * have.
 *
 * Both modes reuse the SAME already-fetched `data` - the mode toggle, sort,
 * and search are all plain links/a GET form that change the URL's
 * `view`/`sort`/`search`/`page` params, causing Payload's own list-view
 * route to re-run `payload.find()` server-side with those params (exactly
 * how the pre-existing pagination links below already worked) and re-render
 * this component with the new `data` - no client-side query state needed.
 *
 * "Different sizes" in the gallery means on-screen tile density, not
 * server-generated image variants: Media.ts deliberately leaves
 * `upload.imageSizes` unset because sharp-based resizing isn't available on
 * the Workers runtime this app deploys to (see the `crop: false,
 * focalPoint: false` note on that collection) - so every tile/row uses the
 * same original file, just displayed at different sizes via CSS, not a
 * distinct derived file.
 *
 * Rendered inside Payload's own list-view route (renderListView in
 * @payloadcms/next), which is why the props below are a subset of
 * `ListViewServerProps`/`ListViewClientProps` rather than a full import of
 * those types - only what this view needs. Because this component has no
 * 'use client' directive, Payload's RenderServerComponent detects it as a
 * real server component and merges in the server-only props (data, payload,
 * collectionConfig) alongside the always-provided client ones
 * (hasCreatePermission, newDocumentURL) - see @payloadcms/ui's
 * RenderServerComponent for that isRSC branch.
 */
export async function MediaGalleryView(props: MediaGalleryViewProps) {
  const { collectionConfig, data, hasCreatePermission, newDocumentURL, payload, searchParams } = props
  const docs = data?.docs ?? []
  const adminRoute = payload?.config?.routes?.admin ?? '/admin'
  const slug = collectionConfig?.slug ?? 'media'

  const sp = searchParams ?? {}
  const strParam = (key: string): string | undefined => {
    const value = sp[key]
    return typeof value === 'string' ? value : undefined
  }
  const view: ViewMode = strParam('view') === 'list' ? 'list' : 'gallery'
  const currentSort = strParam('sort') ?? ''
  const currentSearch = strParam('search') ?? ''

  // Builds a URL preserving every current param except the ones passed in
  // `overrides` (a key set to `undefined` removes that param). `page` is
  // dropped by default - any navigation that changes what's being viewed
  // (mode, sort, search) should land back on page 1, same as the stock list
  // view does.
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

  const galleryDocs: GalleryDoc[] = docs.map((doc) => ({
    id: String(doc.id),
    url: typeof doc.url === 'string' ? doc.url : undefined,
    filename: typeof doc.filename === 'string' ? doc.filename : undefined,
    alt: typeof doc.alt === 'string' ? doc.alt : undefined,
    mimeType: typeof doc.mimeType === 'string' ? doc.mimeType : undefined,
    filesize: typeof doc.filesize === 'number' ? doc.filesize : undefined,
    editHref: `${adminRoute}/collections/${slug}/${String(doc.id)}`,
  }))

  const page = data?.page ?? 1
  const totalPages = data?.totalPages ?? 1
  const pageHref = (targetPage: number) => buildHref({ page: String(targetPage) }, true)
  const totalDocs = data?.totalDocs ?? 0

  const sortHref = (field: string): string => {
    const next = currentSort === field ? `-${field}` : field
    return buildHref({ sort: next })
  }
  const sortIndicator = (field: string): string => {
    if (currentSort === field) return ' ↑'
    if (currentSort === `-${field}`) return ' ↓'
    return ''
  }

  const tabClass = (active: boolean) =>
    `rounded-[4px] border px-[calc(var(--base)*0.7)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.78)] font-medium no-underline [transition:border-color_0.15s_ease,color_0.15s_ease] ${
      active
        ? 'border-[var(--ac-gold)] text-[var(--ac-gold)]'
        : 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-600)] hover:border-[var(--theme-elevation-400)]'
    }`

  return (
    <div className="flex flex-col gap-[calc(var(--base)*1.25)] px-[var(--gutter-h)] pt-[calc(var(--base)*1.5)] pb-[calc(var(--base)*3)]">
      <header className="flex flex-wrap items-end justify-between gap-[var(--base)] border-b border-[var(--theme-elevation-150)] pb-[calc(var(--base)*0.75)]">
        <div>
          <h1 className="m-0 text-[calc(var(--base)*1.5)] leading-[1.2] font-semibold">Media</h1>
          <p className="mx-0 mb-0 mt-[calc(var(--base)*0.25)] text-[calc(var(--base)*0.8)] text-[var(--theme-elevation-600)]">
            {totalDocs} file{totalDocs === 1 ? '' : 's'}
          </p>
        </div>
        {hasCreatePermission && newDocumentURL ? (
          <Link
            href={newDocumentURL}
            className="inline-flex items-center gap-[calc(var(--base)*0.35)] rounded-[4px] border border-[var(--ac-gold)] px-[calc(var(--base)*0.9)] py-[calc(var(--base)*0.5)] text-[calc(var(--base)*0.82)] font-medium text-[var(--ac-gold)] no-underline [transition:background-color_0.15s_ease,color_0.15s_ease] hover:bg-[var(--ac-gold)] hover:text-[var(--theme-elevation-0)]"
          >
            Upload new
          </Link>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center justify-between gap-[var(--base)]">
        <div className="flex items-center gap-[calc(var(--base)*0.4)]">
          <Link href={buildHref({ view: undefined })} className={tabClass(view === 'gallery')}>
            Gallery
          </Link>
          <Link href={buildHref({ view: 'list' })} className={tabClass(view === 'list')}>
            List
          </Link>
        </div>

        {view === 'list' ? (
          <form method="GET" className="flex items-center gap-[calc(var(--base)*0.4)]">
            <input type="hidden" name="view" value="list" />
            {currentSort ? <input type="hidden" name="sort" value={currentSort} /> : null}
            <input
              type="search"
              name="search"
              defaultValue={currentSearch}
              placeholder="Search filename..."
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
        ) : null}
      </div>

      {galleryDocs.length === 0 ? (
        <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
          {currentSearch ? `No files match "${currentSearch}".` : 'No media uploaded yet.'}
        </p>
      ) : view === 'gallery' ? (
        <MediaGalleryGrid docs={galleryDocs} />
      ) : (
        <div className="overflow-x-auto rounded-[4px] border border-[var(--theme-elevation-150)]">
          <table className="w-full border-collapse text-[calc(var(--base)*0.8)]">
            <thead>
              <tr className="border-b border-[var(--theme-elevation-150)] bg-[var(--theme-elevation-50)] text-left">
                <th className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.5)] font-medium text-[var(--theme-elevation-600)]">Preview</th>
                {SORTABLE_COLUMNS.map(({ field, label }) => (
                  <th key={field} className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.5)] font-medium text-[var(--theme-elevation-600)]">
                    <Link href={sortHref(field)} className="no-underline hover:text-[var(--ac-gold)]">
                      {label}
                      {sortIndicator(field)}
                    </Link>
                  </th>
                ))}
                <th className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.5)] font-medium text-[var(--theme-elevation-600)]">Alt</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const id = String(doc.id)
                const editHref = `${adminRoute}/collections/${slug}/${id}`
                const url = typeof doc.url === 'string' ? doc.url : undefined
                const mimeType = typeof doc.mimeType === 'string' ? doc.mimeType : undefined
                return (
                  <tr key={id} className="border-b border-[var(--theme-elevation-100)] last:border-b-0 hover:bg-[var(--theme-elevation-50)]">
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)]">
                      <Link href={editHref} className="flex h-[calc(var(--base)*2.2)] w-[calc(var(--base)*2.2)] items-center justify-center overflow-hidden rounded-[3px] bg-[var(--theme-elevation-50)]">
                        {url && mimeType?.startsWith('image/') ? (
                          // eslint-disable-next-line @next/next/no-img-element -- thumbnail, sized via CSS (see doc comment above)
                          <img src={url} alt={typeof doc.alt === 'string' ? doc.alt : ''} loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-[calc(var(--base)*0.6)] text-[var(--theme-elevation-500)]">file</span>
                        )}
                      </Link>
                    </td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)]">
                      <Link href={editHref} className="font-medium text-[var(--theme-elevation-900)] no-underline hover:text-[var(--ac-gold)]">
                        {typeof doc.filename === 'string' ? doc.filename : id}
                      </Link>
                    </td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{mimeType ?? ''}</td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{formatFilesize(doc.filesize)}</td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{formatDate(doc.updatedAt)}</td>
                    <td className="max-w-[calc(var(--base)*14)] truncate px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">
                      {typeof doc.alt === 'string' ? doc.alt : ''}
                    </td>
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
