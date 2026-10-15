'use client'

import { useState } from 'react'

import { LIMITS, type TableAlign, type TableBorders, type TableStyle, type ThemeColour, type ThemeStyles } from '@/features/themeStyles/types'

import { ColourRefInput } from './ColourRefInput'
import { addTable, duplicateTable, removeTable } from './editorLogic'
import { NumberField, SelectField, TextField } from './fields'

type Props = { styles: ThemeStyles; colours: ThemeColour[]; onChange: (next: ThemeStyles) => void }

export function TableControls({ styles, colours, onChange }: Props) {
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
                  Use as default
                </label>
                <button type="button" className="ts-btn" disabled={tables.length >= LIMITS.tables} onClick={() => setTables(duplicateTable(tables, t.id))}>Duplicate</button>
                {!t.system && <button type="button" className="ts-btn ts-btn--danger" aria-label={`Delete ${t.name}`} onClick={() => onChange(removeTable(styles, t.id))}>Delete</button>}
              </div>
            </div>
            <div className="ts-grid">
              {!t.system && <TextField label="Name" value={t.name} maxLength={LIMITS.name} onChange={(name) => set(t.id, { name })} />}
              <ColourRefInput label="Header background" value={t.headerBg} colours={colours} allowTransparent onChange={(headerBg) => set(t.id, { headerBg })} />
              <ColourRefInput label="Header text" value={t.headerText} colours={colours} onChange={(headerText) => set(t.id, { headerText })} />
              <ColourRefInput label="Row background" value={t.rowBg} colours={colours} allowTransparent onChange={(rowBg) => set(t.id, { rowBg })} />
              <ColourRefInput label="Striped row background" value={t.stripeBg} colours={colours} allowEmpty emptyLabel="No striping" onChange={(stripeBg) => set(t.id, { stripeBg })} />
              <ColourRefInput label="Row hover background" value={t.hoverBg} colours={colours} allowEmpty emptyLabel="No hover colour" onChange={(hoverBg) => set(t.id, { hoverBg })} />
              <ColourRefInput label="Border colour" value={t.borderColour} colours={colours} onChange={(borderColour) => set(t.id, { borderColour })} />
              <ColourRefInput label="Caption colour" value={t.captionColour} colours={colours} onChange={(captionColour) => set(t.id, { captionColour })} />
              <SelectField<TableBorders> label="Borders" value={t.borders} options={[{ value: 'all', label: 'All cells' }, { value: 'rows', label: 'Between rows' }, { value: 'none', label: 'None' }]} onChange={(borders) => set(t.id, { borders })} />
              <NumberField label="Border width (px)" value={t.borderWidth} min={0} max={8} onChange={(borderWidth) => set(t.id, { borderWidth })} />
              <NumberField label="Cell padding top/bottom (px)" value={t.cellPaddingY} min={0} max={40} onChange={(cellPaddingY) => set(t.id, { cellPaddingY })} />
              <NumberField label="Cell padding left/right (px)" value={t.cellPaddingX} min={0} max={40} onChange={(cellPaddingX) => set(t.id, { cellPaddingX })} />
              <SelectField<TableAlign> label="Text alignment" value={t.align} options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Centre' }, { value: 'right', label: 'Right' }]} onChange={(align) => set(t.id, { align })} />
              <NumberField label="Corner radius (px)" value={t.radius} min={0} max={40} onChange={(radius) => set(t.id, { radius })} />
              <NumberField label="Font size (px)" value={t.fontSize} min={10} max={24} onChange={(fontSize) => set(t.id, { fontSize })} />
              <SelectField<'scroll' | 'stack'> label="On narrow screens" value={t.responsive} options={[{ value: 'scroll', label: 'Scroll sideways' }, { value: 'stack', label: 'Stack rows as cards' }]} onChange={(responsive) => set(t.id, { responsive })} />
            </div>
          </section>
        ))}
      </div>
      <h3 className="ts-section">Add table style</h3>
      <div className="ts-inline">
        <div style={{ minWidth: 200 }}>
          <TextField label="Name" value={newName} maxLength={LIMITS.name} onChange={setNewName} />
        </div>
        <button type="button" className="ts-btn" style={{ alignSelf: 'flex-end' }} disabled={tables.length >= LIMITS.tables || !newName.trim()} onClick={() => { setTables(addTable(tables, newName)); setNewName('') }}>
          Add table style
        </button>
      </div>
    </div>
  )
}