'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

import { AdminLink } from '@/admin/adminRoute/AdminLink'
import { collectionRoute } from '@/admin/adminPaths'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'

import { validateTrackingEvent, urlMatches, type TrackingEventDef, type UrlMatchMode } from '../events'
import { normaliseRulePath, pathOnly } from '../urlRule'
import { bestSelector } from '../picker/selector'
import { defaultTrigger, elementMatches, isActionElement, linkOf, matchingElements, suggestFor } from './frameDom'
import { TAG_OPTIONS, optionForRow, tagOptionDef } from './options'
import { DomainNotice } from './DomainNotice'
import { isMultiDomain, type TrackingDomainInfo } from './domains'
import { tagPagePath } from './tagPage'
import type { Suggestion, TagOption } from './suggest'

/**
 * The visual tag editor: the live site in a same-origin frame, with a page finder, a Browse and Select mode, the tags
 * already on the page outlined with a badge, and a side panel that saves a tracking event for this URL rule. Nothing
 * a visitor could trigger is sent: the editor's own session is an admin session, which the tracking runtime suppresses,
 * and in Browse mode buttons and forms do nothing (links still navigate, so the admin can move around the site).
 */

type Mode = 'browse' | 'select'
type TagRow = {
  id: number
  name: string
  platformEvent: string
  triggerType: string
  selector: string | null
  urlMatchMode: string | null
  urlMatch: string | null
  value: number | null
  currency: string | null
  enabled: boolean
}
type FinderPage = { kind: 'page' | 'post' | 'product' | 'shop' | 'cart' | 'checkout'; title: string; path: string }
type Picked = { element: Element; selector: string; matches: number; suggestion: Suggestion | null }
type FormState = { option: TagOption; name: string; trigger: 'click' | 'submit'; value: string; currency: string }
type Box = { left: number; top: number; width: number; height: number }
type Badge = Box & { key: string; tag: TagRow }

const HOME = '/'
const TOAST_MS = 3500
const FINDER_LIMIT = 60

const onThisPage = (tag: TagRow, path: string): boolean =>
  Boolean(tag.selector) && urlMatches({ urlMatchMode: (tag.urlMatchMode as UrlMatchMode | null) ?? 'any', urlMatch: tag.urlMatch }, path)

const SUGGEST_REASON: Record<Suggestion['reason'], UiStringKey> = {
  text: 'tracking.tags.reason.text',
  href: 'tracking.tags.reason.href',
  form: 'tracking.tags.reason.form',
}

export type TagEditorProps = {
  onClose: () => void
  /** An event to open on arrival: the editor loads its page and selects it. */
  initialEventId?: number | null
  domains: TrackingDomainInfo[]
  currentHost: string | null
  adminRoot: string
}

/** The edit form for a saved tag. */
function formForTag(tag: TagRow): FormState {
  return {
    option: optionForRow(tag.platformEvent, tag.name),
    name: tag.name,
    trigger: tag.triggerType === 'submit' ? 'submit' : 'click',
    value: tag.value == null ? '' : String(tag.value),
    currency: tag.currency ?? '',
  }
}

