'use client'

import Link from 'next/link'
import { useState } from 'react'

export interface GalleryDoc {
  id: string
  url?: string
  filename?: string
  alt?: string
  mimeType?: string
  filesize?: number
  editHref: string
}

type TileSize = 'sm' | 'md' | 'lg'

const TILE_MIN_WIDTH: Record<TileSize, string> = {
  sm: '120px',
  md: '180px',
  lg: '260px',
}

const STORAGE_KEY = 'engage-media-gallery-tile-size'

function formatFilesize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readStoredSize(): TileSize {
  // Runs inside useState's lazy initializer (see below), not an effect -
  // a previous version restored this via useEffect + setState, which
  // eslint-plugin-react-hooks' set-state-in-effect rule now rejects as a
  // build error (React 19: setState called synchronously in an effect body
  // risks a cascading render). A lazy initializer reads the same value
  // during the component's own first render instead, so there's no extra
  // render to cascade from. `typeof window === 'undefined'` covers this
  // component's server-side render pass (it has no 'use client' escape from
  // SSR, just from Server Components); the resulting SSR-vs-client mismatch
  // is silenced below with `suppressHydrationWarning` on the one element
  // whose layout depends on `size`, same as any other localStorage-backed
  // preference in a Next.js app.
  if (typeof window === 'undefined') return 'md'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored === 'sm' || stored === 'md' || stored === 'lg') return stored
  } catch {
    // localStorage can throw in locked-down browser contexts - fall through to the default.
  }
  return 'md'
}

/**
 * The interactive half of MediaGalleryView: a size toggle (persisted in
 * localStorage per-browser, the same idea as Payload's own list-view column
 * preferences) plus the actual thumbnail grid. Split into its own client
 * component so the parent view can stay an async server component and avoid
 * shipping the whole doc list through a client-serialization boundary twice.
 */
export function MediaGalleryGrid({ docs }: { docs: GalleryDoc[] }) {
  const [size, setSize] = useState<TileSize>(readStoredSize)

  const chooseSize = (next: TileSize) => {
    setSize(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Ignore - persistence is a convenience, not a requirement.
    }
  }

  return (
    <div className="flex flex-col gap-[calc(var(--base)*0.75)]">
      <div className="flex items-center gap-[calc(var(--base)*0.25)] self-end">
        {(['sm', 'md', 'lg'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => chooseSize(option)}
            aria-pressed={size === option}
            suppressHydrationWarning
            className={`rounded-[4px] border px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.25)] text-[calc(var(--base)*0.72)] uppercase tracking-[0.04em] [transition:border-color_0.15s_ease,color_0.15s_ease] ${
              size === option
                ? 'border-[var(--ac-gold)] text-[var(--ac-gold)]'
                : 'border-[var(--theme-elevation-200)] text-[var(--theme-elevation-600)] hover:border-[var(--theme-elevation-400)]'
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      <div
        className="grid gap-[calc(var(--base)*0.6)]"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN_WIDTH[size]}, 1fr))` }}
        suppressHydrationWarning
      >
        {docs.map((doc) => (
          <Link
            key={doc.id}
            href={doc.editHref}
            className="group flex flex-col overflow-hidden rounded-[4px] border border-[var(--theme-elevation-150)] bg-[var(--ac-surface)] no-underline [transition:border-color_0.15s_ease] hover:border-[var(--ac-gold)]"
          >
            <div className="flex aspect-square items-center justify-center overflow-hidden bg-[var(--theme-elevation-50)]">
              {doc.url && doc.mimeType?.startsWith('image/') ? (
                // eslint-disable-next-line @next/next/no-img-element -- external/proxied original, sized on-screen via CSS rather than a fixed next/image variant (see MediaGalleryView doc comment)
                <img
                  src={doc.url}
                  alt={doc.alt ?? doc.filename ?? ''}
                  loading="lazy"
                  className="h-full w-full object-cover [transition:transform_0.15s_ease] group-hover:scale-105"
                />
              ) : (
                <span className="px-[calc(var(--base)*0.3)] text-center text-[calc(var(--base)*0.7)] text-[var(--theme-elevation-500)]">
                  {doc.mimeType ?? 'file'}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-[calc(var(--base)*0.1)] px-[calc(var(--base)*0.5)] py-[calc(var(--base)*0.4)]">
              <span className="truncate text-[calc(var(--base)*0.72)] font-medium text-[var(--theme-elevation-900)]">
                {doc.filename ?? doc.id}
              </span>
              {doc.filesize ? (
                <span className="text-[calc(var(--base)*0.65)] text-[var(--theme-elevation-500)]">
                  {formatFilesize(doc.filesize)}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
