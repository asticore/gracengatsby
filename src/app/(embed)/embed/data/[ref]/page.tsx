import React from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { canReadPrivateViews } from '@/features/dataViews/access'
import { DataViewView } from '@/features/dataViews/components/DataViewView'
import { RESIZE_SCRIPT } from '@/features/dataViews/embed'
import { loadDataView } from '@/features/dataViews/load'

/** A private view only shows to a signed-in reader; if another origin frames it, the content is removed. */
const FRAME_GUARD_SCRIPT = "(function(){if(parent===window)return;try{void parent.location.href}catch(e){var m=document.getElementById('dv-embed-main');if(m)m.textContent='This table or chart is private.'}})();"

export const dynamic = 'force-dynamic'

// An embed is a fragment for other pages, not something to index on its own.
export const metadata: Metadata = { title: 'Table or chart', robots: { index: false, follow: false } }

/**
 * /embed/data/<id-or-slug>: just the table or chart, themed from the site settings. Public only when the
 * view is marked public; otherwise it is a plain 404 unless a signed-in person who may read Tables and
 * charts opens it. `?theme=dark` gives the dark look. The page tells a parent window how tall it is
 * (postMessage), which the iframe snippet from the editor listens for.
 */
export default async function EmbedDataPage({ params, searchParams }: { params: Promise<{ ref: string }>; searchParams: Promise<{ theme?: string }> }) {
  const { ref } = await params
  const { theme } = await searchParams

  let result = await loadDataView(ref, { requirePublic: true })
  if (result.status === 'private') {
    if (!(await canReadPrivateViews())) notFound()
    result = await loadDataView(ref, { requirePublic: false })
  }
  if (result.status !== 'ok') notFound()

  const isPrivate = !result.def.isPublic
  return (
    <main className="dv-embed" data-theme={theme === 'dark' ? 'dark' : 'light'} id="dv-embed-main">
      <DataViewView model={result.model} />
      {isPrivate ? <script dangerouslySetInnerHTML={{ __html: FRAME_GUARD_SCRIPT }} /> : null}
      <script dangerouslySetInnerHTML={{ __html: RESIZE_SCRIPT }} />
    </main>
  )
}