export function TagEditor({ onClose, initialEventId = null, domains, currentHost, adminRoot }: TagEditorProps): React.ReactElement {
  const t = useAdminT()
  const frameRef = useRef<HTMLIFrameElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  // Refs the framed page's listeners read, so they always see the current mode, tags and path.
  const modeRef = useRef<Mode>('browse')
  const testRef = useRef(false)
  const tagsRef = useRef<TagRow[]>([])
  const pathRef = useRef(HOME)
  const refreshRef = useRef<() => void>(() => undefined)
  const pickRef = useRef<(el: Element) => void>(() => undefined)
  const tagHitRef = useRef<(el: Element) => TagRow | null>(() => null)
  const flashRef = useRef<(message: string) => void>(() => undefined)

  // The frame loads once the page to show is known: the home page, or the page of the event being opened.
  const [nav, setNav] = useState<{ path: string | null; n: number }>({ path: initialEventId ? null : HOME, n: 0 })
  const [currentPath, setCurrentPath] = useState(HOME)
  const [loadError, setLoadError] = useState(false)
  const [mode, setMode] = useState<Mode>('browse')
  const [testMode, setTestMode] = useState(false)
  const [tags, setTags] = useState<TagRow[]>([])
  const [badges, setBadges] = useState<Badge[]>([])
  const [hover, setHover] = useState<Box | null>(null)
  const [pages, setPages] = useState<FinderPage[]>([])
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<Picked | null>(null)
  const [editing, setEditing] = useState<TagRow | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' | 'error'; message?: string }>({ kind: 'idle' })
  const [toast, setToast] = useState<string | null>(null)

  const changeMode = (next: Mode) => {
    setMode(next)
    setHover(null)
  }

  const setPath = (path: string) => {
    pathRef.current = path
    setCurrentPath(path)
  }

  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    testRef.current = testMode
  }, [testMode])
  useEffect(() => {
    tagsRef.current = tags
    refreshRef.current()
  }, [tags])
  useEffect(() => {
    refreshRef.current()
  }, [currentPath])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const [eventsRes, pagesRes] = await Promise.all([
          fetch('/api/admin-tracking-events', { credentials: 'same-origin' }),
          fetch('/api/admin-tracking-pages', { credentials: 'same-origin' }),
        ])
        if (!alive) return
        if (eventsRes.ok) {
          const events = ((await eventsRes.json()) as { events: TagRow[] }).events
          setTags(events)
          const target = initialEventId ? events.find((tag) => tag.id === initialEventId) : undefined
          if (target) {
            setNav((prev) => ({ path: tagPagePath(target), n: prev.n + 1 }))
            setEditing(target)
            setForm(formForTag(target))
          } else {
            setNav((prev) => (prev.path === null ? { path: HOME, n: prev.n + 1 } : prev))
          }
        }
        if (pagesRes.ok) setPages(((await pagesRes.json()) as { pages: FinderPage[] }).pages)
      } catch {
        if (alive) setStatus({ kind: 'error', message: t('tracking.tags.loadFailed') })
      }
    })()
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }
    const onResize = () => refreshRef.current()
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onResize)
    }
    // Loaded once when the editor opens; the lists are refreshed after each save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const reloadTags = async () => {
    const res = await fetch('/api/admin-tracking-events', { credentials: 'same-origin' })
    if (res.ok) setTags(((await res.json()) as { events: TagRow[] }).events)
  }

  // Draws the badges and outlines for the tags on the current page, over the frame. Reads the framed page only.
  const refresh = () => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    const box = containerRef.current?.getBoundingClientRect()
    const fr = frame?.getBoundingClientRect()
    if (!doc || !box || !fr) {
      setBadges([])
      return
    }
    const offX = fr.left - box.left
    const offY = fr.top - box.top
    const next: Badge[] = []
    for (const tag of tagsRef.current) {
      if (!onThisPage(tag, pathRef.current) || !tag.selector) continue
      for (const el of matchingElements(doc, tag.selector).slice(0, 30)) {
        const r = el.getBoundingClientRect()
        next.push({ key: `${tag.id}-${next.length}`, tag, left: r.left + offX, top: r.top + offY, width: r.width, height: r.height })
      }
    }
    setBadges(next)
  }

  const boxOf = (el: Element): Box | null => {
    const frame = frameRef.current
    const box = containerRef.current?.getBoundingClientRect()
    const fr = frame?.getBoundingClientRect()
    if (!box || !fr) return null
    const r = el.getBoundingClientRect()
    return { left: r.left + fr.left - box.left, top: r.top + fr.top - box.top, width: r.width, height: r.height }
  }

  const flash = (message: string) => setToast(message)

  const openNew = (el: Element) => {
    const best = bestSelector(el)
    if (!best) return
    const suggestion = suggestFor(el)
    const option = suggestion?.option ?? 'custom'
    setEditing(null)
    setConfirmDelete(false)
    setPicked({ element: el, selector: best.selector, matches: best.matches, suggestion })
    setForm({ option, name: tagOptionDef(option).defaultName, trigger: defaultTrigger(el), value: '', currency: '' })
    setStatus({ kind: 'idle' })
  }

  const openEdit = (tag: TagRow) => {
    setPicked(null)
    setConfirmDelete(false)
    setEditing(tag)
    setForm(formForTag(tag))
    setStatus({ kind: 'idle' })
  }

  const tagHit = (el: Element): TagRow | null =>
    tagsRef.current.find((tag) => onThisPage(tag, pathRef.current) && tag.selector && elementMatches(el, tag.selector)) ?? null

  // The listeners on the framed page call these through refs, so they always run the latest version. Set after each render.
  useEffect(() => {
    refreshRef.current = refresh
    pickRef.current = openNew
    tagHitRef.current = tagHit
    flashRef.current = flash
  })

  // Runs each time the frame finishes loading a page (a first load, a finder jump, or a link the admin followed).
  const handleLoad = () => {
    const frame = frameRef.current
    const win = frame?.contentWindow
    const doc = frame?.contentDocument
    if (!frame || !win || !doc) {
      setLoadError(true)
      return
    }
    setLoadError(false)
    setPath(pathOnly(win.location.pathname + win.location.search))

    const onClick = (ev: MouseEvent) => {
      const el = ev.target as Element | null
      if (!el || typeof el.closest !== 'function') return
      if (modeRef.current === 'select') {
        ev.preventDefault()
        ev.stopPropagation()
        pickRef.current(el)
        return
      }
      const hit = tagHitRef.current(el)
      if (testRef.current && hit) {
        ev.preventDefault()
        ev.stopPropagation()
        flashRef.current(t('tracking.tags.testFired', { name: hit.name }))
        return
      }
      if (linkOf(el)) return
      if (isActionElement(el)) {
        ev.preventDefault()
        ev.stopPropagation()
        flashRef.current(t('tracking.tags.blocked'))
      }
    }
    const onSubmit = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
      flashRef.current(t('tracking.tags.blocked'))
    }
    const onMove = (ev: MouseEvent) => {
      if (modeRef.current !== 'select') return
      const el = ev.target as Element | null
      if (!el || typeof el.getBoundingClientRect !== 'function') return
      setHover(boxOf(el))
    }
    doc.addEventListener('click', onClick, true)
    doc.addEventListener('submit', onSubmit, true)
    doc.addEventListener('mouseover', onMove, true)
    win.addEventListener('scroll', () => refreshRef.current(), { passive: true })
    refreshRef.current()
  }

  const onThisPageTags = tags.filter((tag) => onThisPage(tag, currentPath))
  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? pages.filter((p) => p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)) : pages
    return list.slice(0, FINDER_LIMIT)
  }, [pages, query])

  const go = (path: string) => {
    setPicked(null)
    setEditing(null)
    setForm(null)
    setLoadError(false)
    setNav((prev) => ({ path, n: prev.n + 1 }))
  }

  const selectorInUse = editing?.selector ?? picked?.selector ?? null
  const panelOpen = Boolean(form && (editing || picked))

  const save = async () => {
    if (!form || !selectorInUse) return
    const option = tagOptionDef(form.option)
    const def: TrackingEventDef = {
      name: form.name.trim(),
      platformEvent: option.platformEvent,
      triggerType: form.trigger,
      selector: selectorInUse,
      urlMatchMode: editing ? ((editing.urlMatchMode as UrlMatchMode | null) ?? 'exact') : 'exact',
      urlMatch: editing ? editing.urlMatch : normaliseRulePath(currentPath),
      value: form.value.trim() === '' ? null : Number(form.value),
      currency: form.currency.trim().toUpperCase() || null,
      enabled: true,
    }
    const errors = validateTrackingEvent(def)
    if (errors.length) {
      setStatus({ kind: 'error', message: errors.join(' ') })
      return
    }
    setStatus({ kind: 'saving' })
    try {
      const response = await fetch(editing ? `/api/admin-tracking-events/${editing.id}` : '/api/admin-tracking-events', {
        method: editing ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(def),
      })
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string }
        setStatus({ kind: 'error', message: body.error ?? t('tracking.tags.saveFailed') })
        return
      }
      await reloadTags()
      setPicked(null)
      setEditing(null)
      setForm(null)
      setStatus({ kind: 'saved', message: t('tracking.tags.saved') })
    } catch {
      setStatus({ kind: 'error', message: t('tracking.tags.saveFailed') })
    }
  }

  const remove = async () => {
    if (!editing) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      const response = await fetch(`/api/admin-tracking-events/${editing.id}`, { method: 'DELETE', credentials: 'same-origin' })
      if (!response.ok) {
        setStatus({ kind: 'error', message: t('tracking.tags.saveFailed') })
        return
      }
      await reloadTags()
      setEditing(null)
      setForm(null)
      setConfirmDelete(false)
      setStatus({ kind: 'saved', message: t('tracking.tags.deleted') })
    } catch {
      setStatus({ kind: 'error', message: t('tracking.tags.saveFailed') })
    }
  }

  const suggestion = picked?.suggestion ?? null
  const panelErrors = form && selectorInUse ? validateTrackingEvent({
    name: form.name.trim(),
    platformEvent: tagOptionDef(form.option).platformEvent,
    triggerType: form.trigger,
    selector: selectorInUse,
    value: form.value.trim() === '' ? null : Number(form.value),
    currency: form.currency.trim().toUpperCase() || null,
  }) : []

  return (
    <div role="dialog" aria-modal="true" aria-label={t('tracking.tags.title')} style={{ position: 'fixed', inset: 0, zIndex: 10000, background: '#f3f4f6', display: 'flex', flexDirection: 'column', font: '14px/1.4 system-ui, sans-serif', color: '#111827' }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <strong style={{ fontSize: 16 }}>{t('tracking.tags.title')}</strong>
        <span style={{ color: '#6b7280' }}>{t('tracking.tags.intro')}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <AdminLink path={collectionRoute('tracking-events')}>{t('tracking.tags.openEvents')}</AdminLink>
          <button type="button" className="btn btn--style-secondary" onClick={onClose}>{t('tracking.tags.close')}</button>
        </div>
      </header>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '8px 16px', background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        <button type="button" className="btn btn--style-secondary" onClick={() => go(HOME)}>{t('tracking.tags.home')}</button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#6b7280' }}>{t('tracking.tags.urlBar')}</span>
          <input readOnly aria-label={t('tracking.tags.urlBar')} value={currentPath} style={{ minWidth: 220, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4, background: '#f9fafb' }} />
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('tracking.tags.finder')}
            aria-label={t('tracking.tags.finder')}
            style={{ width: 280, padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: 4 }}
          />
          {query.trim() ? (
            <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1, maxHeight: 320, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none', background: '#fff', border: '1px solid #d1d5db', borderRadius: 4 }}>
              {results.length === 0 ? <li style={{ padding: 8, color: '#6b7280' }}>{t('tracking.tags.finderEmpty')}</li> : null}
              {results.map((p) => (
                <li key={`${p.kind}-${p.path}`}>
                  <button type="button" onClick={() => { go(p.path); setQuery('') }} style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 8px', background: 'none', border: 0, cursor: 'pointer' }}>
                    {p.title} <span style={{ color: '#6b7280' }}>{p.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <div role="group" aria-label={t('tracking.tags.modeLabel')} style={{ display: 'flex' }}>
          <button type="button" aria-pressed={mode === 'browse'} onClick={() => changeMode('browse')} style={segment(mode === 'browse')}>{t('tracking.tags.modeBrowse')}</button>
          <button type="button" aria-pressed={mode === 'select'} onClick={() => changeMode('select')} style={segment(mode === 'select')}>{t('tracking.tags.modeSelect')}</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={t('tracking.tags.testHint')}>
          <input type="checkbox" checked={testMode} onChange={(e) => setTestMode(e.target.checked)} /> {t('tracking.tags.testMode')}
        </label>
        <span style={{ marginLeft: 'auto', fontWeight: 600 }}>
          {onThisPageTags.length ? t('tracking.tags.tagsOnPage', { count: onThisPageTags.length }) : t('tracking.tags.noTags')}
        </span>
        {status.kind === 'saved' ? <span style={{ color: '#15803d' }}>{status.message}</span> : null}
      </div>
      <div style={{ padding: '4px 16px', color: '#6b7280', fontSize: 12, background: '#fff', borderBottom: '1px solid #e5e7eb' }}>
        {isMultiDomain(domains) ? <DomainNotice domains={domains} currentHost={currentHost} adminRoot={adminRoot} /> : t('tracking.tags.domainNote')}
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} style={{ position: 'relative', flex: 1, minWidth: 0, overflow: 'hidden', background: '#fff' }}>
          {nav.path === null ? <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#6b7280' }}>{t('tracking.tags.opening')}</div> : null}
          {nav.path !== null ? <iframe
            key={nav.n}
            ref={frameRef}
            src={nav.path}
            title={t('tracking.tags.title')}
            onLoad={handleLoad}
            style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
          /> : null}
          {loadError ? (
            <div role="alert" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', background: '#fff' }}>
              <p>{t('tracking.tags.loadFailed')}</p>
            </div>
          ) : null}
          {badges.map((b) => (
            <div key={b.key} aria-hidden="true" style={{ position: 'absolute', left: b.left, top: b.top, width: b.width, height: b.height, outline: `${b.tag.id === initialEventId ? 4 : 2}px solid ${b.tag.enabled ? '#16a34a' : '#9ca3af'}`, pointerEvents: 'none' }} />
          ))}
          {badges.map((b) => (
            <button
              key={`badge-${b.key}`}
              type="button"
              title={t('tracking.tags.badgeHint')}
              onClick={() => openEdit(b.tag)}
              style={{ position: 'absolute', left: b.left, top: Math.max(0, b.top - 20), padding: '1px 6px', fontSize: 12, lineHeight: '18px', color: '#fff', background: b.tag.enabled ? '#16a34a' : '#6b7280', border: 0, borderRadius: 3, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {b.tag.name}
            </button>
          ))}
          {mode === 'select' && hover ? (
            <div aria-hidden="true" style={{ position: 'absolute', left: hover.left, top: hover.top, width: hover.width, height: hover.height, outline: '2px solid #2563eb', background: 'rgba(37,99,235,.08)', pointerEvents: 'none' }} />
          ) : null}
          {mode === 'select' ? (
            <div style={{ position: 'absolute', left: 12, bottom: 12, padding: '6px 10px', background: '#111827', color: '#fff', borderRadius: 4 }}>{t('tracking.tags.selectHint')}</div>
          ) : null}
          {toast ? (
            <div role="status" style={{ position: 'absolute', left: 12, top: 12, maxWidth: 420, padding: '8px 12px', background: '#111827', color: '#fff', borderRadius: 4 }}>{toast}</div>
          ) : null}
        </div>

        {panelOpen && form ? (
          <aside aria-label={editing ? t('tracking.tags.editTitle') : t('tracking.tags.newTitle')} style={{ width: 340, overflowY: 'auto', padding: 16, background: '#fff', borderLeft: '1px solid #e5e7eb' }}>
            <h2 style={{ fontSize: 15, margin: '0 0 8px' }}>{editing ? t('tracking.tags.editTitle') : t('tracking.tags.newTitle')}</h2>
            <div style={{ marginBottom: 8 }}>
              <div style={{ color: '#6b7280' }}>{t('tracking.tags.selectorLabel')}</div>
              <code style={{ wordBreak: 'break-all' }}>{selectorInUse}</code>
              {picked && picked.matches !== 1 ? <div style={{ color: '#b45309', marginTop: 4 }}>{t('tracking.tags.notUnique')}</div> : null}
            </div>
            {suggestion && picked ? (
              <div style={{ margin: '8px 0', padding: 8, background: '#eff6ff', borderRadius: 4 }}>
                {t('tracking.tags.suggested', { event: t(tagOptionDef(suggestion.option).labelKey), reason: t(SUGGEST_REASON[suggestion.reason]) })}
              </div>
            ) : null}
            <label style={{ display: 'block', margin: '8px 0' }}>
              {t('tracking.tags.event')}
              <select value={form.option} onChange={(e) => {
                const option = e.target.value as TagOption
                const next = tagOptionDef(option)
                const previous = tagOptionDef(form.option)
                setForm({ ...form, option, name: form.name === previous.defaultName ? next.defaultName : form.name })
              }} style={{ width: '100%' }}>
                {TAG_OPTIONS.map((o) => (
                  <option key={o.option} value={o.option}>{t(o.labelKey)}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'block', margin: '8px 0' }}>
              {t('tracking.tags.name')}
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', margin: '8px 0' }}>
              {t('tracking.tags.trigger')}
              <select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value as 'click' | 'submit' })} style={{ width: '100%' }}>
                <option value="click">{t('tracking.tags.triggerClick')}</option>
                <option value="submit">{t('tracking.tags.triggerSubmit')}</option>
              </select>
            </label>
            <label style={{ display: 'block', margin: '8px 0' }}>
              {t('tracking.tags.value')}
              <input inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} style={{ width: '100%' }} />
            </label>
            <label style={{ display: 'block', margin: '8px 0' }}>
              {t('tracking.tags.currency')}
              <input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} style={{ width: '100%' }} />
            </label>
            <div style={{ margin: '8px 0', color: '#6b7280' }}>
              {t('tracking.tags.rule', { path: editing ? (editing.urlMatch ?? currentPath) : normaliseRulePath(currentPath) })}
            </div>
            {panelErrors.length ? <div style={{ color: '#b91c1c', margin: '8px 0' }}>{panelErrors.join(' ')}</div> : null}
            {status.kind === 'error' ? <div style={{ color: '#b91c1c', margin: '8px 0' }}>{status.message}</div> : null}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button type="button" className="btn btn--style-primary" disabled={panelErrors.length > 0 || status.kind === 'saving'} onClick={() => void save()}>
                {status.kind === 'saving' ? t('tracking.tags.saving') : t('tracking.tags.save')}
              </button>
              <button type="button" className="btn btn--style-secondary" onClick={() => { setPicked(null); setEditing(null); setForm(null) }}>{t('tracking.tags.cancel')}</button>
              {editing ? (
                <button type="button" className="btn btn--style-secondary" onClick={() => void remove()}>
                  {confirmDelete ? t('tracking.tags.deleteConfirm') : t('tracking.tags.delete')}
                </button>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

const segment = (active: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  border: '1px solid #d1d5db',
  background: active ? '#1d4ed8' : '#fff',
  color: active ? '#fff' : '#111827',
  cursor: 'pointer',
})

