'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'

import { defaultValueFor } from '@/features/customFields/normalize'
import { isFieldVisible } from '@/features/customFields/conditions'
import { oembedEmbedUrl } from '@/features/customFields/oembed'
import { MediaPicker } from '@/views/visualEditor/MediaPicker'

import type { CustomFieldDef, FlexibleLayout } from './types'

/**
 * Renders one custom field as a real input. Used by the document panel, the
 * Options page and - recursively - for the sub-fields of group, repeater and
 * flexible fields. Values are whatever the field type stores (see types.ts).
 */

/** Media ids seen so far, with their URLs, shared with every input in one panel. */
export type MediaUrlMap = Record<string, string>
export const CustomFieldMediaContext = createContext<{ urls: MediaUrlMap; remember: (id: number, url: string) => void }>({
  urls: {},
  remember: () => undefined,
})

const shell = 'flex min-w-0 flex-[1_1_260px] flex-col gap-[5px]'
const shellFull = 'flex min-w-0 flex-[1_1_100%] flex-col gap-[5px]'
const labelClassName = 'text-[12px] font-semibold'
const helpClassName = 'm-0 text-[11px] opacity-65'
const errorClassName = 'm-0 text-[11px] text-[#b3453a]'
const controlClassName =
  'w-full rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-[var(--theme-input-bg,#fff)] px-[9px] py-[7px] text-[13px] text-inherit [font-family:inherit]'
const btnClassName =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[10px] py-[5px] text-[12px] text-inherit hover:border-[#2e3192] disabled:opacity-40'
const groupBoxClassName = 'flex w-full flex-col gap-[14px] rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] p-[14px]'

const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Moves an item up or down inside an array, returning a new array. */
export function moveItem<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

const toId = (value: unknown): number | null => (typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null)

type RelationOption = { value: string; label: string }

/** The documents of one collection, as relationship options. Empty on any failure. */
async function loadRelationDocs(slug: string): Promise<RelationOption[]> {
  try {
    const res = await fetch(`/api/${encodeURIComponent(slug)}?limit=100&depth=0&sort=-updatedAt`, { credentials: 'include' })
    if (!res.ok) return []
    const json = (await res.json()) as { docs?: Record<string, unknown>[] }
    return (json.docs || []).map((doc) => ({
      value: `${slug}:${String(doc.id)}`,
      label: `${String(doc.title ?? doc.name ?? doc.question ?? doc.id)} (${slug})`,
    }))
  } catch {
    return []
  }
}

/** Loads the documents a relationship field can point at. */
function useRelationOptions(collections: string[]): RelationOption[] {
  const [options, setOptions] = useState<RelationOption[]>([])
  const key = collections.join(',')
  useEffect(() => {
    let cancelled = false
    const slugs = key ? key.split(',') : []
    Promise.all(slugs.map((slug) => loadRelationDocs(slug))).then((lists) => {
      if (!cancelled) setOptions(lists.flat())
    })
    return () => {
      cancelled = true
    }
  }, [key])
  return options
}

/** Fetches URLs for media ids the panel has not seen yet, so previews render after a reload. */
export function useMediaUrlsFor(ids: number[], remember: (id: number, url: string) => void): void {
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',')
  useEffect(() => {
    let cancelled = false
    if (!key) return
    fetch(`/api/admin-field-groups?media=${encodeURIComponent(key)}`, { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ mediaUrls?: Record<string, string> }>) : { mediaUrls: {} }))
      .then((json) => {
        if (cancelled) return
        for (const [id, url] of Object.entries(json.mediaUrls || {})) remember(Number(id), url)
      })
      .catch((): void => undefined)
    return () => {
      cancelled = true
    }
  }, [key, remember])
}

