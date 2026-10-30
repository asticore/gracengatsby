'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

import { DomainNotice } from './DomainNotice'
import type { TrackingDomainInfo } from './domains'
import { TagEditor } from './TagEditor'

export type TagEditorButtonProps = {
  domains: TrackingDomainInfo[]
  currentHost: string | null
  adminRoot: string
  siteCurrency?: string | null
}

/**
 * The prominent "Add tags" button on Settings > Tracking. Opens the full-screen visual tag editor. The tracking events
 * table links here as `?tags=open&event=<id>`: the editor then opens on that event's page with the event selected.
 */
export function TagEditorButton({ domains, currentHost, adminRoot, siteCurrency = null }: TagEditorButtonProps): React.ReactElement {
  const t = useAdminT()
  // The URL is read from the browser: `?tags=open&event=<id>` opens the editor, on the event when one is named.
  const search = useSyncExternalStore(() => () => {}, () => window.location.search, () => '')
  const requested = new URLSearchParams(search)
  const fromLink = requested.get('tags') === 'open'
  const linkedId = Number(requested.get('event'))
  const linkedEventId = Number.isInteger(linkedId) && linkedId > 0 ? linkedId : null
  const [closed, setClosed] = useState(false)
  const [manual, setManual] = useState<{ event: number | null } | null>(null)
  const open = manual !== null || (fromLink && !closed)
  const initialEventId = manual ? manual.event : linkedEventId

  useEffect(() => {
    if (!fromLink) return
    // Take the parameters out of the address bar, so a reload does not reopen the editor.
    const params = new URLSearchParams(window.location.search)
    params.delete('tags')
    params.delete('event')
    const query = params.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  }, [fromLink])

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div>
        <button type="button" className="btn btn--style-primary" onClick={() => setManual({ event: null })}>
          {t('tracking.tags.button')}
        </button>
      </div>
      <DomainNotice domains={domains} currentHost={currentHost} adminRoot={adminRoot} />
      {open ? <TagEditor onClose={() => { setManual(null); setClosed(true) }} initialEventId={initialEventId} domains={domains} currentHost={currentHost} adminRoot={adminRoot} siteCurrency={siteCurrency} /> : null}
    </div>
  )
}
