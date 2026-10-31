'use client'

import React, { useState } from 'react'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { EmailBlock, EmailBlockType } from '@/features/email/design/types'
import { BlockFields } from './BlockFields'
import { ColumnsEditor } from './ColumnsEditor'
import { BLOCK_HELP, BLOCK_LABELS, BLOCK_TYPE_OPTIONS, blockSummary, createBlock, duplicateAt, moveAt, removeAt, replaceAt } from './designerModel'

const MAX_BLOCKS = 40

type Props = { blocks: EmailBlock[]; onChange: (blocks: EmailBlock[]) => void }

/** The ordered blocks of one template. Each block folds open and shut; the first one starts open. */
export function BlockList({ blocks, onChange }: Props) {
  const tt = useAdminT()
  const [adding, setAdding] = useState<EmailBlockType>('text')
  const [open, setOpen] = useState<Record<number, boolean>>({ 0: true })
  const toggle = (index: number) => setOpen((current) => ({ ...current, [index]: !current[index] }))

  return (
    <div className="ed-blocks">
      {blocks.length === 0 && <p className="ed-muted">This email has no blocks yet. Add one below.</p>}
      {blocks.map((block, index) => {
        const isOpen = Boolean(open[index])
        return (
          <div className={`ed-block${isOpen ? ' ed-block--open' : ''}`} key={index} data-block-type={block.type}>
            <div className="ed-block__head">
              <button type="button" className="ed-block__toggle" aria-expanded={isOpen} onClick={() => toggle(index)}>
                <span aria-hidden="true">{isOpen ? '-' : '+'}</span>
                <span className="ed-block__title">{BLOCK_LABELS[block.type]}</span>
                <span className="ed-muted ed-block__summary">{blockSummary(block)}</span>
              </button>
              <div className="ed-actions">
                <button type="button" className="ed-button ed-button--quiet" aria-label={tt('aria.moveUp', { name: BLOCK_LABELS[block.type] })} disabled={index === 0} onClick={() => onChange(moveAt(blocks, index, -1))}>
                  Up
                </button>
                <button
                  type="button"
                  className="ed-button ed-button--quiet"
                  aria-label={tt('aria.moveDown', { name: BLOCK_LABELS[block.type] })}
                  disabled={index === blocks.length - 1}
                  onClick={() => onChange(moveAt(blocks, index, 1))}
                >
                  Down
                </button>
                <button type="button" className="ed-button ed-button--quiet" disabled={blocks.length >= MAX_BLOCKS} onClick={() => onChange(duplicateAt(blocks, index))}>
                  Duplicate
                </button>
                <button type="button" className="ed-button ed-button--danger" onClick={() => onChange(removeAt(blocks, index))}>
                  Delete
                </button>
              </div>
            </div>
            {isOpen && (
              <div className="ed-block__body">
                <p className="ed-muted ed-block__help">{BLOCK_HELP[block.type]}</p>
                {block.type === 'columns2' ? (
                  <ColumnsEditor block={block} onChange={(next) => onChange(replaceAt(blocks, index, next))} />
                ) : (
                  <BlockFields block={block} onChange={(next) => onChange(replaceAt(blocks, index, next as EmailBlock))} />
                )}
              </div>
            )}
          </div>
        )
      })}
      <div className="ed-row ed-add-row">
        <label className="ed-field">
          <span className="ed-field__label">Add a block</span>
          <select className="ed-input" value={adding} onChange={(event) => setAdding(event.target.value as EmailBlockType)}>
            {BLOCK_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ed-button"
          disabled={blocks.length >= MAX_BLOCKS}
          onClick={() => {
            onChange([...blocks, createBlock(adding)])
            setOpen((current) => ({ ...current, [blocks.length]: true }))
          }}
        >
          Add block
        </button>
        {blocks.length >= MAX_BLOCKS && <span className="ed-muted">An email can have up to {MAX_BLOCKS} blocks.</span>}
      </div>
    </div>
  )
}
