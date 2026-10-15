'use client'

import { useEffect, useRef, useState } from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import type { ThemeStyles } from '@/features/themeStyles/types'

import './google-connection.css'
import './themeStyles/themeStyles.css'
import { ButtonControls } from './themeStyles/ButtonControls'
import { ColourControls } from './themeStyles/ColourControls'
import { TableControls } from './themeStyles/TableControls'
import { ThemeStylesPreview } from './themeStyles/ThemeStylesPreview'
import { TypographyControls, type InstalledFontOption } from './themeStyles/TypographyControls'
import { parseImport, resetTab, type TabKey } from './themeStyles/editorLogic'

type Props = { initialStyles: ThemeStyles; saved: boolean; fonts: InstalledFontOption[] }
type Notice = { tone: 'ok' | 'error' | 'warn'; text: string }

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: 'colours', label: 'Colours' },
  { key: 'typography', label: 'Typography' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'tables', label: 'Tables' },
]

/** The Theme styles screen (/admin/theme-styles): editor on the left, live preview on the right. */
export function ThemeStylesClient({ initialStyles, saved, fonts }: Props) {
  const [styles, setStyles] = useState<ThemeStyles>(initialStyles)
  const [baseline, setBaseline] = useState<string>(() => JSON.stringify(initialStyles))
  const [tab, setTab] = useState<TabKey>('colours')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(saved ? null : { tone: 'warn', text: 'Nothing is saved yet. The site keeps its original look until you save.' })
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(styles) !== baseline

  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const save = async () => {
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch('/api/admin-theme-styles', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ styles }),
      })
      const body = (await response.json().catch((): null => null)) as { ok?: boolean; styles?: ThemeStyles; error?: string } | null
      if (response.ok && body?.ok && body.styles) {
        setStyles(body.styles)
        setBaseline(JSON.stringify(body.styles))
        setNotice({ tone: 'ok', text: 'Theme styles saved. The public site picks them up shortly.' })
      } else {
        setNotice({ tone: 'error', text: body?.error || 'The theme styles could not be saved. Try again.' })
      }
    } catch {
      setNotice({ tone: 'error', text: 'The theme styles could not be saved. Check the connection and try again.' })
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    const label = TABS.find((t) => t.key === tab)?.label ?? 'this tab'
    if (!window.confirm(`Reset ${label} to the default values? Your changes on this tab will be lost until you save.`)) return
    setStyles((current) => resetTab(current, tab))
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(styles, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'theme-styles.json'
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    const result = parseImport(await file.text())
    if (fileRef.current) fileRef.current.value = ''
    if (result.ok === false) {
      setNotice({ tone: 'error', text: result.error })
      return
    }
    setStyles(result.styles)
    setNotice({ tone: 'warn', text: 'File loaded into the editor. Review it, then choose Save changes.' })
  }

  return (
    <div className="ts-screen">
      <div className="ts-toolbar">
        <button type="button" className="ts-btn ts-btn--primary" disabled={busy || !dirty} onClick={save}>{busy ? 'Saving...' : 'Save changes'}</button>
        <button type="button" className="ts-btn" disabled={busy} onClick={reset}>Reset this tab to defaults</button>
        <span className="ts-toolbar__spacer" />
        <button type="button" className="ts-btn" onClick={exportJson}>Export</button>
        <button type="button" className="ts-btn" onClick={() => fileRef.current?.click()}>Import</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="ts-visually-hidden" aria-label="Import theme styles JSON file" tabIndex={-1} onChange={(event) => void importFile(event.target.files?.[0])} />
        {dirty && <span className="ts-notice ts-notice--warn">Unsaved changes</span>}
      </div>
      {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`ts-notice ts-notice--${notice.tone}`}>{notice.text}</p>}

      <div className="ts-layout">
        <div className="ts-main">
          <div className="ts-tabs" role="tablist" aria-label="Theme style groups">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" id={`ts-tab-${t.key}`} aria-selected={tab === t.key} aria-controls="ts-panel" className="ts-tab" onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <div id="ts-panel" role="tabpanel" aria-labelledby={`ts-tab-${tab}`}>
            <CollapsibleCard id={`theme-styles-${tab}`} title={TABS.find((t) => t.key === tab)?.label ?? ''}>
              {tab === 'colours' && <ColourControls colours={styles.colours} onChange={(colours) => setStyles({ ...styles, colours })} />}
              {tab === 'typography' && <TypographyControls typography={styles.typography} colours={styles.colours} fonts={fonts} onChange={(typography) => setStyles({ ...styles, typography })} />}
              {tab === 'buttons' && <ButtonControls buttons={styles.buttons} colours={styles.colours} onChange={(buttons) => setStyles({ ...styles, buttons })} />}
              {tab === 'tables' && <TableControls styles={styles} colours={styles.colours} onChange={setStyles} />}
            </CollapsibleCard>
          </div>
        </div>
        <aside className="ts-aside" aria-label="Live preview">
          <h2 className="ts-aside__title">Live preview</h2>
          <ThemeStylesPreview styles={styles} tab={tab} />
          <p className="ts-help">The preview shows your edits before they are saved.</p>
        </aside>
      </div>
    </div>
  )
}