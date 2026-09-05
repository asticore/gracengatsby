'use client'

import React, { useEffect, useRef, useState } from 'react'

import { asBlockStyle, type BlockStyle } from '@/lib/blockStyle'
import { getElementDef } from '@/lib/elements/registry'
import {
  COLUMN_WIDTH_OPTIONS,
  parseColumns,
  type ColumnWidthUnit,
  type ResponsiveColumnWidth,
  type SectionColumn,
} from '@/lib/sectionTree'

import type { BlockDef, EditorField } from './blockSchemas'
import { DesignPanel } from './DesignPanel'
import { hasRichFormatting, lexicalToPlainText, plainTextToLexical } from './richTextUtil'
import { MediaPicker } from './MediaPicker'
import { MergeTagPicker } from './MergeTagPicker'

type MediaThumb = { id: number; url?: string | null; alt?: string | null }
type PanelTab = 'content' | 'design'

/**
 * Right-hand panel for the selected block. Split into a Content tab (the
 * block's own fields) and a Design tab (the shared BlockStyle settings), the
 * same split Elementor uses, so style controls don't crowd out content.
 */
export const FieldPanel: React.FC<{
  blockDef: BlockDef
  data: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  onClose: () => void
  onDelete: () => void
  onDuplicate: () => void
}> = ({ blockDef, data, onChange, onClose, onDelete, onDuplicate }) => {
  const [tab, setTab] = useState<PanelTab>('content')

  const setField = (name: string, value: unknown) => onChange({ ...data, [name]: value })
  const isSection = blockDef.slug === 'section'
  const isElement = blockDef.slug === 'element'
  const elementDef = isElement ? getElementDef((data.elementType as string) || '') : undefined
  const elementProps = (data.props as Record<string, unknown>) || {}
  const setElementProp = (name: string, value: unknown) => onChange({ ...data, props: { ...elementProps, [name]: value } })

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

      <div className="ve-panel__tabs">
        <button
          type="button"
          className={`ve-panel__tab ${tab === 'content' ? 've-panel__tab--active' : ''}`}
          onClick={() => setTab('content')}
        >
          {isSection ? 'Layout' : 'Content'}
        </button>
        <button
          type="button"
          className={`ve-panel__tab ${tab === 'design' ? 've-panel__tab--active' : ''}`}
          onClick={() => setTab('design')}
        >
          Design
        </button>
      </div>

      <div className="ve-panel__body">
        {tab === 'content' &&
          (isSection ? (
            <SectionLayoutFields
              columns={parseColumns(data.columns)}
              onChange={(columns) => setField('columns', columns)}
            />
          ) : isElement ? (
            elementDef ? (
              elementDef.fields.map((field) => (
                <FieldInput
                  key={field.name}
                  field={field}
                  value={elementProps[field.name]}
                  onChange={(v) => setElementProp(field.name, v)}
                />
              ))
            ) : (
              <p className="ve-panel__empty">Unknown element type &quot;{String(data.elementType)}&quot;.</p>
            )
          ) : blockDef.fields.length > 0 ? (
            blockDef.fields.map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                value={data[field.name]}
                onChange={(v) => setField(field.name, v)}
              />
            ))
          ) : (
            <p className="ve-panel__empty">This element has no content settings - use the Design tab.</p>
          ))}

        {tab === 'design' && (
          <DesignPanel value={asBlockStyle(data.design)} onChange={(next: BlockStyle) => setField('design', next)} />
        )}
      </div>

      <div className="ve-panel__footer">
        <button type="button" className="ve-btn ve-btn--ghost" onClick={onDuplicate}>
          Duplicate
        </button>
        <button type="button" className="ve-btn ve-btn--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  )
}

type WidthDevice = 'desktop' | 'tablet' | 'mobile'
const WIDTH_KEY: Record<WidthDevice, 'widthDesktop' | 'widthTablet' | 'widthMobile'> = {
  desktop: 'widthDesktop',
  tablet: 'widthTablet',
  mobile: 'widthMobile',
}

/**
 * Column count and per-column, per-breakpoint width controls for a Section
 * block - Elementor lets you set a column's width independently at each
 * device size (and override the 12-based grid with a custom px/% when a
 * neat fraction isn't the shape you want); this is that, minus the desktop
 * default which always falls back to the legacy `width` field so documents
 * saved before responsive widths existed keep rendering the same.
 */
