'use client'
import { useAdminHref } from '@/admin/adminRoute/AdminRouteProvider'

import type { UiStringKey } from '@/features/uiStrings'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useEffect, useRef, useState } from 'react'

import { asBlockStyle, parseOldFormat, type BlockStyle } from '@/lib/blockStyle'
import { getElementDef } from '@/lib/elements/registry'
import { toStoredDesign } from '@/lib/design/storeDesign'
import { isFieldVisible } from '@/lib/elements/fieldTypes'
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
import { createBlankForm, formEditorPath } from './formRelation'
import { appendMediaIds } from './mediaPickerUpload'
import { MergeTagPicker } from './MergeTagPicker'
import { LockControls, type LockUi } from './LockControls'
import { canConvertLegacy } from './convertLegacy'
import { FormLogicInput, FormOptionsInput } from './formInputs'
import { RangeSliderField } from '@/admin/fields/RangeSliderField'
import { DimensionsField } from '@/admin/fields/DimensionsField'
import { LinkField } from '@/admin/fields/LinkField'
import { IconPickerField } from '@/admin/fields/IconPickerField'
import { ColorPickerField } from '@/admin/fields/ColorPickerField'
import { TypographyPopoverField } from '@/admin/fields/TypographyPopoverField'
import { ShadowPopoverField } from '@/admin/fields/ShadowPopoverField'
import { GradientEditorField } from '@/admin/fields/GradientEditorField'

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
  /** Replaces a legacy block (hero, CTA banner, image + text, gallery) with editable sections. */
  onConvertLegacy?: () => void
}> = ({ blockDef, data, onChange, onClose, onDelete, onDuplicate, userPermissions, lockUi, device = 'desktop', onSelectColumn, onConvertLegacy }) => {
  const t = useAdminT()
  const blocked = Boolean(lockUi?.lock?.blocked)
  const fieldDisabled = (name: string) => blocked && (lockUi?.lock?.mode === 'full' || !lockUi?.lock?.editableProps.includes(name))
  const [tab, setTab] = useState<PanelTab>('content')

  const setField = (name: string, value: unknown) => onChange({ ...data, [name]: value })
  const isSection = blockDef.slug === 'section'
  const isElement = blockDef.slug === 'element'
  const elementDef = isElement ? getElementDef((data.elementType as string) || '') : undefined
  const elementProps = (data.props as Record<string, unknown>) || {}
  const setElementProp = (name: string, value: unknown) => onChange({ ...data, props: { ...elementProps, [name]: value } })
  /** Visibility checks read defaults under the stored props, so an unset controlling prop matches what the renderer shows. */
  const elementValues = { ...(elementDef?.defaultProps() ?? {}), ...elementProps }

  return (
    <div className="ve-panel">
      <div className="ve-panel__header">
        <div>
          <span className="ve-panel__icon">{blockDef.icon}</span>
          <strong>{blockDef.label}</strong>
        </div>
        <button type="button" className="ve-icon-btn" onClick={onClose} aria-label={t('ve.col.closePanel')}>
          &#10005;
        </button>
      </div>

      {onConvertLegacy && canConvertLegacy(blockDef.slug) && (
        <div className="ve-panel__hint" style={{ padding: '0.75rem 1rem', display: 'grid', gap: '0.5rem' }}>
          <span>{t('ve.fp.legacy')}</span>
          <button type="button" className="ve-btn ve-btn--primary" onClick={onConvertLegacy} disabled={blocked}>
            Convert to sections
          </button>
        </div>
      )}

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
                onDesignChange={(next) => setField('design', toStoredDesign(next))}
                canEditLayout={userPermissions?.canEditLayout !== false}
                device={device}
                onSelectColumn={onSelectColumn}
              />
            </fieldset>
          ) : isElement ? (
            elementDef ? (
              elementDef.fields.filter((field) => isFieldVisible(field, elementValues)).map((field) => (
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
            <p className="ve-panel__empty">{t('ve.fp.noContent')}</p>
          ))}

        {tab === 'design' && (
          !userPermissions?.canEditStyle ? (
            <div className="ve-panel__hint" style={{ padding: '1rem', color: 'var(--color-text-secondary, #666)' }}>
              Your role can edit text only. Styling is locked.
            </div>
          ) : (
            <fieldset className="ve-lockset" disabled={blocked}>
              <DesignPanel value={asBlockStyle(data.design)} onChange={(next: BlockStyle) => setField('design', toStoredDesign(next))} device={device} />
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

/** One-line help under "Display as", per mode. */
const DISPLAY_HELP: Record<string, UiStringKey> = {
  columns: 'fp.help.columns_sit_side_by_side_and_wrap_onto_a',
  tabs: 'fp.help.each_column_becomes_a_tab_name_a_tab_in',
  accordion: 'fp.help.each_column_becomes_a_collapsible_panel',
  carousel: 'fp.help.each_column_is_a_slide_the_reader_swipes',
  grid: 'fp.help.columns_become_equal_cells_in_rows',
  flex: 'fp.help.columns_flow_as_a_flexible_row_or_stack',
  modal: 'fp.help.a_button_opens_the_columns_in_a_popup_di',
  stack: 'fp.help.each_column_is_a_full_width_card_that_pi',
  hscroll: 'fp.help.the_columns_slide_sideways_as_the_reader',
  'sticky-steps': 'fp.help.the_first_column_stays_in_place_while_th',
}

/** Clamps a typed number into [min, max] for a layout field; an empty box clears the field. */
const clampField = (v: number | undefined, min: number, max: number): number | undefined =>
  v === undefined ? undefined : Math.min(max, Math.max(min, Math.round(v)))

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
  const t = useAdminT()
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

      <Accordion title={t('ve.fp.structure')} defaultOpen>
        <div className="ve-structure__mini" role="group" aria-label={t('ve.fp.colStructure')}>
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

        {columns.length === 0 && <p className="ve-panel__empty">{t('ve.fp.noColumns')}</p>}

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
                {device !== 'desktop' && <option value="inherit">{t('ve.fp.inherit', { from })}</option>}
                {COLUMN_WIDTH_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                <option value="auto">{t('ve.fp.fitAuto')}</option>
                <option value="fill">{t('ve.fp.fillSpace')}</option>
                <option value="custom">{t('ve.fp.customSize')}</option>
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
                <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onSelectColumn(index)} title={t('ve.fp.openColumn')}>
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

      <Accordion title={t('ve.fp.section')} defaultOpen>
        <SelectRow
          label={t('ve.fp.displayAs')}
          help={t(DISPLAY_HELP[layout.display || 'columns'])}
          value={layout.display || 'columns'}
          options={[
            { label: t('ve.fp.mode.columns'), value: 'columns' },
            { label: t('ve.fp.mode.tabs'), value: 'tabs' },
            { label: t('ve.fp.mode.accordion'), value: 'accordion' },
            { label: t('ve.fp.mode.carousel'), value: 'carousel' },
            { label: t('ve.fp.mode.grid'), value: 'grid' },
            { label: t('ve.fp.mode.flex'), value: 'flex' },
            { label: t('ve.fp.mode.popup'), value: 'modal' },
            { label: t('ve.fp.mode.stack'), value: 'stack' },
            { label: t('ve.fp.mode.hscroll'), value: 'hscroll' },
            { label: t('ve.fp.mode.stickySteps'), value: 'sticky-steps' },
          ]}
          onChange={(v) => setLayout({ display: v === 'columns' ? undefined : (v as SectionLayout['display']) })}
        />
        {layout.display === 'tabs' && (
          <SelectRow
            label={t('ve.fp.tabAlign')}
            value={layout.tabsAlign || 'start'}
            options={[
              { label: t('ve.fp.left'), value: 'start' },
              { label: t('ve.fp.centre'), value: 'center' },
              { label: t('ve.fp.right'), value: 'end' },
              { label: t('ve.fp.stretch'), value: 'stretch' },
            ]}
            onChange={(v) => setLayout({ tabsAlign: v === 'start' ? undefined : (v as SectionLayout['tabsAlign']) })}
          />
        )}
        {layout.display === 'carousel' && (
          <>
            <SelectRow
              label={t('ve.fp.slidesPerView')}
              value={String(layout.carouselPerView ?? 1)}
              options={[1, 2, 3, 4].map((n) => ({ label: String(n), value: String(n) }))}
              onChange={(v) => setLayout({ carouselPerView: Number(v) === 1 ? undefined : (Number(v) as 2 | 3 | 4) })}
            />
            <NumberRow
              label={t('ve.fp.slideGap')}
              value={layout.carouselGap}
              min={0}
              max={64}
              placeholder="16"
              onChange={(v) => setLayout({ carouselGap: v === undefined ? undefined : Math.min(64, Math.max(0, v)) })}
            />
            <CheckRow
              label={t('ve.fp.showArrows')}
              help={t('ve.fp.arrowsHelp')}
              checked={layout.carouselArrows === true}
              onChange={(on) => setLayout({ carouselArrows: on ? true : undefined })}
            />
          </>
        )}
        {layout.display === 'grid' && (
          <>
            <NumberRow
              label={t('ve.fp.colsPerRow')}
              value={layout.gridColumns}
              min={1}
              max={6}
              placeholder="3"
              onChange={(v) => setLayout({ gridColumns: v === undefined ? undefined : Math.min(6, Math.max(1, Math.round(v))) })}
            />
            <NumberRow
              label={t('ve.fp.colsTablet')}
              help={t('ve.fp.colsTabletHelp')}
              value={layout.gridColumnsTablet}
              min={1}
              max={6}
              placeholder="same"
              onChange={(v) => setLayout({ gridColumnsTablet: v === undefined ? undefined : Math.min(6, Math.max(1, Math.round(v))) })}
            />
            <NumberRow
              label={t('ve.fp.colsMobile')}
              value={layout.gridColumnsMobile}
              min={1}
              max={6}
              placeholder="1"
              onChange={(v) => setLayout({ gridColumnsMobile: v === undefined ? undefined : Math.min(6, Math.max(1, Math.round(v))) })}
            />
            <NumberRow
              label={t('ve.fp.cellGap')}
              value={layout.gridGap}
              min={0}
              max={64}
              placeholder="16"
              onChange={(v) => setLayout({ gridGap: v === undefined ? undefined : Math.min(64, Math.max(0, v)) })}
            />
            <NumberRow
              label={t('ve.fp.cellGapTablet')}
              help={t('ve.fp.cellGapTabletHelp')}
              value={layout.gridGapTablet}
              min={0}
              max={64}
              placeholder="same"
              onChange={(v) => setLayout({ gridGapTablet: clampField(v, 0, 64) })}
            />
            <NumberRow
              label={t('ve.fp.cellGapMobile')}
              help={t('ve.fp.cellGapMobileHelp')}
              value={layout.gridGapMobile}
              min={0}
              max={64}
              placeholder="same"
              onChange={(v) => setLayout({ gridGapMobile: clampField(v, 0, 64) })}
            />
            <NumberRow
              label={t('ve.fp.autoFit')}
              help={t('ve.fp.autoFitHelp')}
              value={layout.gridMinWidth}
              min={80}
              max={800}
              placeholder={t('ve.fp.off')}
              onChange={(v) => setLayout({ gridMinWidth: clampField(v, 80, 800) })}
            />
            <CheckRow
              label={t('ve.fp.dense')}
              help={t('ve.fp.denseHelp')}
              checked={layout.gridFlow === 'dense'}
              onChange={(on) => setLayout({ gridFlow: on ? 'dense' : undefined })}
            />
            <SelectRow
              label={t('ve.fp.cellHAlign')}
              value={layout.gridJustify || 'stretch'}
              options={[
                { label: t('ve.fp.stretch'), value: 'stretch' },
                { label: t('ve.fp.left'), value: 'start' },
                { label: t('ve.fp.centre'), value: 'center' },
                { label: t('ve.fp.right'), value: 'end' },
              ]}
              onChange={(v) => setLayout({ gridJustify: v === 'stretch' ? undefined : (v as SectionLayout['gridJustify']) })}
            />
            <SelectRow
              label={t('ve.fp.cellAlign')}
              help={t('ve.fp.cellAlignHelp')}
              value={layout.gridAlign || 'stretch'}
              options={[
                { label: t('ve.fp.stretchEqual'), value: 'stretch' },
                { label: t('ve.fp.top'), value: 'start' },
                { label: t('ve.fp.centre'), value: 'center' },
                { label: t('ve.fp.vBottom'), value: 'end' },
              ]}
              onChange={(v) => setLayout({ gridAlign: v === 'stretch' ? undefined : (v as SectionLayout['gridAlign']) })}
            />
          </>
        )}
        {(layout.display === 'flex' || layout.display === 'grid') && (
          <SelectRow
            label={t('ve.fp.gapUnit')}
            value={layout.gapUnit || 'px'}
            options={[
              { label: 'px', value: 'px' },
              { label: 'rem', value: 'rem' },
            ]}
            onChange={(v) => setLayout({ gapUnit: v === 'rem' ? 'rem' : undefined })}
          />
        )}
        {layout.display === 'modal' && (
          <>
            <div className="ve-row">
              <label className="ve-row__label">{t('ve.fp.buttonText')}</label>
              <input
                type="text"
                maxLength={60}
                placeholder={t('ve.fp.open')}
                value={layout.modalLabel || ''}
                onChange={(e) => setLayout({ modalLabel: e.target.value === '' ? undefined : e.target.value })}
                aria-label={t('ve.fp.buttonText')}
              />
            </div>
            <NumberRow
              label={t('ve.fp.dialogWidth')}
              value={layout.modalWidth}
              min={320}
              max={1200}
              placeholder="640"
              onChange={(v) => setLayout({ modalWidth: v === undefined ? undefined : Math.min(1200, Math.max(320, v)) })}
            />
            <SelectRow
              label={t('ve.fp.triggerStyle')}
              value={layout.modalStyle || 'button'}
              options={[
                { label: t('ve.fp.button'), value: 'button' },
                { label: t('ve.fp.textLink'), value: 'link' },
              ]}
              onChange={(v) => setLayout({ modalStyle: v === 'link' ? 'link' : undefined })}
            />
            <p className="ve-row__help">
              Link trigger: point any link or button at <code>#popup-</code> plus this section&apos;s Anchor ID (Design &gt; Advanced).
            </p>
            <NumberRow
              label={t('ve.fp.openAfter')}
              help={t('ve.fp.openAfterHelp')}
              value={layout.popupDelay}
              min={0}
              max={600}
              placeholder={t('ve.fp.off')}
              onChange={(v) => setLayout({ popupDelay: v === undefined ? undefined : Math.min(600, Math.max(0, Math.round(v))) })}
            />
            <NumberRow
              label={t('ve.fp.openScroll')}
              help={t('ve.fp.openScrollHelp')}
              value={layout.popupScroll}
              min={1}
              max={100}
              placeholder={t('ve.fp.off')}
              onChange={(v) => setLayout({ popupScroll: v === undefined ? undefined : Math.min(100, Math.max(1, Math.round(v))) })}
            />
            <CheckRow
              label={t('ve.fp.exitIntent')}
              help={t('ve.fp.exitIntentHelp')}
              checked={layout.popupExit === true}
              onChange={(v) => setLayout({ popupExit: v ? true : undefined })}
            />
            <SelectRow
              label={t('ve.fp.repeat')}
              help={t('ve.fp.repeatHelp')}
              value={layout.popupFrequency || 'always'}
              options={[
                { label: t('ve.fp.everyVisit'), value: 'always' },
                { label: t('ve.fp.oncePerSession'), value: 'session' },
                { label: t('ve.fp.everyNDays'), value: 'days' },
              ]}
              onChange={(v) => setLayout({ popupFrequency: v === 'always' ? undefined : (v as SectionLayout['popupFrequency']) })}
            />
            {layout.popupFrequency === 'days' && (
              <NumberRow
                label={t('ve.fp.daysBetween')}
                value={layout.popupDays}
                min={1}
                max={365}
                placeholder="1"
                onChange={(v) => setLayout({ popupDays: v === undefined ? undefined : Math.min(365, Math.max(1, Math.round(v))) })}
              />
            )}
          </>
        )}
        {layout.display === 'stack' && (
          <>
            <NumberRow
              label={t('ve.fp.topOffset')}
              help={t('ve.fp.topOffsetHelp')}
              value={layout.stackTop}
              min={0}
              max={200}
              placeholder="24"
              onChange={(v) => setLayout({ stackTop: clampField(v, 0, 200) })}
            />
            <NumberRow
              label={t('ve.fp.stepOffset')}
              help={t('ve.fp.stepOffsetHelp')}
              value={layout.stackOffset}
              min={0}
              max={60}
              placeholder="16"
              onChange={(v) => setLayout({ stackOffset: clampField(v, 0, 60) })}
            />
            <NumberRow
              label={t('ve.fp.cardMinHeight')}
              value={layout.stackMinHeight}
              min={30}
              max={100}
              placeholder="70"
              onChange={(v) => setLayout({ stackMinHeight: clampField(v, 30, 100) })}
            />
          </>
        )}
        {layout.display === 'hscroll' && (
          <>
            <NumberRow
              label={t('ve.fp.scrollLength')}
              help={t('ve.fp.scrollLengthHelp')}
              value={layout.hscrollLength}
              min={200}
              max={600}
              placeholder="300"
              onChange={(v) => setLayout({ hscrollLength: clampField(v, 200, 600) })}
            />
            <NumberRow
              label={t('ve.fp.colWidthVw')}
              value={layout.hscrollColumnWidth}
              min={40}
              max={100}
              placeholder="80"
              onChange={(v) => setLayout({ hscrollColumnWidth: clampField(v, 40, 100) })}
            />
          </>
        )}
        {layout.display === 'sticky-steps' && (
          <>
            <SelectRow
              label={t('ve.fp.stickySide')}
              value={layout.stickyStepsSide || 'left'}
              options={[
                { label: t('ve.fp.left'), value: 'left' },
                { label: t('ve.fp.right'), value: 'right' },
              ]}
              onChange={(v) => setLayout({ stickyStepsSide: v === 'right' ? 'right' : undefined })}
            />
            <NumberRow
              label={t('ve.fp.stickyTop')}
              value={layout.stickyStepsTop}
              min={0}
              max={200}
              placeholder="96"
              onChange={(v) => setLayout({ stickyStepsTop: clampField(v, 0, 200) })}
            />
            <NumberRow
              label={t('ve.fp.stepGap')}
              value={layout.stickyStepsGap}
              min={0}
              max={160}
              placeholder="48"
              onChange={(v) => setLayout({ stickyStepsGap: clampField(v, 0, 160) })}
            />
          </>
        )}
        {layout.display && (
          <div className="ve-row">
            <label className="ve-row__label">{t('ve.fp.activeColour')}</label>
            <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(layout.tabsColor || '') ? (layout.tabsColor as string) : '#2563eb'} onChange={(e) => setLayout({ tabsColor: e.target.value })} aria-label={t('ve.fp.activeColour')} />
          </div>
        )}
        <SelectRow
          label={t('ve.fp.contentWidth')}
          help={t('ve.fp.contentWidthHelp')}
          value={layout.contentWidth || 'full'}
          options={[
            { label: t('ve.fp.contentFull'), value: 'full' },
            { label: t('ve.fp.boxed'), value: 'boxed' },
          ]}
          onChange={(v) => setLayout({ contentWidth: v === 'boxed' ? 'boxed' : undefined, boxedWidth: v === 'boxed' ? layout.boxedWidth : undefined })}
        />
        {layout.contentWidth === 'boxed' && (
          <NumberRow label={t('ve.fp.boxedWidth')} value={layout.boxedWidth} min={200} onChange={(v) => setLayout({ boxedWidth: v })} />
        )}
        <CheckRow
          label={t('ve.fp.stretchSection')}
          help={t('ve.fp.stretchHelp')}
          checked={design.width === 'full'}
          onChange={(on) => {
            const updated: BlockStyle = { ...design }
            if (on) updated.width = 'full'
            else delete updated.width
            onDesignChange?.(updated)
          }}
        />
        <SelectRow
          label={t('ve.fp.columnsGap')}
          help={t('ve.fp.columnsGapHelp')}
          resp={{ device, overridden: device !== 'desktop' && gapNow !== undefined, onReset: () => setForDevice('gap', undefined) }}
          value={gapMode}
          options={[
            { label: inheritedFirst('Default (24px)'), value: '' },
            { label: t('ve.fp.gapNone'), value: 'none' },
            { label: t('ve.fp.gapNarrow'), value: 'narrow' },
            { label: t('ve.fp.gapWide'), value: 'wide' },
            { label: t('ve.fp.gapCustom'), value: 'custom' },
          ]}
          onChange={(v) => {
            if (v === '') setForDevice('gap', undefined)
            else if (v === 'custom') setForDevice('gap', gapNow !== undefined && gapMode === 'custom' ? gapNow : 20)
            else setForDevice('gap', GAP_PRESETS[v])
          }}
        />
        {gapMode === 'custom' && (
          <NumberRow label={t('ve.fp.gapPx')} value={gapNow} min={0} onChange={(v) => setForDevice('gap', v)} />
        )}
        <HeightRows ctl={ctl} />
        <SelectRow
          label={t('ve.fp.vAlign')}
          help={t('ve.fp.vAlignHelp')}
          value={layout.verticalAlign || ''}
          options={[
            { label: t('ve.fp.vTop'), value: '' },
            { label: t('ve.fp.vMiddle'), value: 'middle' },
            { label: t('ve.fp.vBottom'), value: 'bottom' },
          ]}
          onChange={(v) => setLayout({ verticalAlign: (v || undefined) as SectionLayout['verticalAlign'] })}
        />
      </Accordion>

      <Accordion title={t('ve.fp.flow')} defaultOpen={device !== 'desktop'}>
        <SelectRow
          label={t('ve.fp.columnsFlow')}
          help={t('ve.fp.columnsFlowHelp')}
          resp={{ device, overridden: device !== 'desktop' && directionNow !== '', onReset: () => setForDevice('direction', undefined) }}
          value={directionNow}
          options={[
            { label: device === 'desktop' ? 'Side by side (default)' : `Inherited from ${from} (${directionLabels[device === 'tablet' ? (layout.direction?.desktop || 'row') : (layout.direction?.tablet || layout.direction?.desktop || 'row')]})`, value: '' },
            { label: t('ve.fp.sideBySide'), value: 'row' },
            { label: t('ve.fp.sideBySideReversed'), value: 'row-reverse' },
            { label: t('ve.fp.stackedTop'), value: 'column' },
            { label: t('ve.fp.stackedBottom'), value: 'column-reverse' },
          ]}
          onChange={(v) => setForDevice('direction', v || undefined)}
        />
        <CheckRow
          label={t('ve.fp.stackMobile')}
          help={t('ve.fp.stackMobileHelp')}
          checked={layout.direction?.mobile === 'column'}
          onChange={(on) => {
            const direction = { ...(layout.direction || {}) }
            if (on) direction.mobile = 'column'
            else delete direction.mobile
            setLayout({ direction })
          }}
        />
        <SelectRow
          label={t('ve.fp.wrap')}
          resp={flowResp('wrap')}
          value={wrapNow === undefined ? '' : wrapNow === false ? 'nowrap' : 'wrap'}
          options={[
            { label: inheritedFirst('Wrap (default)'), value: '' },
            { label: t('ve.fp.wrapOpt'), value: 'wrap' },
            { label: t('ve.fp.noWrap'), value: 'nowrap' },
          ]}
          onChange={(v) => flowSet('wrap', v === '' ? undefined : v === 'wrap')}
        />
        <SelectRow
          label={t('ve.fp.justify')}
          resp={flowResp('justify')}
          value={flowGet('justify') || ''}
          options={[
            { label: inheritedFirst('Start (default)'), value: '' },
            { label: t('ve.fp.centre'), value: 'center' },
            { label: t('ve.fp.end'), value: 'end' },
            { label: t('ve.fp.spaceBetween'), value: 'between' },
            { label: t('ve.fp.spaceAround'), value: 'around' },
            { label: t('ve.fp.spaceEvenly'), value: 'evenly' },
          ]}
          onChange={(v) => flowSet('justify', (v || undefined) as DeviceFlow['justify'])}
        />
        <SelectRow
          label={t('ve.fp.alignItems')}
          resp={flowResp('alignItems')}
          value={flowGet('alignItems') || ''}
          options={[
            { label: inheritedFirst('Top (default)'), value: '' },
            { label: t('ve.fp.centre'), value: 'center' },
            { label: t('ve.fp.vBottom'), value: 'end' },
            { label: t('ve.fp.stretchEqual'), value: 'stretch' },
          ]}
          onChange={(v) => flowSet('alignItems', (v || undefined) as DeviceFlow['alignItems'])}
        />
      </Accordion>
    </div>
  )
}

type RepeaterField = { name: string; label?: string; type: string; [k: string]: unknown }

const repeaterEmpty = (type: string): unknown => (type === 'checkbox' ? false : type === 'number' ? 0 : '')

const RepeaterCards: React.FC<{ field: EditorField; value: unknown; onChange: (v: unknown) => void }> = ({
  field,
  value,
  onChange,
}) => {
  const t = useAdminT()
  const defFields: RepeaterField[] = ((field.repeater as any)?.fields as RepeaterField[]) || []
  const rows: Record<string, unknown>[] = Array.isArray(value)
    ? (value as Record<string, unknown>[])
    : typeof value === 'string'
      ? parseOldFormat(
          value,
          defFields.map((f) => f.name),
        )
      : []
  const [open, setOpen] = useState<Set<number>>(() => new Set(rows.length > 0 && rows.length <= 3 ? [0] : []))

  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const blankRow = () => {
    const r: Record<string, unknown> = {}
    for (const f of defFields) r[f.name] = repeaterEmpty(f.type)
    return r
  }

  const addRow = () => {
    onChange([...rows, blankRow()])
    setOpen((prev) => new Set(prev).add(rows.length))
  }

  const duplicateRow = (i: number) => {
    const updated = [...rows]
    updated.splice(i + 1, 0, { ...rows[i] })
    onChange(updated)
    setOpen((prev) => {
      const next = new Set<number>()
      prev.forEach((n) => next.add(n > i ? n + 1 : n))
      next.add(i + 1)
      return next
    })
  }

  const deleteRow = (i: number) => {
    onChange(rows.filter((_, idx) => idx !== i))
    setOpen((prev) => {
      const next = new Set<number>()
      prev.forEach((n) => {
        if (n < i) next.add(n)
        else if (n > i) next.add(n - 1)
      })
      return next
    })
  }

  const moveRow = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= rows.length) return
    const updated = [...rows]
    ;[updated[i], updated[j]] = [updated[j], updated[i]]
    onChange(updated)
    setOpen((prev) => {
      const next = new Set(prev)
      const a = prev.has(i)
      const b = prev.has(j)
      if (a) next.add(j)
      else next.delete(j)
      if (b) next.add(i)
      else next.delete(i)
      return next
    })
  }

  const updateCell = (i: number, name: string, v: unknown) => {
    const updated = [...rows]
    updated[i] = { ...updated[i], [name]: v }
    onChange(updated)
  }

  const preview = (row: Record<string, unknown>, i: number) => {
    for (const f of defFields) {
      const v = row?.[f.name]
      if (typeof v === 'string' && v.trim()) {
        const t = v.trim().replace(/\s+/g, ' ')
        return t.length > 40 ? t.slice(0, 40) + '…' : t
      }
    }
    return `Item ${i + 1}`
  }

  const stop = (e: React.MouseEvent, fn: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }

  return (
    <div className="ve-field ve-field--full ve-repeater">
      <span className="ve-repeater__label">{field.label}</span>
      {rows.length === 0 && <p className="ve-repeater__empty">{t('ve.fp.noItems')}</p>}
      {rows.map((row, i) => (
        <details
          key={i}
          className="ve-repeater__card"
          open={open.has(i)}
          onToggle={(e) => {
            const isOpen = (e.currentTarget as HTMLDetailsElement).open
            if (isOpen !== open.has(i)) toggle(i)
          }}
        >
          <summary className="ve-repeater__head">
            <span className="ve-repeater__num">{i + 1}</span>
            <span className="ve-repeater__preview">{preview(row, i)}</span>
            <button type="button" className="ve-repeater__btn" title={t('ve.fp.moveUp')} aria-label={t('ve.fp.moveUp')} disabled={i === 0} onClick={(e) => stop(e, () => moveRow(i, -1))}>
              &#8593;
            </button>
            <button type="button" className="ve-repeater__btn" title={t('ve.fp.moveDown')} aria-label={t('ve.fp.moveDown')} disabled={i === rows.length - 1} onClick={(e) => stop(e, () => moveRow(i, 1))}>
              &#8595;
            </button>
            <button type="button" className="ve-repeater__btn" title={t('ve.fp.duplicate')} aria-label={t('ve.fp.duplicate')} onClick={(e) => stop(e, () => duplicateRow(i))}>
              &#10064;
            </button>
            <button type="button" className="ve-repeater__btn ve-repeater__btn--danger" title={t('ve.fp.delete')} aria-label={t('ve.fp.delete')} onClick={(e) => stop(e, () => deleteRow(i))}>
              &times;
            </button>
          </summary>
          <div className="ve-repeater__body">
            {defFields.map((f) => (
              <FieldInput
                key={f.name}
                field={f as unknown as EditorField}
                value={row?.[f.name]}
                onChange={(v) => updateCell(i, f.name, v)}
              />
            ))}
          </div>
        </details>
      ))}
      <button type="button" className="ve-repeater__add" onClick={addRow}>
        + Add item
      </button>
    </div>
  )
}

