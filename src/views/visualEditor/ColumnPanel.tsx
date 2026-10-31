'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useState } from 'react'

import { asBlockStyle, type BlockStyle } from '@/lib/blockStyle'
import { toStoredDesign } from '@/lib/design/storeDesign'
import { parseColumnLayout, parseSectionLayout, resolveDirections, type ColumnLayout } from '@/lib/sectionLayout'
import {
  COLUMN_WIDTH_OPTIONS,
  type ColumnWidthUnit,
  type ResponsiveColumnWidth,
  type SectionColumn,
  type SectionNode,
} from '@/lib/sectionTree'

import type { ColumnOp } from './canvasBridge'
import { CheckRow, DesignPanel, makeResponsive, NumberRow, RespNumber, SelectRow, type EditDevice, type RowResp } from './DesignPanel'

type Tab = 'layout' | 'design'

const WIDTH_KEY = { desktop: 'widthDesktop', tablet: 'widthTablet', mobile: 'widthMobile' } as const
const ORDER_NAME: Record<EditDevice, string> = { desktop: 'desktop', tablet: 'tablet', mobile: 'mobile' }
const INHERIT_FROM: Record<EditDevice, string> = { desktop: 'desktop', tablet: 'desktop', mobile: 'tablet' }

/** "50%", "300px", "auto" ... for the inherited-width label. */
function describeWidth(width: ResponsiveColumnWidth | undefined): string {
  if (!width) return 'full width'
  if (width.unit === 'fraction') return `${Math.round((width.value / 12) * 100)}%`
  if (width.unit === 'percent') return `${width.value}%`
  if (width.unit === 'px') return `${width.value}px`
  return width.unit === 'auto' ? 'fit content' : 'fill the row'
}

/** Moves the older column padding (layout.padding) into the design object, where it can be set per device. */
function normalizeColumn(column: SectionColumn): { design: BlockStyle; layout: ColumnLayout } {
  const layout = parseColumnLayout(column.layout) || {}
  const design = { ...asBlockStyle(column.design) }
  const legacy = layout.padding
  if (legacy) {
    if (design.paddingTop === undefined && legacy.top !== undefined) design.paddingTop = legacy.top
    if (design.paddingBottom === undefined && legacy.bottom !== undefined) design.paddingBottom = legacy.bottom
    if (design.paddingLeft === undefined && legacy.left !== undefined) design.paddingLeft = legacy.left
    if (design.paddingRight === undefined && legacy.right !== undefined) design.paddingRight = legacy.right
  }
  return { design, layout }
}

/**
 * Settings for the column selected on the canvas. Everything responsive follows the top bar's
 * device toggle: pick Mobile there and the width, order and padding below are the mobile ones.
 */
