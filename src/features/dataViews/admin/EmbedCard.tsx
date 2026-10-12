'use client'

import React, { useRef, useState, useSyncExternalStore } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'

import { csvPath, embedPath, iframeSnippet, jsonPath, mergeTagFor, shortcodeFor } from '../embed'

const subscribe = (): (() => void) => () => {}
/** The site's own origin in the browser, and an empty string while rendering on the server (no hydration mismatch). */
const useOrigin = (): string => useSyncExternalStore(subscribe, () => window.location.origin, () => '')

function CopyRow({ label, value, multiline, help }: { label: string; value: string; multiline?: boolean; help?: string }) {
  const [copied, setCopied] = useState(false)
  const field = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null)

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Clipboard blocked: select the text so Ctrl+C works.
      field.current?.select()
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="dve-copy">
      <div className="dve-copy__label">{label}</div>
      {help ? <div className="dve-help">{help}</div> : null}
      <div className="dve-row">
        {multiline ? (
          <textarea ref={(el) => void (field.current = el)} readOnly rows={4} value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        ) : (
          <input ref={(el) => void (field.current = el)} type="text" readOnly value={value} onFocus={(e) => e.currentTarget.select()} aria-label={label} />
        )}
        <button type="button" className="dve-btn" onClick={copy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

/**
 * Share and embed options for a saved view: the public page, an iframe that resizes itself, the CSV and
 * JSON links and the text forms for pages. Shown once the view is saved, because the links need its id.
 */
export function EmbedCard({ id, slug, title, isPublic, height }: { id: number | string | undefined; slug: string; title: string; isPublic: boolean; height: number }) {
  const savedId = id !== undefined && id !== null && String(id) !== '' ? String(id) : null
  const ref = slug.trim() || savedId
  const origin = useOrigin()

  return (
    <CollapsibleCard id="data-view-embed" title="Embed and share">
      {!savedId || !ref ? (
        <p className="dve-help">Save this table or chart first. Its links appear here once it has an id.</p>
      ) : (
        <div className="dve-embed">
          <p className={isPublic ? 'dve-status dve-status--on' : 'dve-status'}>
            {isPublic
              ? 'Public: anyone with these links can see the table or chart and download its data.'
              : 'Private: these links only work for signed-in editors. Tick "Share link and data links are public" in the sidebar to share them. A table placed on a page is always shown with that page.'}
          </p>
          <CopyRow label="Share link" value={`${origin}${embedPath(ref)}`} help="A bare page with just the table or chart. Add ?theme=dark for a dark look." />
          <CopyRow label="Embed in another site (iframe)" multiline value={iframeSnippet(origin, ref, { title: title || 'Table or chart', height })} help="Paste into any HTML page. The small script makes the frame grow to fit." />
          <CopyRow label="CSV data" value={`${origin}${csvPath(ref)}`} />
          <CopyRow label="JSON data" value={`${origin}${jsonPath(ref)}`} />
          <CopyRow label="Shortcode for text" value={shortcodeFor(ref)} help="Put it alone in a paragraph of any text block or blog post." />
          <CopyRow label="Merge tag for text" value={mergeTagFor(ref)} help="Does the same as the shortcode. In the visual editor you can also add the Table or chart element." />
        </div>
      )}
    </CollapsibleCard>
  )
}
