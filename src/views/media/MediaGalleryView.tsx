import Link from 'next/link'
import type { Engine } from '@/engine'

import { IMAGES_UNAVAILABLE_MESSAGE, resolveOptimiseSettings } from '@/features/media/optimise'
import { resolveImagesBinding } from '@/features/media/imagesBinding'
import { distinctFolders } from '@/features/media/folders'
import { describeSaving, formatBytes } from '@/features/media/admin/mediaApi'

import { MediaGalleryGrid, type GalleryDoc } from './MediaGalleryGrid'

/** The slice of the engine this view reads. Typed loosely so it does not depend on the engine's generics. */
type MediaFinder = {
  find: (args: Record<string, unknown>) => Promise<{
    docs: Array<Record<string, unknown>>
    totalDocs?: number
    page?: number
    totalPages?: number
    hasPrevPage?: boolean
    hasNextPage?: boolean
  }>
  findGlobal?: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>
}

/** Folder-filtered pages are read here; this many pictures to a page. */
const FOLDER_PAGE_SIZE = 48

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
  engine?: Engine
  searchParams?: Record<string, string | string[] | undefined>
  embedded?: boolean
}

type ViewMode = 'gallery' | 'list'

const SORTABLE_COLUMNS = [
  { field: 'filename', label: 'Filename' },
  { field: 'mimeType', label: 'Type' },
  { field: 'filesize', label: 'Size' },
  { field: 'updatedAt', label: 'Updated' },
] as const

function formatFilesize(bytes: unknown): string {
  return formatBytes(typeof bytes === 'number' ? bytes : Number(bytes))
}

