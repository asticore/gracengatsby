'use client'

import React, { useEffect, useState } from 'react'

import type { BlockDef, EditorField } from './blockSchemas'
import { lexicalToPlainText, plainTextToLexical } from './richTextUtil'
import { MediaPicker } from './MediaPicker'

type MediaThumb = { id: number; url?: string | null; alt?: string | null }

export const FieldPanel: React.FC<{
  blockDef: BlockDef
  data: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
}> = ({ blockDef, data, onChange, onClose, onDelete, onDuplicate }) => {
  const setField = (name: string, value: unknown) => onChange({ ...data, [name]: value })

  return (
    <div className="ve-panel">
      <div className="ve-panel__header">
        <div>
          <span className="ve-panel__icon">{blockDef.icon}</span>
          <strong>{blockDef.label}</strong>
        </div>
        <button type="button" className="ve-icon-btn" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      <div className="ve-panel__body">
        {blockDef.fields.map((field) => (
          <FieldInput key={field.name} field={field} value={data[field.name]} onChange={(v) => setField(field.name, v)} />
        ))}
      </div>

      <div className="ve-panel__footer">
        <button type="button" className="ve-btn ve-btn--ghost" onClick={onDuplicate}>
          Duplicate block
        </button>
        <button type="button" className="ve-btn ve-btn--danger" onClick={onDelete}>
          Delete block
        </button>
      </div>
    </div>
  )
}

const FieldInput: React.FC<{ field: EditorField; value: unknown; onChange: (v: unknown) => void }> = ({
  field,
  value,
  onChange,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fetchedThumb, setFetchedThumb] = useState<MediaThumb | null>(null)
  const [relOptions, setRelOptions] = useState<{ id: number; label: string }[]>([])

  useEffect(() => {
    if (field.type !== 'media' || typeof value !== 'number') return
    fetch(`/api/media/${value}?depth=0`, { credentials: 'include' })
      .then((r) => r.json() as Promise<MediaThumb>)
      .then((doc) => setFetchedThumb(doc))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.type, typeof value === 'number' ? value : undefined])

  const thumb: MediaThumb | null =
    field.type === 'media'
      ? typeof value === 'number'
        ? fetchedThumb
        : value && typeof value === 'object'
          ? (value as MediaThumb)
          : null
      : null

  useEffect(() => {
    if (field.type === 'relationship' && field.relationTo) {
      fetch(`/api/${field.relationTo}?limit=200&depth=0`, { credentials: 'include' })
        .then((r) => r.json())
        .then((data: { docs?: { id: number; title?: string; question?: string }[] }) =>
          setRelOptions(
            (data?.docs || []).map((d) => ({
              id: d.id,
              label: d.title || d.question || `#${d.id}`,
            })),
          ),
        )
        .catch(() => {})
    }
  }, [field.type, field.relationTo])

  const widthClass = field.width === 'half' ? 've-field--half' : 've-field--full'

  switch (field.type) {
    case 'text':
      return (
        <label className={`ve-field ${widthClass}`}>
          <span>{field.label}</span>
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      )
    case 'textarea':
      return (
        <label className={`ve-field ${widthClass}`}>
          <span>{field.label}</span>
          <textarea rows={3} value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
        </label>
      )
    case 'number':
      return (
        <label className={`ve-field ${widthClass}`}>
          <span>{field.label}</span>
          <input
            type="number"
            value={typeof value === 'number' ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          />
        </label>
      )
    case 'checkbox':
      return (
        <label className={`ve-field ve-field--checkbox ${widthClass}`}>
          <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          <span>{field.label}</span>
        </label>
      )
    case 'select':
      return (
        <label className={`ve-field ${widthClass}`}>
          <span>{field.label}</span>
          <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value || undefined)}>
            <option value="">—</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'richText':
      return (
        <label className={`ve-field ve-field--full`}>
          <span>{field.label}</span>
          <textarea
            rows={6}
            placeholder="Separate paragraphs with a blank line."
            defaultValue={lexicalToPlainText(value)}
            onBlur={(e) => onChange(plainTextToLexical(e.target.value))}
          />
        </label>
      )
    case 'media':
      return (
        <div className="ve-field ve-field--full">
          <span>{field.label}</span>
          <div className="ve-media-field">
            {thumb?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumb.url} alt={thumb.alt || ''} className="ve-media-field__thumb" />
            ) : (
              <div className="ve-media-field__empty">No image</div>
            )}
            <div className="ve-media-field__actions">
              <button type="button" className="ve-btn ve-btn--ghost" onClick={() => setPickerOpen(true)}>
                {thumb ? 'Change' : 'Choose image'}
              </button>
              {thumb && (
                <button
                  type="button"
                  className="ve-btn ve-btn--ghost"
                  onClick={() => {
                    onChange(null)
                    setFetchedThumb(null)
                  }}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
          {pickerOpen && (
            <MediaPicker
              onClose={() => setPickerOpen(false)}
              onSelect={(id, doc) => {
                onChange(id)
                setFetchedThumb(doc)
                setPickerOpen(false)
              }}
            />
          )}
        </div>
      )
    case 'mediaMulti': {
      const ids: number[] = Array.isArray(value)
        ? (value as unknown[]).map((v) => (typeof v === 'number' ? v : (v as { id: number })?.id)).filter(Boolean)
        : []
      return (
        <div className="ve-field ve-field--full">
          <span>{field.label}</span>
          <div className="ve-media-multi">
            {ids.map((id) => (
              <MultiThumb key={id} id={id} onRemove={() => onChange(ids.filter((i) => i !== id))} />
            ))}
            <button type="button" className="ve-media-multi__add" onClick={() => setPickerOpen(true)}>
              + Add
            </button>
          </div>
          {pickerOpen && (
            <MediaPicker
              onClose={() => setPickerOpen(false)}
              onSelect={(id) => {
                if (!ids.includes(id)) onChange([...ids, id])
                setPickerOpen(false)
              }}
            />
          )}
        </div>
      )
    }
    case 'relationship': {
      const ids: number[] = Array.isArray(value)
        ? (value as unknown[]).map((v) => (typeof v === 'number' ? v : (v as { id: number })?.id)).filter(Boolean)
        : []
      return (
        <label className="ve-field ve-field--full">
          <span>{field.label}</span>
          <select
            multiple
            value={ids.map(String)}
            onChange={(e) => onChange(Array.from(e.target.selectedOptions).map((o) => Number(o.value)))}
          >
            {relOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )
    }
    default:
      return null
  }
}

const MultiThumb: React.FC<{ id: number; onRemove: () => void }> = ({ id, onRemove }) => {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/media/${id}?depth=0`, { credentials: 'include' })
      .then((r) => r.json())
      .then((doc: { url?: string | null }) => setUrl(doc?.url || null))
      .catch(() => {})
  }, [id])
  return (
    <div className="ve-media-multi__item">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" />
      ) : (
        <span>…</span>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove image">
        ✕
      </button>
    </div>
  )
}
