'use client'

import React from 'react'
import type { Columns2Block, ColumnBlock, EmailBlockType } from '@/features/email/design/types'
import { BLOCK_LABELS, COLUMN_TYPES, blockSummary, createColumnBlock, duplicateAt, moveAt, removeAt, replaceAt } from './designerModel'
import { BlockFields } from './BlockFields'

const MAX_CELL_BLOCKS = 10

type Props = { block: Columns2Block; onChange: (next: Columns2Block) => void }

/** Edits the two columns of a two-column row. Each column holds text, button and image blocks only. */
export function ColumnsEditor({ block, onChange }: Props) {
  return (
    <div className="ed-columns">
      <CellList title="Left column" cells={block.left} onChange={(left) => onChange({ ...block, left })} />
      <CellList title="Right column" cells={block.right} onChange={(right) => onChange({ ...block, right })} />
    </div>
  )
}

function CellList({ title, cells, onChange }: { title: string; cells: ColumnBlock[]; onChange: (cells: ColumnBlock[]) => void }) {
  const [adding, setAdding] = React.useState<EmailBlockType>('text')
  return (
    <div className="ed-cell-list">
      <h3 className="ed-cell-list__title">{title}</h3>
      {cells.length === 0 && <p className="ed-muted">Nothing here yet.</p>}
      {cells.map((cell, index) => (
        <div className="ed-cell" key={index}>
          <div className="ed-cell__head">
            <strong>{BLOCK_LABELS[cell.type]}</strong>
            <span className="ed-muted">{blockSummary(cell)}</span>
          </div>
          <BlockFields block={cell} onChange={(next) => onChange(replaceAt(cells, index, next as ColumnBlock))} />
          <div className="ed-actions">
            <button type="button" className="ed-button ed-button--quiet" disabled={index === 0} onClick={() => onChange(moveAt(cells, index, -1))}>
              Move up
            </button>
            <button type="button" className="ed-button ed-button--quiet" disabled={index === cells.length - 1} onClick={() => onChange(moveAt(cells, index, 1))}>
              Move down
            </button>
            <button type="button" className="ed-button ed-button--quiet" disabled={cells.length >= MAX_CELL_BLOCKS} onClick={() => onChange(duplicateAt(cells, index))}>
              Duplicate
            </button>
            <button type="button" className="ed-button ed-button--danger" onClick={() => onChange(removeAt(cells, index))}>
              Delete
            </button>
          </div>
        </div>
      ))}
      {cells.length < MAX_CELL_BLOCKS && (
        <div className="ed-row">
          <label className="ed-field">
            <span className="ed-field__label">Add to this column</span>
            <select className="ed-input" value={adding} onChange={(event) => setAdding(event.target.value as EmailBlockType)}>
              {COLUMN_TYPES.map((type) => (
                <option key={type} value={type}>
                  {BLOCK_LABELS[type]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ed-button" onClick={() => onChange([...cells, createColumnBlock(adding)])}>
            Add
          </button>
        </div>
      )}
    </div>
  )
}