/** Size column for the list: the stored size, plus the saving once a picture has been optimised. */
function sizeText(doc: Record<string, unknown>): string {
  const original = typeof doc.originalSize === 'number' ? doc.originalSize : null
  const optimised = typeof doc.optimizedSize === 'number' ? doc.optimizedSize : null
  if (original && optimised && original !== optimised) return describeSaving(original, optimised)
  return formatFilesize(doc.filesize)
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
 * A prior version of this file replaced the original engine's stock list outright with
 * the gallery, which lost search/sort entirely - this restores an equivalent
 * (a real table, sortable by clicking a column, searchable by filename)
 * without pulling in the original engine's own client-only DefaultListView, which
 * expects a much larger prop surface (columns, listPreferences, a
 * ListQueryProvider, etc.) that this read-only server component doesn't
 * have.
 *
 * Both modes reuse the SAME already-fetched `data` - the mode toggle, sort,
 * and search are all plain links/a GET form that change the URL's
 * `view`/`sort`/`search`/`page` params, causing the original engine's own list-view
 * route to re-run `engine.find()` server-side with those params (exactly
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
 * Rendered inside the original engine's own list-view route (renderListView in
 * the vendor package), which is why the props below are a subset of
 * `ListViewServerProps`/`ListViewClientProps` rather than a full import of
 * those types - only what this view needs. Because this component has no
 * 'use client' directive, the original engine's RenderServerComponent detects it as a
 * real server component and merges in the server-only props (data, engine,
 * collectionConfig) alongside the always-provided client ones
 * (hasCreatePermission, newDocumentURL) - see the vendor package's
 * RenderServerComponent for that isRSC branch.
 */
export async function MediaGalleryView(props: MediaGalleryViewProps) {
  const { collectionConfig, data, hasCreatePermission, newDocumentURL, engine, searchParams, embedded } = props
  const adminRoute = engine?.config?.routes?.admin ?? '/admin'
  const slug = collectionConfig?.slug ?? 'media'
  const finder = engine as unknown as MediaFinder | undefined

  const sp = searchParams ?? {}
  const strParam = (key: string): string | undefined => {
    const value = sp[key]
    return typeof value === 'string' ? value : undefined
  }
  const view: ViewMode = strParam('view') === 'list' ? 'list' : 'gallery'
  const currentSort = strParam('sort') ?? ''
  const currentSearch = strParam('search') ?? ''
  const currentFolder = (strParam('folder') ?? '').trim()

  // The engine's own list has no folder filter, so a folder view is read here
  // with a where clause on the folder column. Everything else uses `data`.
  let docs: Array<Record<string, unknown>> = data?.docs ?? []
  let pager = {
    page: data?.page ?? 1,
    totalPages: data?.totalPages ?? 1,
    hasPrevPage: data?.hasPrevPage ?? false,
    hasNextPage: data?.hasNextPage ?? false,
    totalDocs: data?.totalDocs ?? 0,
  }
  if (currentFolder && finder) {
    const requested = Math.max(1, Number(strParam('page') ?? '1') || 1)
    const result = await finder.find({
      collection: slug,
      where: { folder: { equals: currentFolder } },
      limit: FOLDER_PAGE_SIZE,
      page: requested,
      depth: 0,
      pagination: true,
      sort: '-updatedAt',
    })
    docs = result.docs
    pager = {
      page: result.page ?? requested,
      totalPages: result.totalPages ?? 1,
      hasPrevPage: Boolean(result.hasPrevPage),
      hasNextPage: Boolean(result.hasNextPage),
      totalDocs: result.totalDocs ?? docs.length,
    }
  }

  // Folder list and optimisation state, read once for the filter and the bulk tools.
  let folders: string[] = []
  if (finder) {
    const all = await finder
      .find({ collection: slug, limit: 1000, page: 1, depth: 0, pagination: true })
      .catch((): { docs: Array<Record<string, unknown>> } => ({ docs: [] }))
    folders = distinctFolders(all.docs as Array<{ folder?: string | null }>)
  }
  const settings = resolveOptimiseSettings(
    finder?.findGlobal ? await finder.findGlobal({ slug: 'media-settings', depth: 0 }).catch((): null => null) : null,
  )
  const binding = settings.enabled ? await resolveImagesBinding() : null
  const noticeFromServer = settings.enabled && !binding ? IMAGES_UNAVAILABLE_MESSAGE : undefined

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
    folder: typeof doc.folder === 'string' ? doc.folder : undefined,
    originalSize: typeof doc.originalSize === 'number' ? doc.originalSize : undefined,
    optimizedSize: typeof doc.optimizedSize === 'number' ? doc.optimizedSize : undefined,
  }))

  const page = pager.page
  const totalPages = pager.totalPages
  const pageHref = (targetPage: number) => buildHref({ page: String(targetPage) }, true)
  const totalDocs = pager.totalDocs

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
      {!embedded && (
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
      )}

      {!embedded && (
        <div className="flex flex-wrap items-center justify-between gap-[var(--base)]">
          <div className="flex items-center gap-[calc(var(--base)*0.4)]">
            <Link href={buildHref({ view: undefined })} className={tabClass(view === 'gallery')}>
              Gallery
            </Link>
            <Link href={buildHref({ view: 'list' })} className={tabClass(view === 'list')}>
              List
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-[calc(var(--base)*0.4)]">
            {folders.length > 0 ? (
              <form method="GET" className="flex items-center gap-[calc(var(--base)*0.4)]">
                {view === 'list' ? <input type="hidden" name="view" value="list" /> : null}
                {currentSort ? <input type="hidden" name="sort" value={currentSort} /> : null}
                {currentSearch ? <input type="hidden" name="search" value={currentSearch} /> : null}
                <label className="text-[calc(var(--base)*0.78)] text-[var(--theme-elevation-600)]">
                  Folder
                  <select
                    name="folder"
                    defaultValue={currentFolder}
                    className="ml-[calc(var(--base)*0.4)] rounded-[4px] border border-[var(--theme-elevation-200)] bg-transparent px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-900)]"
                  >
                    <option value="">All folders</option>
                    {folders.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="submit"
                  className="rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.78)] text-[var(--theme-elevation-700)] hover:border-[var(--ac-gold)] hover:text-[var(--ac-gold)]"
                >
                  Show
                </button>
              </form>
            ) : null}

          {view === 'list' ? (
            <form method="GET" className="flex items-center gap-[calc(var(--base)*0.4)]">
              <input type="hidden" name="view" value="list" />
              {currentFolder ? <input type="hidden" name="folder" value={currentFolder} /> : null}
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
        </div>
      )}

      {galleryDocs.length === 0 ? (
        <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
          {currentSearch ? `No files match "${currentSearch}".` : 'No media uploaded yet.'}
        </p>
      ) : embedded || view === 'gallery' ? (
        <MediaGalleryGrid
          docs={galleryDocs}
          folders={folders}
          currentFolder={currentFolder}
          batchSize={settings.batchSize}
          optimisationOn={settings.enabled}
          noticeFromServer={noticeFromServer}
        />
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
                <th className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.5)] font-medium text-[var(--theme-elevation-600)]">Folder</th>
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
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{sizeText(doc)}</td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{formatDate(doc.updatedAt)}</td>
                    <td className="px-[calc(var(--base)*0.6)] py-[calc(var(--base)*0.4)] text-[var(--theme-elevation-600)]">{typeof doc.folder === 'string' ? doc.folder : ''}</td>
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

      {!embedded && totalPages > 1 ? (
        <nav className="flex items-center justify-center gap-[calc(var(--base)*0.5)] pt-[calc(var(--base)*0.5)]">
          <Link
            href={pager.hasPrevPage ? pageHref(page - 1) : '#'}
            aria-disabled={!pager.hasPrevPage}
            className={`rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.7)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.8)] no-underline ${
              pager.hasPrevPage
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
            href={pager.hasNextPage ? pageHref(page + 1) : '#'}
            aria-disabled={!pager.hasNextPage}
            className={`rounded-[4px] border border-[var(--theme-elevation-200)] px-[calc(var(--base)*0.7)] py-[calc(var(--base)*0.35)] text-[calc(var(--base)*0.8)] no-underline ${
              pager.hasNextPage
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
