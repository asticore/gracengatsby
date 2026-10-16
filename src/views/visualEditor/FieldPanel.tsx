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
import { parseSectionLayout, type DeviceFlow, type SectionLayout } from '@/lib/sectionLayout'

import { Accordion, CheckRow, DesignPanel, HeightRows, makeResponsive, NumberRow, SelectRow, type EditDevice, type RowResp } from './DesignPanel'
import { columnsForStructure, STRUCTURES } from './columnOps'
import { StructureIcon } from './StructurePicker'
import { canEditAsPlainText, lexicalToPlainText, plainTextToLexical, RICH_TEXT_NOTICE } from './richTextUtil'
import { MediaPicker } from './MediaPicker'
import { MergeTagPicker } from './MergeTagPicker'
import { LockControls, type LockUi } from './LockControls'
import { FormLogicInput, FormOptionsInput } from './formInputs'

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
  userPermissions?: { canEditStyle: boolean; canEditLayout: boolean } | null
  lockUi?: LockUi
  /** The device being edited (top bar toggle): responsive settings read and write that device's value. */
  device?: EditDevice
  /** Opens a column of the selected section in the column panel. */
  onSelectColumn?: (index: number) => void
}> = ({ blockDef, data, onChange, onClose, onDelete, onDuplicate, userPermissions, lockUi, device = 'desktop', onSelectColumn }) => {
  const blocked = Boolean(lockUi?.lock?.blocked)
  const fieldDisabled = (name: string) => blocked && (lockUi?.lock?.mode === 'full' || !lockUi?.lock?.editableProps.includes(name))
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
          &#10005;
        </button>
      </div>

      {lockUi && <LockControls ui={lockUi} />}

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

      <div className={`ve-panel__body ${tab === 'design' ? 've-panel__body--flush' : ''}`}>
        {tab === 'content' &&
          (isSection ? (
            <fieldset className="ve-lockset" disabled={blocked}>
              <SectionLayoutFields
                columns={parseColumns(data.columns)}
                onChange={(columns) => setField('columns', columns)}
                design={asBlockStyle(data.design)}
                onDesignChange={(next) => setField('design', next)}
                canEditLayout={userPermissions?.canEditLayout !== false}
                device={device}
                onSelectColumn={onSelectColumn}
              />
            </fieldset>
          ) : isElement ? (
            elementDef ? (
              elementDef.fields.map((field) => (
                <fieldset key={field.name} className="ve-lockset" disabled={fieldDisabled(field.name)}>
                  <FieldInput field={field} value={elementProps[field.name]} onChange={(v) => setElementProp(field.name, v)} />
                </fieldset>
              ))
            ) : (
              <p className="ve-panel__empty">Unknown element type &quot;{String(data.elementType)}&quot;.</p>
            )
          ) : blockDef.fields.length > 0 ? (
            blockDef.fields.map((field) => (
              <fieldset key={field.name} className="ve-lockset" disabled={fieldDisabled(field.name)}>
                <FieldInput field={field} value={data[field.name]} onChange={(v) => setField(field.name, v)} />
              </fieldset>
            ))
          ) : (
            <p className="ve-panel__empty">This element has no content settings - use the Design tab.</p>
          ))}

        {tab === 'design' && (
          !userPermissions?.canEditStyle ? (
            <div className="ve-panel__hint" style={{ padding: '1rem', color: 'var(--color-text-secondary, #666)' }}>
              Your role can edit text only. Styling is locked.
            </div>
          ) : (
            <fieldset className="ve-lockset" disabled={blocked}>
              <DesignPanel value={asBlockStyle(data.design)} onChange={(next: BlockStyle) => setField('design', next)} device={device} />
            </fieldset>
          )
        )}
      </div>

      <div className="ve-panel__footer">
        <button type="button" className="ve-btn ve-btn--ghost" onClick={onDuplicate} disabled={blocked}>
          Duplicate
        </button>
        <button type="button" className="ve-btn ve-btn--danger" onClick={onDelete} disabled={blocked}>
          Delete
        </button>
      </div>
    </div>
  )
}

