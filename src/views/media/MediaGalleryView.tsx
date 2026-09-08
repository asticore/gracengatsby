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

/**
 * Custom List view for the Media collection - a thumbnail gallery instead of
 * Payload's stock row table, with a size toggle (small/medium/large tiles).
 * Registered via Media.ts's `admin.components.views.list.Component`.
 *
 * "Different sizes" here means on-screen tile density, not server-generated
 * image variants: Media.ts deliberately leaves `upload.imageSizes` unset
 * because sharp-based resizing isn't available on the Workers runtime this
 * app deploys to (see the `crop: false, focalPoint: false` note on that
 * collection) - so every tile is the same original file, just displayed at
 * different sizes via CSS grid-template-columns, not a distinct derived file.
 *
 * Rendered inside Payload's own list-view route (renderListView in
 * @payloadcms/next), which is why the props below are a subset of
 * `ListViewServerProps`/`ListViewClientProps` rather than a full import of
 * those types - only what a read-only gallery needs. Because this component
 * has no 'use client' directive, Payload's RenderServerComponent detects it
 * as a real server component and merges in the server-only props (data,
 * payload, collectionConfig) alongside the always-provided client ones
 * (hasCreatePermission, newDocumentURL) - see
 * @payloadcms/ui's RenderServerComponent for that isRSC branch.
 *
 * Search, sort and filter from the stock list aren't reproduced here (this
 * collection is small enough, and browsed by eye, that they haven't been
 * missed) - just pagination and a create link. If that changes, this can
 * grow into using `useListQuery`/`ListControls` like Payload's own
 * DefaultListView does, at the cost of becoming a client component.
 */
export async function MediaGalleryView(props: MediaGalleryViewProps) {
  const { collectionConfig, data, hasCreatePermission, newDocumentURL, payload, searchParams } = props
  const docs = data?.docs ?? []
  const adminRoute = payload?.config?.routes?.admin ?? '/admin'
  const slug = collectionConfig?.slug ?? 'media'

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
  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(searchParams ?? {})) {
      if (key === 'page') continue
      if (typeof value === 'string') params.set(key, value)
    }
    params.set('page', String(targetPage))
    return `?${params.toString()}`
  }

  const totalDocs = data?.totalDocs ?? 0

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

      {galleryDocs.length === 0 ? (
        <p className="m-0 rounded-[4px] border border-dashed border-[var(--theme-elevation-200)] p-[calc(var(--base)*1.25)] text-[calc(var(--base)*0.82)] text-[var(--theme-elevation-600)]">
          No media uploaded yet.
        </p>
      ) : (
        <MediaGalleryGrid docs={galleryDocs} />
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