export const ColumnPanel: React.FC<{
  section: SectionNode
  index: number
  device: EditDevice
  onChange: (column: SectionColumn) => void
  onOp: (op: ColumnOp) => void
  onSelectSection: () => void
  onClose: () => void
  canEditLayout?: boolean
  canEditStyle?: boolean
}> = ({ section, index, device, onChange, onOp, onSelectSection, onClose, canEditLayout = true, canEditStyle = true }) => {
  const t = useAdminT()
  const [tab, setTab] = useState<Tab>('layout')
  const columns = section.columns || []
  const column = columns[index]
  if (!column) return <p className="ve-dock__empty">{t('ve.col.gone')}</p>

  const { design, layout } = normalizeColumn(column)
  const flow = parseSectionLayout(asBlockStyle(section.design).layout)
  const stacked = resolveDirections(flow)[device].startsWith('column')

  const setLayout = (patch: Partial<ColumnLayout>) => {
    const next: Record<string, unknown> = { ...layout, ...patch }
    for (const key of Object.keys(next)) {
      const v = next[key]
      if (v === undefined || (v && typeof v === 'object' && Object.keys(v as object).length === 0)) delete next[key]
    }
    onChange({ ...column, layout: Object.keys(next).length > 0 ? (next as ColumnLayout) : undefined })
  }
  /** Writes the design (padding moved out of the older layout.padding at the same time). */
  const setDesign = (next: BlockStyle) => {
    const { padding: _padding, ...restLayout } = layout
    // Stored in the unified grouped model; read back through asBlockStyle, so the column type keeps BlockStyle.
    onChange({ ...column, design: toStoredDesign(next) as unknown as BlockStyle, layout: Object.keys(restLayout).length > 0 ? restLayout : undefined })
  }
  const ctl = makeResponsive(design, setDesign, device)

  /* Width */
  const widthKey = WIDTH_KEY[device]
  const desktopWidth: ResponsiveColumnWidth = column.widthDesktop ?? { value: column.width ?? 12, unit: 'fraction' }
  const ownWidth = device === 'desktop' ? desktopWidth : column[widthKey]
  const dirs = resolveDirections(flow)
  const isStacked = (d: EditDevice) => dirs[d].startsWith('column')
  const widthAt = (d: EditDevice): ResponsiveColumnWidth | undefined => (d === 'desktop' ? desktopWidth : column[WIDTH_KEY[d]])
  // What this device falls back to. In a row that is the wider device's width; once stacked, only
  // the wider devices that are stacked as well count (matching the generated CSS), else full width.
  let inheritedWidth: ResponsiveColumnWidth | undefined
  if (device !== 'desktop') {
    const wider: EditDevice[] = device === 'tablet' ? ['desktop'] : ['tablet', 'desktop']
    for (const d of wider) {
      if (isStacked(device) && !isStacked(d)) break
      inheritedWidth = widthAt(d)
      if (inheritedWidth) break
    }
  }
  const isCustom = Boolean(ownWidth && (ownWidth.unit === 'px' || ownWidth.unit === 'percent'))
  const setWidth = (next: ResponsiveColumnWidth | undefined) => onChange({ ...column, [widthKey]: next })
  const widthResp: RowResp = { device, overridden: device !== 'desktop' && ownWidth !== undefined, onReset: () => setWidth(undefined) }

  const orderValue = layout.order?.[device]
  const setOrder = (v: number | undefined) => {
    const order: Record<string, number> = { ...(layout.order || {}) }
    if (v === undefined) delete order[device]
    else order[device] = v
    setLayout({ order })
  }

  return (
    <div className="ve-panel">
      <div className="ve-panel__header">
        <div>
          <span className="ve-panel__icon">{'▫'}</span>
          <strong>{t('ve.col.column')}</strong>{' '}
          <span className="ve-panel__sub">
            {index + 1} of {columns.length}
          </span>
        </div>
        <button type="button" className="ve-icon-btn" onClick={onClose} aria-label={t('ve.col.closePanel')}>
          &#10005;
        </button>
      </div>

      <div className="ve-panel__tabs">
        <button type="button" className={`ve-panel__tab ${tab === 'layout' ? 've-panel__tab--active' : ''}`} onClick={() => setTab('layout')}>
          {t('ve.col.layout')}
        </button>
        <button type="button" className={`ve-panel__tab ${tab === 'design' ? 've-panel__tab--active' : ''}`} onClick={() => setTab('design')}>
          {t('ve.col.design')}
        </button>
      </div>

      <div className={`ve-panel__body ${tab === 'design' ? 've-panel__body--flush' : ''}`}>
        {tab === 'layout' && (
          <fieldset className="ve-lockset" disabled={!canEditLayout}>
            <div className="ve-section-fields">
              {(flow?.display === 'tabs' || flow?.display === 'accordion') && (
                <div className="ve-row">
                  <label className="ve-row__label">{flow.display === 'tabs' ? 'Tab title' : 'Panel title'}</label>
                  <input
                    type="text"
                    value={column.label || ''}
                    placeholder={`${flow.display === 'tabs' ? 'Tab' : 'Panel'} ${index + 1}`}
                    onChange={(e) => onChange({ ...column, label: e.target.value || undefined })}
                  />
                </div>
              )}
              <p className="ve-panel__hint">
                {t('ve.col.hint')}
                {device !== 'desktop' && ` You are editing the ${ORDER_NAME[device]} layout; anything left unset follows ${INHERIT_FROM[device]}.`}
              </p>

              <SelectRow
                label={t('ve.col.width')}
                help={
                  stacked
                    ? `This section is stacked on ${device}, so the column is this share of the full width (50% = half). Use "Align column" to place it left, centre or right.`
                    : 'How much of the row this column takes. Columns that add up to 100% sit side by side.'
                }
                resp={widthResp}
                value={
                  ownWidth
                    ? ownWidth.unit === 'fraction'
                      ? String(ownWidth.value)
                      : ownWidth.unit === 'auto' || ownWidth.unit === 'fill'
                        ? ownWidth.unit
                        : 'custom'
                    : 'inherit'
                }
                options={[
                  ...(device !== 'desktop' ? [{ label: `Inherited from ${INHERIT_FROM[device]} (${describeWidth(inheritedWidth)})`, value: 'inherit' }] : []),
                  ...COLUMN_WIDTH_OPTIONS.map((o) => ({ label: o.label, value: String(o.value) })),
                  { label: 'Fit content (auto)', value: 'auto' },
                  { label: 'Fill the leftover space', value: 'fill' },
                  { label: 'Custom size', value: 'custom' },
                ]}
                onChange={(v) => {
                  if (v === 'inherit') return setWidth(undefined)
                  if (v === 'auto' || v === 'fill') return setWidth({ value: 0, unit: v })
                  if (v === 'custom') return setWidth({ value: 50, unit: 'percent' })
                  setWidth({ value: Number(v), unit: 'fraction' })
                }}
              />
              {isCustom && ownWidth && (
                <div className="ve-row ve-col-custom">
                  <input
                    type="number"
                    min={0}
                    value={ownWidth.value}
                    onChange={(e) => setWidth({ ...ownWidth, value: Number(e.target.value) })}
                    aria-label={t('ve.col.customWidthValue')}
                  />
                  <select value={ownWidth.unit} onChange={(e) => setWidth({ ...ownWidth, unit: e.target.value as ColumnWidthUnit })} aria-label={t('ve.col.customWidthUnit')}>
                    <option value="percent">%</option>
                    <option value="px">px</option>
                  </select>
                </div>
              )}

              <CheckRow
                label={t('ve.col.stretch')}
                help="Lets this column take any space left over in its row."
                checked={(layout.grow ?? 0) > 0}
                onChange={(on) => setLayout({ grow: on ? 1 : undefined })}
              />

              <SelectRow
                label={t('ve.col.alignColumn')}
                help="Where the column sits when its row has spare room - or, in a stacked section, left, centre or right."
                value={layout.alignSelf || ''}
                options={[
                  { label: 'Default', value: '' },
                  { label: 'Start (top or left)', value: 'start' },
                  { label: 'Centre', value: 'center' },
                  { label: 'End (bottom or right)', value: 'end' },
                  { label: 'Stretch to match the tallest column', value: 'stretch' },
                ]}
                onChange={(v) => setLayout({ alignSelf: (v || undefined) as ColumnLayout['alignSelf'] })}
              />

              <SelectRow
                label={t('ve.col.verticalAlign')}
                help="Where the blocks sit inside the column when it is taller than they are."
                value={layout.vAlign || ''}
                options={[
                  { label: 'Default (top)', value: '' },
                  { label: 'Top', value: 'top' },
                  { label: 'Middle', value: 'middle' },
                  { label: 'Bottom', value: 'bottom' },
                  { label: 'Spread out', value: 'between' },
                ]}
                onChange={(v) => setLayout({ vAlign: (v || undefined) as ColumnLayout['vAlign'] })}
              />

              <NumberRow
                label={t('ve.col.orderOnDevice')}
                help="Lower numbers come first. Use it to put a column first on mobile without changing the desktop order."
                value={orderValue}
                resp={{ device, overridden: device !== 'desktop' && orderValue !== undefined, onReset: () => setOrder(undefined) }}
                onChange={setOrder}
              />

              <NumberRow
                label={t('ve.col.spaceBetween')}
                help="The gap between the blocks stacked in this column."
                value={layout.gap}
                min={0}
                onChange={(v) => setLayout({ gap: v })}
              />

              <RespNumber ctl={ctl} k="paddingTop" label={t('ve.col.padTop')} min={0} />
              <RespNumber ctl={ctl} k="paddingRight" label={t('ve.col.padRight')} min={0} />
              <RespNumber ctl={ctl} k="paddingBottom" label={t('ve.col.padBottom')} min={0} />
              <RespNumber ctl={ctl} k="paddingLeft" label={t('ve.col.padLeft')} min={0} />

              <NumberRow
                label={t('ve.col.minWidth')}
                help="The column wraps to the next row instead of getting narrower than this."
                value={layout.minWidth}
                min={0}
                onChange={(v) => setLayout({ minWidth: v })}
              />
            </div>
          </fieldset>
        )}

        {tab === 'design' &&
          (canEditStyle ? <DesignPanel value={design} onChange={setDesign} device={device} variant="column" /> : (
            <div className="ve-panel__hint" style={{ padding: '1rem' }}>
              {t('ve.col.roleTextOnly')}
            </div>
          ))}
      </div>

      <div className="ve-panel__footer ve-panel__footer--wrap">
        <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onOp('moveLeft')} disabled={!canEditLayout || index === 0} title={t('ve.col.moveLeft')}>
          {'←'} Left
        </button>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onOp('moveRight')} disabled={!canEditLayout || index === columns.length - 1} title={t('ve.col.moveRight')}>
          Right {'→'}
        </button>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onOp('add')} disabled={!canEditLayout}>
          {t('ve.col.addColumn')}
        </button>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onOp('duplicate')} disabled={!canEditLayout}>
          {t('ve.col.duplicate')}
        </button>
        <button type="button" className="ve-btn ve-btn--danger" onClick={() => onOp('delete')} disabled={!canEditLayout || columns.length <= 1}>
          {t('ve.col.delete')}
        </button>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={onSelectSection}>
          {t('ve.col.editSection')}
        </button>
      </div>
    </div>
  )
}