type WidthDevice = EditDevice
const WIDTH_KEY: Record<WidthDevice, 'widthDesktop' | 'widthTablet' | 'widthMobile'> = {
  desktop: 'widthDesktop',
  tablet: 'widthTablet',
  mobile: 'widthMobile',
}
const INHERIT_FROM: Record<EditDevice, string> = { desktop: 'desktop', tablet: 'desktop', mobile: 'tablet' }

/** Drops undefined values and empty objects, at any depth, so stored JSON stays minimal. */
function cleanDeep<T>(value: T): T | undefined {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = cleanDeep(v)
      if (cleaned !== undefined) out[key] = cleaned
    }
    return Object.keys(out).length > 0 ? (out as T) : undefined
  }
  return value === undefined ? undefined : value
}

const GAP_PRESETS: Record<string, number> = { none: 0, narrow: 10, wide: 40 }

/**
 * Structure and flow settings for a Section block. Everything that can differ per device
 * (column widths, direction, gap, wrap, justify, align, height, padding) follows the top bar's
 * device toggle, Elementor style: switch to Mobile there and you are editing the mobile values,
 * which fall back to tablet and then desktop wherever you leave them unset.
 */
const SectionLayoutFields: React.FC<{
  columns: SectionColumn[]
  onChange: (columns: SectionColumn[]) => void
  design?: BlockStyle
  onDesignChange?: (design: BlockStyle) => void
  canEditLayout?: boolean
  device: EditDevice
  onSelectColumn?: (index: number) => void
}> = ({ columns, onChange, design = {}, onDesignChange, canEditLayout = true, device, onSelectColumn }) => {
  const widthKey = WIDTH_KEY[device]
  const layout = parseSectionLayout(design.layout) || {}
  const ctl = makeResponsive(design, (next) => onDesignChange?.(next), device)
  const from = INHERIT_FROM[device]

  const setLayout = (patch: Partial<SectionLayout>) => {
    const merged = cleanDeep({ ...layout, ...patch }) as SectionLayout | undefined
    const updated: BlockStyle = { ...design }
    if (merged) updated.layout = merged
    else delete updated.layout
    onDesignChange?.(updated)
  }
  const setForDevice = (key: 'direction' | 'gap', value: unknown) => {
    const current = { ...((layout[key] as Record<string, unknown> | undefined) || {}) }
    if (value === undefined) delete current[device]
    else current[device] = value
    setLayout({ [key]: current } as Partial<SectionLayout>)
  }
  /** wrap / justify / align-items: the base layout on desktop, layout.tablet / layout.mobile on the others. */
  const flowGet = <K extends keyof DeviceFlow>(key: K): DeviceFlow[K] | undefined =>
    device === 'desktop' ? ((layout as DeviceFlow)[key] as DeviceFlow[K] | undefined) : layout[device]?.[key]
  const flowSet = <K extends keyof DeviceFlow>(key: K, value: DeviceFlow[K] | undefined) => {
    if (device === 'desktop') setLayout({ [key]: value } as Partial<SectionLayout>)
    else setLayout({ [device]: { ...(layout[device] || {}), [key]: value } } as Partial<SectionLayout>)
  }
  const flowResp = (key: keyof DeviceFlow): RowResp => ({
    device,
    overridden: device !== 'desktop' && flowGet(key) !== undefined,
    onReset: () => flowSet(key, undefined),
  })
  const inheritedFirst = (desktopLabel: string) => (device === 'desktop' ? desktopLabel : `Inherited from ${from}`)

  const currentWidth = (column: SectionColumn): ResponsiveColumnWidth | undefined =>
    device === 'desktop' ? (column.widthDesktop ?? { value: column.width ?? 12, unit: 'fraction' }) : column[widthKey]

  const setWidth = (index: number, next: ResponsiveColumnWidth | undefined) => {
    onChange(columns.map((column, i) => (i === index ? { ...column, [widthKey]: next } : column)))
  }

  const removeColumn = (index: number) => {
    onChange(columns.filter((_, i) => i !== index))
  }

  /** Rebuilds the row to the given desktop widths, keeping the content of the columns that already exist. */
  const applyPreset = (widths: number[]) => {
    // Content of columns beyond the new count moves into the last one rather than being thrown away.
    const extra = columns.slice(widths.length).flatMap((column) => column.blocks || [])
    const fresh = columnsForStructure(widths, () => `col-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`)
    onChange(
      fresh.map((column, index): SectionColumn => {
        const existing = columns[index]
        if (!existing) return column
        return {
          ...existing,
          width: undefined,
          widthDesktop: column.widthDesktop,
          widthTablet: undefined,
          widthMobile: undefined,
          blocks: index === widths.length - 1 ? [...(existing.blocks || []), ...extra] : existing.blocks || [],
        }
      }),
    )
  }

  const addColumn = () => {
    onChange([
      ...columns,
      { _id: `col-${Date.now()}-${columns.length}`, widthDesktop: { value: 6, unit: 'fraction' }, design: {}, blocks: [] },
    ])
  }

  const gapNow = layout.gap?.[device]
  const gapMode = gapNow === undefined ? '' : (Object.entries(GAP_PRESETS).find(([, v]) => v === gapNow)?.[0] ?? 'custom')
  const wrapNow = flowGet('wrap')
  const directionNow = layout.direction?.[device] || ''
  const directionLabels: Record<string, string> = { row: 'Side by side', 'row-reverse': 'Side by side, reversed', column: 'Stacked', 'column-reverse': 'Stacked, reversed' }

  return (
    <div className="ve-section-fields">
      <p className="ve-panel__hint">
        A section holds columns, and each column holds blocks. Click a column on the canvas to change its width, order and padding.
        {device !== 'desktop' && ` You are editing the ${device} layout: settings you leave unset follow ${from}.`}
      </p>

      <Accordion title="Structure" defaultOpen>
        <div className="ve-structure__mini" role="group" aria-label="Column structure">
          {STRUCTURES.map((structure) => (
            <button
              key={structure.id}
              type="button"
              className="ve-structure__mini-btn"
              disabled={!canEditLayout}
              onClick={() => applyPreset(structure.widths)}
              title={`Use ${structure.label}`}
              aria-label={`Use ${structure.label}`}
            >
              <StructureIcon widths={structure.widths} />
            </button>
          ))}
        </div>

        {columns.length === 0 && <p className="ve-panel__empty">No columns yet - add one below.</p>}

        {columns.map((column, index) => {
          const width = currentWidth(column)
          const isCustom = width && width.unit !== 'fraction' && width.unit !== 'auto' && width.unit !== 'fill'
          return (
            <div className="ve-col-row" key={column._id || index}>
              <span className="ve-col-row__num">{index + 1}</span>
              <select
                value={
                  width
                    ? width.unit === 'fraction'
                      ? String(width.value)
                      : width.unit === 'auto' || width.unit === 'fill'
                        ? width.unit
                        : 'custom'
                    : 'inherit'
                }
                onChange={(e) => {
                  const v = e.target.value
                  if (v === 'inherit') return setWidth(index, undefined)
                  if (v === 'auto' || v === 'fill') return setWidth(index, { value: 0, unit: v })
                  if (v === 'custom') return setWidth(index, { value: 50, unit: 'percent' })
                  setWidth(index, { value: Number(v), unit: 'fraction' })
                }}
                aria-label={`Column ${index + 1} width (${device})`}
              >
                {device !== 'desktop' && <option value="inherit">Inherited from {from}</option>}
                {COLUMN_WIDTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="auto">Fit content (auto)</option>
                <option value="fill">Fill the leftover space</option>
                <option value="custom">Custom size&#8230;</option>
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
                    <option value="percent">%</option>
                    <option value="px">px</option>
                  </select>
                </span>
              )}
              {onSelectColumn && (
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onSelectColumn(index)} title="Open this column's settings">
                  Edit
                </button>
              )}
              <button
                type="button"
                className="ve-icon-btn"
                onClick={() => removeColumn(index)}
                disabled={!canEditLayout}
                aria-label={`Remove column ${index + 1}`}
                title={canEditLayout ? 'Remove column' : 'You cannot modify layout'}
              >
                &#10005;
              </button>
            </div>
          )
        })}

        <button type="button" className="ve-btn ve-btn--ghost" onClick={addColumn} disabled={!canEditLayout}>
          + Add column
        </button>
      </Accordion>

      <Accordion title="Section" defaultOpen>
        <SelectRow
          label="Content width"
          help="Boxed keeps the columns in a centred column of the page; full lets them use the whole width."
          value={layout.contentWidth || 'full'}
          options={[
            { label: 'Full (fill the page area)', value: 'full' },
            { label: 'Boxed', value: 'boxed' },
          ]}
          onChange={(v) => setLayout({ contentWidth: v === 'boxed' ? 'boxed' : undefined, boxedWidth: v === 'boxed' ? layout.boxedWidth : undefined })}
        />
        {layout.contentWidth === 'boxed' && (
          <NumberRow label="Boxed width (px)" value={layout.boxedWidth} min={200} onChange={(v) => setLayout({ boxedWidth: v })} />
        )}
        <CheckRow
          label="Stretch section"
          help="Lets the section's background run edge to edge of the page, even when the content above is boxed."
          checked={design.width === 'full'}
          onChange={(on) => {
            const updated: BlockStyle = { ...design }
            if (on) updated.width = 'full'
            else delete updated.width
            onDesignChange?.(updated)
          }}
        />
        <SelectRow
          label="Columns gap"
          help="The space between columns (and between rows once they wrap)."
          resp={{ device, overridden: device !== 'desktop' && gapNow !== undefined, onReset: () => setForDevice('gap', undefined) }}
          value={gapMode}
          options={[
            { label: inheritedFirst('Default (24px)'), value: '' },
            { label: 'No gap', value: 'none' },
            { label: 'Narrow (10px)', value: 'narrow' },
            { label: 'Wide (40px)', value: 'wide' },
            { label: 'Custom', value: 'custom' },
          ]}
          onChange={(v) => {
            if (v === '') setForDevice('gap', undefined)
            else if (v === 'custom') setForDevice('gap', gapNow !== undefined && gapMode === 'custom' ? gapNow : 20)
            else setForDevice('gap', GAP_PRESETS[v])
          }}
        />
        {gapMode === 'custom' && (
          <NumberRow label="Gap (px)" value={gapNow} min={0} onChange={(v) => setForDevice('gap', v)} />
        )}
        <HeightRows ctl={ctl} />
        <SelectRow
          label="Vertical align"
          help="Where the columns sit when the section is taller than they are (set a Height above)."
          value={layout.verticalAlign || ''}
          options={[
            { label: 'Top (default)', value: '' },
            { label: 'Middle', value: 'middle' },
            { label: 'Bottom', value: 'bottom' },
          ]}
          onChange={(v) => setLayout({ verticalAlign: (v || undefined) as SectionLayout['verticalAlign'] })}
        />
      </Accordion>

      <Accordion title="Flow" defaultOpen={device !== 'desktop'}>
        <SelectRow
          label="Columns flow"
          help="Stacked puts the columns one under another instead of side by side."
          resp={{ device, overridden: device !== 'desktop' && directionNow !== '', onReset: () => setForDevice('direction', undefined) }}
          value={directionNow}
          options={[
            { label: device === 'desktop' ? 'Side by side (default)' : `Inherited from ${from} (${directionLabels[device === 'tablet' ? (layout.direction?.desktop || 'row') : (layout.direction?.tablet || layout.direction?.desktop || 'row')]})`, value: '' },
            { label: 'Side by side', value: 'row' },
            { label: 'Side by side, reversed', value: 'row-reverse' },
            { label: 'Stacked (top to bottom)', value: 'column' },
            { label: 'Stacked, bottom to top', value: 'column-reverse' },
          ]}
          onChange={(v) => setForDevice('direction', v || undefined)}
        />
        <CheckRow
          label="Stack on mobile"
          help="Quick switch: put the columns one under another on phones."
          checked={layout.direction?.mobile === 'column'}
          onChange={(on) => {
            const direction = { ...(layout.direction || {}) }
            if (on) direction.mobile = 'column'
            else delete direction.mobile
            setLayout({ direction })
          }}
        />
        <SelectRow
          label="Wrap columns onto new rows"
          resp={flowResp('wrap')}
          value={wrapNow === undefined ? '' : wrapNow === false ? 'nowrap' : 'wrap'}
          options={[
            { label: inheritedFirst('Wrap (default)'), value: '' },
            { label: 'Wrap', value: 'wrap' },
            { label: 'Keep on one line', value: 'nowrap' },
          ]}
          onChange={(v) => flowSet('wrap', v === '' ? undefined : v === 'wrap')}
        />
        <SelectRow
          label="Justify (along the row)"
          resp={flowResp('justify')}
          value={flowGet('justify') || ''}
          options={[
            { label: inheritedFirst('Start (default)'), value: '' },
            { label: 'Centre', value: 'center' },
            { label: 'End', value: 'end' },
            { label: 'Space between', value: 'between' },
            { label: 'Space around', value: 'around' },
            { label: 'Space evenly', value: 'evenly' },
          ]}
          onChange={(v) => flowSet('justify', (v || undefined) as DeviceFlow['justify'])}
        />
        <SelectRow
          label="Align items"
          resp={flowResp('alignItems')}
          value={flowGet('alignItems') || ''}
          options={[
            { label: inheritedFirst('Top (default)'), value: '' },
            { label: 'Centre', value: 'center' },
            { label: 'Bottom', value: 'end' },
            { label: 'Stretch (equal height)', value: 'stretch' },
          ]}
          onChange={(v) => flowSet('alignItems', (v || undefined) as DeviceFlow['alignItems'])}
        />
      </Accordion>
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
  const [relLoaded, setRelLoaded] = useState(false)
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
        .then((data: { docs?: { id: number; title?: string; name?: string; question?: string }[] }) => {
          setRelOptions(
            (data?.docs || []).map((d) => ({
              id: d.id,
              label: d.title || d.name || d.question || `#${d.id}`,
            })),
          )
          setRelLoaded(true)
        })
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
    case 'formOptions':
      return <FormOptionsInput label={field.label} value={value} onChange={onChange} />
    case 'formLogic':
      return <FormLogicInput value={value} onChange={onChange} />
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
            <option value="">&#8212;</option>
            {(field.options || []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      )
    case 'richText':
      // Refuse to show an editable box for content the plain-text bridge would rewrite.
      if (!canEditAsPlainText(value)) {
        return (
          <label className="ve-field ve-field--full">
            <span>{field.label}</span>
            <textarea rows={6} readOnly value={lexicalToPlainText(value)} className="ve-field--readonly" />
            <small>{RICH_TEXT_NOTICE}</small>
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
            onBlur={(e) => {
              // Only a real change is written, so focusing and leaving the box does not mark the page dirty.
              if (e.target.value !== lexicalToPlainText(value)) onChange(plainTextToLexical(e.target.value))
            }}
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
      const single = field.relationTo === 'page-templates' || field.relationTo === 'data-views' || field.relationTo === 'forms'
      const emptyForms = field.relationTo === 'forms' && relLoaded && relOptions.length === 0

      if (single) {
        const current = typeof value === 'number' ? value : (value as { id?: number })?.id
        return (
          <label className="ve-field ve-field--full">
            <span>{field.label}</span>
            <select
              value={current ? String(current) : ''}
              onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
            >
              <option value="">&#8212;</option>
              {relOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            {emptyForms ? (
              <span className="ve-field__help ve-form-empty">
                No form yet. Create one in Forms (Settings &gt; Forms) and pick it here.{' '}
                <a href="/admin/collections/forms" target="_blank" rel="noreferrer">
                  Open Forms
                </a>
              </span>
            ) : (
              field.helpText && <span className="ve-field__help">{field.helpText}</span>
            )}
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
        <span>&#8230;</span>
      )}
      <button type="button" onClick={onRemove} aria-label="Remove image">
        &#10005;
      </button>
    </div>
  )
}