const SectionLayoutFields: React.FC<{
  columns: SectionColumn[]
  onChange: (columns: SectionColumn[]) => void
}> = ({ columns, onChange }) => {
  const [device, setDevice] = useState<WidthDevice>('desktop')
  const widthKey = WIDTH_KEY[device]

  const currentWidth = (column: SectionColumn): ResponsiveColumnWidth | undefined =>
    device === 'desktop' ? (column.widthDesktop ?? { value: column.width ?? 12, unit: 'fraction' }) : column[widthKey]

  const setWidth = (index: number, next: ResponsiveColumnWidth | undefined) => {
    onChange(columns.map((column, i) => (i === index ? { ...column, [widthKey]: next } : column)))
  }

  const removeColumn = (index: number) => {
    onChange(columns.filter((_, i) => i !== index))
  }

  const addColumn = () => {
    onChange([
      ...columns,
      { _id: `col-${Date.now()}-${columns.length}`, widthDesktop: { value: 6, unit: 'fraction' }, design: {}, blocks: [] },
    ])
  }

  return (
    <div className="ve-section-fields">
      <p className="ve-panel__hint">
        Set how wide each column is - independently per device, or add another right next to it and it floats down
        to the next row once a row runs out of room. Add blocks to a column with the + button on the canvas - sections
        can be nested inside columns for more complex layouts.
      </p>

      <div className="ve-device-toggle ve-device-toggle--panel" role="group" aria-label="Width breakpoint">
        {(['desktop', 'tablet', 'mobile'] as const).map((d) => (
          <button
            key={d}
            type="button"
            className={`ve-device-btn ${device === d ? 've-device-btn--active' : ''}`}
            onClick={() => setDevice(d)}
          >
            {d[0].toUpperCase() + d.slice(1)}
          </button>
        ))}
      </div>

      {device !== 'desktop' && (
        <p className="ve-field__help">
          Leave a column on &quot;Match {device === 'tablet' ? 'desktop' : 'tablet'}&quot; to inherit its width from{' '}
          {device === 'tablet' ? 'desktop' : 'tablet (or desktop, if tablet is also unset)'}.
        </p>
      )}

      {columns.length === 0 && <p className="ve-panel__empty">No columns yet - add one below.</p>}

      {columns.map((column, index) => {
        const width = currentWidth(column)
        const isCustom = width && width.unit !== 'fraction'

        return (
          <div className="ve-col-row" key={column._id || index}>
            <span className="ve-col-row__num">{index + 1}</span>
            <select
              value={width ? (width.unit === 'fraction' ? String(width.value) : 'custom') : 'inherit'}
              onChange={(e) => {
                const v = e.target.value
                if (v === 'inherit') return setWidth(index, undefined)
                if (v === 'custom') return setWidth(index, { value: isCustom ? width!.value : 50, unit: 'px' })
                setWidth(index, { value: Number(v), unit: 'fraction' })
              }}
              aria-label={`Column ${index + 1} width (${device})`}
            >
              {device !== 'desktop' && (
                <option value="inherit">Match {device === 'tablet' ? 'desktop' : 'tablet'}</option>
              )}
              {COLUMN_WIDTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Custom size…</option>
            </select>
            {isCustom && width && (
              <span className="ve-col-row__custom">
                <input
                  type="number"
                  min={0}
                  value={width.value}
                  onChange={(e) => setWidth(index, { ...width, value: Number(e.target.value) })}
                  aria-label={`Column ${index + 1} custom width value`}
                />
                <select
                  value={width.unit}
                  onChange={(e) => setWidth(index, { ...width, unit: e.target.value as ColumnWidthUnit })}
                  aria-label={`Column ${index + 1} custom width unit`}
                >
                  <option value="px">px</option>
                  <option value="percent">%</option>
                </select>
              </span>
            )}
            <button
              type="button"
              className="ve-icon-btn"
              onClick={() => removeColumn(index)}
              aria-label={`Remove column ${index + 1}`}
              title="Remove column"
            >
              ✕
            </button>
          </div>
        )
      })}

      <button type="button" className="ve-btn ve-btn--ghost" onClick={addColumn}>
        + Add column
      </button>
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
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

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
        .then((data: { docs?: { id: number; title?: string; name?: string; question?: string }[] }) =>
          setRelOptions(
            (data?.docs || []).map((d) => ({
              id: d.id,
              label: d.title || d.name || d.question || `#${d.id}`,
            })),
          ),
        )
        .catch(() => {})
    }
  }, [field.type, field.relationTo])

  const widthClass = field.width === 'half' ? 've-field--half' : 've-field--full'

  /** Inserts a merge tag at the caret, or appends it if the field isn't focused. */
  const insertTag = (tag: string) => {
    const element = inputRef.current
    const current = typeof value === 'string' ? value : ''
    if (!element) {
      onChange(current + tag)
      return
    }
    const start = element.selectionStart ?? current.length
    const end = element.selectionEnd ?? current.length
    const next = current.slice(0, start) + tag + current.slice(end)
    onChange(next)
    requestAnimationFrame(() => {
      element.focus()
      const caret = start + tag.length
      element.setSelectionRange(caret, caret)
    })
  }

  const labelRow = (
    <span className="ve-field__labelrow">
      <span>{field.label}</span>
      {field.supportsMergeTags && <MergeTagPicker onInsert={insertTag} />}
    </span>
  )

  switch (field.type) {
    case 'text':
      return (
        <label className={`ve-field ${widthClass}`}>
          {labelRow}
          <input
            ref={inputRef as React.Ref<HTMLInputElement>}
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
          {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
        </label>
      )
    case 'textarea':
      return (
        <label className={`ve-field ${widthClass}`}>
          {labelRow}
          <textarea
            ref={inputRef as React.Ref<HTMLTextAreaElement>}
            rows={3}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
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
      if (hasRichFormatting(value)) {
        return (
          <label className="ve-field ve-field--full">
            <span>{field.label}</span>
            <textarea
              rows={6}
              readOnly
              value={lexicalToPlainText(value)}
              className="ve-field--readonly"
            />
            <small>
              This field has formatting that can&apos;t be edited here yet - edit it from the normal admin page
              instead.
            </small>
          </label>
        )
      }
      return (
        <label className="ve-field ve-field--full">
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
      // page-templates is a single-select (a loop has one card design); other
      // relationships on the canvas are multi-select lists.
      const single = field.relationTo === 'page-templates'

      if (single) {
        const current = typeof value === 'number' ? value : (value as { id?: number })?.id
        return (
          <label className="ve-field ve-field--full">
            <span>{field.label}</span>
            <select
              value={current ? String(current) : ''}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">—</option>
              {relOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
          </label>
        )
      }

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