const FieldInput: React.FC<{ field: EditorField; value: unknown; onChange: (v: unknown) => void }> = ({
  field,
  value,
  onChange,
}) => {
  const t = useAdminT()
  const adminHref = useAdminHref()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [fetchedThumb, setFetchedThumb] = useState<MediaThumb | null>(null)
  const [relOptions, setRelOptions] = useState<{ id: number; label: string }[]>([])
  const [remoteOptions, setRemoteOptions] = useState<{ label: string; value: string }[]>([])
  const [relLoaded, setRelLoaded] = useState(false)
  const [formCreating, setFormCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
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
    if (field.type !== 'select' || !field.optionsUrl) return
    fetch(field.optionsUrl, { credentials: 'include' })
      .then((r) => r.json())
      .then((data: { options?: { label?: unknown; value?: unknown }[] }) => {
        setRemoteOptions(
          (data?.options || []).filter((o) => typeof o.value === 'string').map((o) => ({ value: String(o.value), label: String(o.label || o.value) })),
        )
      })
      .catch(() => {})
  }, [field.type, field.optionsUrl])

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
            {(() => {
              const list: { label: string; value: string; group?: string }[] = field.optionsUrl ? remoteOptions : field.options || []
              const renderOpt = (opt: { label: string; value: string }) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              )
              const groups = Array.from(new Set(list.map((o) => o.group).filter((g): g is string => !!g)))
              return (
                <>
                  {list.filter((o) => !o.group).map(renderOpt)}
                  {groups.map((g) => (
                    <optgroup key={g} label={g}>
                      {list.filter((o) => o.group === g).map(renderOpt)}
                    </optgroup>
                  ))}
                </>
              )
            })()}
          </select>
        </label>
      )
    case 'color':
      return <ColorPickerField field={field} value={value} onChange={onChange} />
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
            placeholder={t('ve.fp.paragraphsPlaceholder')}
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
              <div className="ve-media-field__empty">{t('ve.fp.noImage')}</div>
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
              onSelectMany={(docs) => {
                onChange(appendMediaIds(ids, docs.map((d) => d.id)))
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

      if (field.relationTo === 'forms') {
        // The Form element: pick a saved form, create a blank one here, or open the form's editor to design its fields.
        // Kept outside the <label> so the buttons and link are not nested inside it.
        const current = typeof value === 'number' ? value : (value as { id?: number })?.id
        const createForm = async (): Promise<void> => {
          setFormCreating(true)
          setFormError(null)
          const result = await createBlankForm(t('formEl.newForm'))
          setFormCreating(false)
          if (!result.ok) {
            setFormError(t('formEl.createFailed'))
            return
          }
          setRelOptions((prev) => [{ id: Number(result.id), label: t('formEl.newForm') }, ...prev])
          onChange(result.id)
        }
        return (
          <div className="ve-field ve-field--full">
            <span>{field.label}</span>
            <select value={current ? String(current) : ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}>
              <option value="">{t('formEl.chooseExisting')}</option>
              {relOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="ve-form-relation-actions">
              <button type="button" className="ve-button" disabled={formCreating} onClick={() => void createForm()}>
                {formCreating ? t('formEl.creating') : t('formEl.newForm')}
              </button>
              {current ? (
                <a href={adminHref(formEditorPath(current))} target="_blank" rel="noreferrer">
                  {t('formEl.editFields')}
                </a>
              ) : null}
            </span>
            {formError ? (
              <span className="ve-field__help ve-form-empty" role="alert">
                {formError}
              </span>
            ) : emptyForms ? (
              <span className="ve-field__help ve-form-empty">{t('formEl.noFormYet')}</span>
            ) : (
              field.helpText && <span className="ve-field__help">{field.helpText}</span>
            )}
          </div>
        )
      }

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
                <a href={adminHref('/content/forms')} target="_blank" rel="noreferrer">
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
    case 'range':
      return (
        <label className={`ve-field ${widthClass}`}>
          <RangeSliderField
            label={field.label}
            value={typeof value === 'number' ? value : undefined}
            onChange={onChange}
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
          />
          {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
        </label>
      )
    case 'dimensions':
      return (
        <div className={`ve-field ${widthClass}`}>
          <DimensionsField
            label={field.label}
            value={value as any}
            onChange={onChange}
          />
          {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
        </div>
      )
    case 'repeater':
      return <RepeaterCards field={field} value={value} onChange={onChange} />
    case 'link':
      return <LinkField value={value} onChange={onChange} label={field.label} helpText={field.helpText} />
    case 'icon':
      return <IconPickerField value={value} onChange={onChange} label={field.label} helpText={field.helpText} source={field.iconSet} />
    case 'typography':
      return (
        <label className="ve-field ve-field--full">
          <span>{field.label}</span>
          <TypographyPopoverField value={value} onChange={onChange} />
          {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
        </label>
      )
    case 'shadow':
      return (
        <label className="ve-field ve-field--full">
          <span>{field.label}</span>
          <ShadowPopoverField value={value} onChange={onChange} />
          {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
        </label>
      )
    case 'gradient':
      return (
        <div className="ve-field ve-field--full">
          <span>{field.label}</span>
          <GradientEditorField value={value} onChange={onChange} />
          {field.helpText && <span className="ve-field__help">{field.helpText}</span>}
        </div>
      )
    default:
      return null
  }
}

const MultiThumb: React.FC<{ id: number; onRemove: () => void }> = ({ id, onRemove }) => {
  const t = useAdminT()
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
      <button type="button" onClick={onRemove} aria-label={t('ve.fp.removeImage')}>
        &#10005;
      </button>
    </div>
  )
}