function MediaThumb({ id }: { id: number | null }): React.ReactElement {
  const { urls } = useContext(CustomFieldMediaContext)
  const url = id !== null ? urls[String(id)] : undefined
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="h-[56px] w-[56px] rounded-[5px] border border-[var(--theme-elevation-150,#e2ded4)] object-cover"
      />
    )
  }
  return (
    <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[5px] border border-dashed border-[var(--theme-elevation-150,#e2ded4)] text-center text-[10px] opacity-60">
      {id !== null ? `#${id}` : 'None'}
    </div>
  )
}

/** Picks one media item; calls back with its id and remembers its URL. */
function useMediaPick(): { open: boolean; setOpen: (open: boolean) => void; pick: (id: number, url: string | undefined) => void } {
  const { remember } = useContext(CustomFieldMediaContext)
  const [open, setOpen] = useState(false)
  return {
    open,
    setOpen,
    pick: (id, url) => {
      if (url) remember(id, url)
      setOpen(false)
    },
  }
}

function MediaFieldInput({ id, label, value, onChange, multiple }: { id: string; label: string; value: unknown; onChange: (v: unknown) => void; multiple: boolean }) {
  const picker = useMediaPick()
  const single = toId(value)
  const gallery = Array.isArray(value) ? value.map(toId).filter((v): v is number => v !== null) : []

  if (!multiple) {
    return (
      <div className="flex items-center gap-[10px]">
        <MediaThumb id={single} />
        <div className="flex flex-col gap-[4px]">
          <button type="button" className={btnClassName} onClick={() => picker.setOpen(true)} aria-label={`${label}: choose media`}>
            {single !== null ? 'Change' : 'Choose'}
          </button>
          {single !== null && (
            <button type="button" className={btnClassName} onClick={() => onChange(undefined)}>
              Remove
            </button>
          )}
        </div>
        {picker.open && <MediaPicker onClose={() => picker.setOpen(false)} onSelect={(mid, doc) => { onChange(mid); picker.pick(mid, doc.url ?? undefined) }} />}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[8px]" id={id}>
      <div className="flex flex-wrap gap-[8px]">
        {gallery.map((mid, index) => (
          <div key={`${mid}-${index}`} className="flex flex-col items-center gap-[4px]">
            <MediaThumb id={mid} />
            <div className="flex gap-[4px]">
              <button type="button" className={btnClassName} disabled={index === 0} onClick={() => onChange(moveItem(gallery, index, -1))} aria-label="Move left">
                ←
              </button>
              <button type="button" className={btnClassName} disabled={index === gallery.length - 1} onClick={() => onChange(moveItem(gallery, index, 1))} aria-label="Move right">
                →
              </button>
              <button type="button" className={btnClassName} onClick={() => onChange(gallery.filter((_, i) => i !== index))} aria-label="Remove image">
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
      <div>
        <button type="button" className={btnClassName} onClick={() => picker.setOpen(true)}>
          Add image
        </button>
      </div>
      {picker.open && (
        <MediaPicker
          onClose={() => picker.setOpen(false)}
          onSelect={(mid, doc) => {
            onChange([...gallery, mid])
            picker.pick(mid, doc.url ?? undefined)
          }}
        />
      )}
    </div>
  )
}

function RelationshipInput({ id, def, value, onChange }: { id: string; def: CustomFieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const options = useRelationOptions(def.relationTo ?? [])
  const keyOf = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? String(v) : '')
  if (def.hasMany) {
    const selected = Array.isArray(value) ? value.map((v) => keyOf(v)) : []
    return (
      <div className="flex flex-col gap-[4px]" id={id}>
        {options.map((opt) => {
          const docId = opt.value.split(':')[1]
          const checked = selected.includes(docId)
          return (
            <label key={opt.value} className="flex items-center gap-[6px] text-[13px]">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const current = Array.isArray(value) ? value : []
                  const numeric = Number(docId)
                  onChange(e.target.checked ? [...current, numeric] : current.filter((v) => String(v) !== docId))
                }}
              />
              {opt.label}
            </label>
          )
        })}
        {options.length === 0 && <p className={helpClassName}>No documents to pick from yet.</p>}
      </div>
    )
  }
  return (
    <select id={id} className={controlClassName} value={keyOf(value)} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
      <option value="">—</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value.split(':')[1]}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

/** Renders a list of sub-fields against one object value. Used by group, repeater rows and flexible rows. */
function SubFields({
  defs,
  values,
  onChange,
  idPrefix,
  errors,
}: {
  defs: CustomFieldDef[]
  values: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  idPrefix: string
  errors?: Record<string, string>
}) {
  return (
    <div className="flex flex-wrap gap-[14px]">
      {defs
        .filter((sub) => isFieldVisible(sub, values))
        .map((sub) => (
          <CustomFieldInput
            key={sub.name}
            def={sub}
            idPrefix={idPrefix}
            value={values[sub.name]}
            error={errors?.[sub.name]}
            onChange={(next) => {
              const updated = { ...values }
              if (next === undefined) delete updated[sub.name]
              else updated[sub.name] = next
              onChange(updated)
            }}
          />
        ))}
    </div>
  )
}

function RepeaterInput({ def, value, onChange, idPrefix }: { def: CustomFieldDef; value: unknown; onChange: (v: unknown) => void; idPrefix: string }) {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
  const max = def.max ?? Infinity
  const set = (next: Record<string, unknown>[]) => onChange(next.length ? next : undefined)
  return (
    <div className="flex w-full flex-col gap-[10px]">
      {rows.map((row, index) => (
        <div key={index} className={groupBoxClassName}>
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold opacity-70">Row {index + 1}</span>
            <div className="flex gap-[4px]">
              <button type="button" className={btnClassName} disabled={index === 0} onClick={() => set(moveItem(rows, index, -1))}>
                ↑
              </button>
              <button type="button" className={btnClassName} disabled={index === rows.length - 1} onClick={() => set(moveItem(rows, index, 1))}>
                ↓
              </button>
              <button type="button" className={btnClassName} onClick={() => set(rows.filter((_, i) => i !== index))}>
                Remove
              </button>
            </div>
          </div>
          <SubFields
            defs={def.subFields ?? []}
            values={isObject(row) ? row : {}}
            idPrefix={`${idPrefix}-${index}`}
            onChange={(next) => set(rows.map((r, i) => (i === index ? next : r)))}
          />
        </div>
      ))}
      <div>
        <button
          type="button"
          className={btnClassName}
          disabled={rows.length >= max}
          onClick={() => set([...rows, {}])}
        >
          Add row
        </button>
      </div>
    </div>
  )
}

function FlexibleInput({ def, value, onChange, idPrefix }: { def: CustomFieldDef; value: unknown; onChange: (v: unknown) => void; idPrefix: string }) {
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
  const layouts: FlexibleLayout[] = def.layouts ?? []
  const max = def.max ?? Infinity
  const set = (next: Record<string, unknown>[]) => onChange(next.length ? next : undefined)
  return (
    <div className="flex w-full flex-col gap-[10px]">
      {rows.map((row, index) => {
        const layout = layouts.find((l) => l.name === row.layout)
        return (
          <div key={index} className={groupBoxClassName}>
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold opacity-70">{layout ? layout.label : 'Unknown layout'}</span>
              <div className="flex gap-[4px]">
                <button type="button" className={btnClassName} disabled={index === 0} onClick={() => set(moveItem(rows, index, -1))}>
                  ↑
                </button>
                <button type="button" className={btnClassName} disabled={index === rows.length - 1} onClick={() => set(moveItem(rows, index, 1))}>
                  ↓
                </button>
                <button type="button" className={btnClassName} onClick={() => set(rows.filter((_, i) => i !== index))}>
                  Remove
                </button>
              </div>
            </div>
            {layout && (
              <SubFields
                defs={layout.subFields}
                values={row}
                idPrefix={`${idPrefix}-${index}`}
                onChange={(next) => set(rows.map((r, i) => (i === index ? { ...next, layout: r.layout } : r)))}
              />
            )}
          </div>
        )
      })}
      <div className="flex flex-wrap gap-[6px]">
        {layouts.map((layout) => (
          <button
            key={layout.name}
            type="button"
            className={btnClassName}
            disabled={rows.length >= max}
            onClick={() => set([...rows, { layout: layout.name }])}
          >
            Add {layout.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** One field, of any type. */
export const CustomFieldInput: React.FC<{
  def: CustomFieldDef
  value: unknown
  onChange: (value: unknown) => void
  error?: string
  idPrefix?: string
}> = ({ def, value: rawValue, onChange, error, idPrefix = 'cf' }) => {
  const id = `${idPrefix}-${def.name}`
  // Show the default for a field the document has not set yet. The server
  // stores it on create, so what the editor sees is what is saved.
  const value = rawValue === undefined ? defaultValueFor(def) : rawValue
  const isWide = def.type === 'repeater' || def.type === 'flexible' || def.type === 'group' || def.type === 'gallery' || def.width === 'full'
  const wrapClass = isWide ? shellFull : shell

  const label = (
    <label className={labelClassName} htmlFor={id}>
      {def.label}
      {def.required ? <span className="text-[#b3453a]"> *</span> : null}
    </label>
  )
  const help = def.helpText ? <p className={helpClassName}>{def.helpText}</p> : null
  const err = error ? <p className={errorClassName} role="alert">{error}</p> : null

  const wrap = (control: React.ReactNode) => (
    <div className={wrapClass}>
      {label}
      {control}
      {help}
      {err}
    </div>
  )

  const text = typeof value === 'string' ? value : ''
  const num = typeof value === 'number' ? value : ''

  switch (def.type) {
    case 'textarea':
    case 'wysiwyg':
      return wrap(<textarea id={id} className={controlClassName} rows={def.type === 'wysiwyg' ? 8 : 4} value={text} onChange={(e) => onChange(e.target.value)} />)

    case 'number':
      return wrap(
        <input
          id={id}
          className={controlClassName}
          type="number"
          min={def.min ?? undefined}
          max={def.max ?? undefined}
          step={def.step ?? 'any'}
          value={num}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />,
      )

    case 'checkbox':
      return (
        <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-[5px]">
          <label className="flex items-center gap-[8px] text-[12px] font-semibold" htmlFor={id}>
            <input id={id} type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
            {def.trueLabel || def.label}
            {def.required ? <span className="text-[#b3453a]"> *</span> : null}
          </label>
          {help}
          {err}
        </div>
      )

    case 'select':
      if (def.multiple) {
        const selected = Array.isArray(value) ? value.map(String) : []
        return wrap(
          <select
            id={id}
            multiple
            className={controlClassName}
            value={selected}
            onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => o.value))}
          >
            {(def.options || []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>,
        )
      }
      return wrap(
        <select id={id} className={controlClassName} value={text} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {(def.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>,
      )

    case 'radio':
    case 'button-group':
      return wrap(
        <div id={id} role="radiogroup" className="flex flex-wrap gap-[6px]">
          {(def.options || []).map((option) => {
            const active = text === option.value
            if (def.type === 'button-group') {
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  className={`${btnClassName} ${active ? 'border-[#2e3192] font-semibold' : ''}`}
                  onClick={() => onChange(active ? undefined : option.value)}
                >
                  {option.label}
                </button>
              )
            }
            return (
              <label key={option.value} className="flex items-center gap-[6px] text-[13px]">
                <input type="radio" name={id} checked={active} onChange={() => onChange(option.value)} />
                {option.label}
              </label>
            )
          })}
        </div>,
      )

    case 'date':
      return wrap(<input id={id} className={controlClassName} type="date" value={text.slice(0, 10)} onChange={(e) => onChange(e.target.value || undefined)} />)

    case 'datetime':
      return wrap(<input id={id} className={controlClassName} type="datetime-local" value={text.slice(0, 16)} onChange={(e) => onChange(e.target.value || undefined)} />)

    case 'time':
      return wrap(<input id={id} className={controlClassName} type="time" value={text} onChange={(e) => onChange(e.target.value || undefined)} />)

    case 'color':
      return wrap(
        <div className="flex items-center gap-[8px]">
          <input
            id={id}
            className="h-[34px] w-[38px] cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] p-0 [background:none]"
            type="color"
            value={text && /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#000000'}
            onChange={(e) => onChange(e.target.value)}
          />
          <input className={controlClassName} type="text" placeholder="#000000" value={text} onChange={(e) => onChange(e.target.value)} />
        </div>,
      )

    case 'email':
      return wrap(<input id={id} className={controlClassName} type="email" value={text} onChange={(e) => onChange(e.target.value)} />)

    case 'phone':
      return wrap(<input id={id} className={controlClassName} type="tel" value={text} onChange={(e) => onChange(e.target.value)} />)

    case 'url':
      return wrap(<input id={id} className={controlClassName} type="url" value={text} onChange={(e) => onChange(e.target.value)} />)

    case 'text':
      return wrap(<input id={id} className={controlClassName} type="text" value={text} onChange={(e) => onChange(e.target.value)} />)

    case 'image':
    case 'file':
      return wrap(<MediaFieldInput id={id} label={def.label} value={value} onChange={onChange} multiple={false} />)

    case 'gallery':
      return wrap(<MediaFieldInput id={id} label={def.label} value={value} onChange={onChange} multiple />)

    case 'relationship':
      return wrap(<RelationshipInput id={id} def={def} value={value} onChange={onChange} />)

    case 'link': {
      const link = isObject(value) ? value : {}
      const set = (patch: Record<string, unknown>) => onChange({ ...link, ...patch })
      return wrap(
        <div className="flex flex-col gap-[6px]" id={id}>
          <input className={controlClassName} type="url" placeholder="https://" aria-label="Link URL" value={typeof link.url === 'string' ? link.url : ''} onChange={(e) => set({ url: e.target.value })} />
          <input className={controlClassName} type="text" placeholder="Link text" aria-label="Link text" value={typeof link.title === 'string' ? link.title : ''} onChange={(e) => set({ title: e.target.value })} />
          <select className={controlClassName} aria-label="Open in" value={typeof link.target === 'string' ? link.target : '_self'} onChange={(e) => set({ target: e.target.value })}>
            <option value="_self">Same tab</option>
            <option value="_blank">New tab</option>
          </select>
        </div>,
      )
    }

    case 'oembed': {
      const embed = typeof value === 'string' && value ? oembedEmbedUrl(value) : null
      return wrap(
        <div className="flex flex-col gap-[6px]" id={id}>
          <input className={controlClassName} type="url" placeholder="https://www.youtube.com/watch?v=…" value={text} onChange={(e) => onChange(e.target.value)} />
          {embed ? (
            <iframe src={embed} title={def.label} className="aspect-video w-full rounded-[5px] border-0" loading="lazy" allow="encrypted-media; picture-in-picture" />
          ) : text ? (
            <p className={helpClassName}>Preview is available for YouTube, Vimeo, Spotify and SoundCloud links only.</p>
          ) : null}
        </div>,
      )
    }

    case 'map': {
      const map = isObject(value) ? value : {}
      const lat = typeof map.lat === 'number' ? map.lat : null
      const lng = typeof map.lng === 'number' ? map.lng : null
      const zoom = typeof map.zoom === 'number' ? map.zoom : def.defaultZoom ?? 13
      const set = (patch: Record<string, unknown>) => onChange({ ...map, ...patch })
      return wrap(
        <div className="flex flex-col gap-[6px]" id={id}>
          <input className={controlClassName} type="text" placeholder="Address" aria-label="Address" value={typeof map.address === 'string' ? map.address : ''} onChange={(e) => set({ address: e.target.value })} />
          <div className="flex gap-[6px]">
            <input className={controlClassName} type="number" step="any" min={-90} max={90} placeholder="Latitude" aria-label="Latitude" value={lat ?? ''} onChange={(e) => set({ lat: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <input className={controlClassName} type="number" step="any" min={-180} max={180} placeholder="Longitude" aria-label="Longitude" value={lng ?? ''} onChange={(e) => set({ lng: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <input className={controlClassName} type="number" min={1} max={19} aria-label="Zoom" value={zoom} onChange={(e) => set({ zoom: Number(e.target.value) })} />
          </div>
          {lat !== null && lng !== null && (
            <a className="text-[12px] underline" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`} target="_blank" rel="noreferrer">
              View on OpenStreetMap
            </a>
          )}
        </div>,
      )
    }

    case 'group':
      return (
        <div className={shellFull} id={id}>
          {label}
          <div className={groupBoxClassName}>
            <SubFields defs={def.subFields ?? []} values={isObject(value) ? value : {}} idPrefix={id} onChange={(next) => onChange(next)} />
          </div>
          {help}
          {err}
        </div>
      )

    case 'repeater':
      return (
        <div className={shellFull} id={id}>
          {label}
          <RepeaterInput def={def} value={value} onChange={onChange} idPrefix={id} />
          {help}
          {err}
        </div>
      )

    case 'flexible':
      return (
        <div className={shellFull} id={id}>
          {label}
          <FlexibleInput def={def} value={value} onChange={onChange} idPrefix={id} />
          {help}
          {err}
        </div>
      )

    default:
      return wrap(<input id={id} className={controlClassName} type="text" value={text} onChange={(e) => onChange(e.target.value)} />)
  }
}
