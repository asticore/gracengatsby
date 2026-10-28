'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { useState } from 'react'

import { LIMITS, type TableAlign, type TableBorders, type TableStyle, type ThemeColour, type ThemeStyles } from '@/features/themeStyles/types'

import { ColourRefInput } from './ColourRefInput'
import { addTable, duplicateTable, removeTable } from './editorLogic'
import { NumberField, SelectField, TextField } from './fields'

type Props = { styles: ThemeStyles; colours: ThemeColour[]; onChange: (next: ThemeStyles) => void }

export function TableControls({ styles, colours, onChange }: Props) {
  const tt = useAdminT()
  const [newName, setNewName] = useState('')
  const tables = styles.tables
  const setTables = (next: TableStyle[]) => onChange({ ...styles, tables: next })
  const set = (id: string, patch: Partial<TableStyle>) => setTables(tables.map((t) => (t.id === id ? { ...t, ...patch } : t)))

  return (
    <div>
      <div className="ts-list">
        {tables.map((t) => (
          <section key={t.id} className="ts-item" aria-label={t.name}>
            <div className="ts-item__head">
              <h3 className="ts-item__title">{t.name}</h3>
              <div className="ts-inline">
                <label className="ts-radio">
                  <input type="radio" name="ts-default-table" checked={styles.defaultTableId === t.id} onChange={() => onChange({ ...styles, defaultTableId: t.id })} />
                  {tt('tb.lit.use_as_default')}
                </label>
                <button type="button" className="ts-btn" disabled={tables.length >= LIMITS.tables} onClick={() => setTables(duplicateTable(tables, t.id))}>{tt('tb.lit.duplicate')}</button>
                {!t.system && <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${t.name}`} onClick={() => onChange(removeTable(styles, t.id))}>{tt('tb.lit.delete')}</button>}
              </div>
            </div>
            <div className="ts-grid">
              {!t.system && <TextField label={tt('tb.lit.name')} value={t.name} maxLength={LIMITS.name} onChange={(name) => set(t.id, { name })} />}
              <ColourRefInput label={tt('tb.lit.header_background')} value={t.headerBg} colours={colours} allowTransparent onChange={(headerBg) => set(t.id, { headerBg })} />
              <ColourRefInput label={tt('tb.lit.header_text')} value={t.headerText} colours={colours} onChange={(headerText) => set(t.id, { headerText })} />
              <ColourRefInput label={tt('tb.lit.row_background')} value={t.rowBg} colours={colours} allowTransparent onChange={(rowBg) => set(t.id, { rowBg })} />
              <ColourRefInput label={tt('tb.lit.striped_row_background')} value={t.stripeBg} colours={colours} allowEmpty emptyLabel={tt('tb.lit.no_striping')} onChange={(stripeBg) => set(t.id, { stripeBg })} />
              <ColourRefInput label={tt('tb.lit.row_hover_background')} value={t.hoverBg} colours={colours} allowEmpty emptyLabel={tt('tb.lit.no_hover_colour')} onChange={(hoverBg) => set(t.id, { hoverBg })} />
              <ColourRefInput label={tt('tb.lit.border_colour')} value={t.borderColour} colours={colours} onChange={(borderColour) => set(t.id, { borderColour })} />
              <ColourRefInput label={tt('tb.lit.caption_colour')} value={t.captionColour} colours={colours} onChange={(captionColour) => set(t.id, { captionColour })} />
              <SelectField<TableBorders> label={tt('tb.lit.borders')} value={t.borders} options={[{ value: 'all', label: tt('tb.lit.all_cells') }, { value: 'rows', label: tt('tb.lit.between_rows') }, { value: 'none', label: tt('tb.lit.none') }]} onChange={(borders) => set(t.id, { borders })} />
              <NumberField label={tt('tb.lit.border_width_px')} value={t.borderWidth} min={0} max={8} onChange={(borderWidth) => set(t.id, { borderWidth })} />
              <NumberField label={tt('tb.lit.cell_padding_top_bottom_px')} value={t.cellPaddingY} min={0} max={40} onChange={(cellPaddingY) => set(t.id, { cellPaddingY })} />
              <NumberField label={tt('tb.lit.cell_padding_left_right_px')} value={t.cellPaddingX} min={0} max={40} onChange={(cellPaddingX) => set(t.id, { cellPaddingX })} />
              <SelectField<TableAlign> label={tt('tb.lit.text_alignment')} value={t.align} options={[{ value: 'left', label: tt('tb.lit.left') }, { value: 'center', label: tt('tb.lit.centre') }, { value: 'right', label: tt('tb.lit.right') }]} onChange={(align) => set(t.id, { align })} />
              <NumberField label={tt('tb.lit.corner_radius_px')} value={t.radius} min={0} max={40} onChange={(radius) => set(t.id, { radius })} />
              <NumberField label={tt('tb.lit.font_size_px')} value={t.fontSize} min={10} max={24} onChange={(fontSize) => set(t.id, { fontSize })} />
              <SelectField<'scroll' | 'stack'> label={tt('tb.lit.on_narrow_screens')} value={t.responsive} options={[{ value: 'scroll', label: tt('tb.lit.scroll_sideways') }, { value: 'stack', label: tt('tb.lit.stack_rows_as_cards') }]} onChange={(responsive) => set(t.id, { responsive })} />
            </div>
          </section>
        ))}
      </div>
      <h3 className="ts-section">{tt('tb.lit.add_table_style')}</h3>
      <div className="ts-inline">
        <div style={{ minWidth: 200 }}>
          <TextField label={tt('tb.lit.name')} value={newName} maxLength={LIMITS.name} onChange={setNewName} />
        </div>
        <button type="button" className="ts-btn" style={{ alignSelf: 'flex-end' }} disabled={tables.length >= LIMITS.tables || !newName.trim()} onClick={() => { setTables(addTable(tables, newName)); setNewName('') }}>
          {tt('tb.lit.add_table_style')}
        </button>
      </div>
    </div>
  )
}