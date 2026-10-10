'use client'

import React, { useId } from 'react'
import { useFormFields } from '@/engine/ui'
import { parseColumns, type SectionColumn, type SectionNode } from '@/lib/sectionTree'
import { useCardOpen } from './collapseStore'
import './edit-collapse.css'

/**
 * Read-only tree of the page's visual layout: section > column > element.
 * Built from the form value of the page-builder blocks field, so it reflects
 * unsaved edits made in the form. Each node folds independently; open state is
 * remembered per user under ids `outline:<path>`.
 */

export type OutlineEntry = {
  id: string
  label: string
  meta?: string
  depth: number
  children: OutlineEntry[]
}

/** Accepts a parsed value or a JSON string; anything else yields undefined. */
function asJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return undefined
  }
}

function isBlockLike(value: unknown): value is SectionNode {
  return typeof value === 'object' && value !== null && typeof (value as SectionNode).blockType === 'string'
}

function humanize(blockType: string): string {
  const spaced = blockType.replace(/[-_]+/g, ' ').trim()
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : 'Block'
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** Builds the outline entries for a list of blocks. `base` is the path of the container. */
export function buildOutline(blocks: SectionNode[], base: number[] = [], depth = 0): OutlineEntry[] {
  let sectionCount = 0
  return blocks.map((block, index) => {
    const path = [...base, index]
    const isSection = block.blockType === 'section'
    const label = isSection ? `Section ${++sectionCount}` : humanize(block.blockType)
    const columns: SectionColumn[] = isSection ? parseColumns(asJson(block.columns)) : []

    return {
      id: `outline:${path.join('.')}`,
      label,
      meta: isSection ? plural(columns.length, 'column', 'columns') : undefined,
      depth,
      children: columns.map((column, columnIndex) => {
        const columnPath = [...path, columnIndex]
        const columnBlocks = column.blocks ?? []
        return {
          id: `outline:${columnPath.join('.')}`,
          label: `Column ${columnIndex + 1}`,
          meta: plural(columnBlocks.length, 'block', 'blocks'),
          depth: depth + 1,
          children: buildOutline(columnBlocks, columnPath, depth + 2),
        }
      }),
    }
  })
}

function OutlineRow({ entry }: { entry: OutlineEntry }) {
  const [open, toggle] = useCardOpen(entry.id)
  const childrenId = useId()
  const hasChildren = entry.children.length > 0

  return (
    <li className="ec-outline__item">
      <div className="ec-outline__row" data-depth={entry.depth} style={{ paddingLeft: `${entry.depth * 16 + 4}px` }}>
        {hasChildren ? (
          <button
            type="button"
            className="ec-outline__toggle"
            aria-expanded={open}
            aria-controls={childrenId}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${entry.label}`}
            onClick={toggle}
          >
            {open ? '▾' : '▸'}
          </button>
        ) : (
          <span className="ec-outline__bullet" aria-hidden="true" />
        )}
        <span className="ec-outline__label">{entry.label}</span>
        {entry.meta && <span className="ec-outline__meta">{entry.meta}</span>}
      </div>
      {hasChildren && (
        <ul id={childrenId} className="ec-outline__list" hidden={!open}>
          {entry.children.map((child) => (
            <OutlineRow key={child.id} entry={child} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function SectionOutline({ blocksField }: { blocksField: string }) {
  const raw = useFormFields(([fields]) => fields[blocksField]?.value)
  const parsed = asJson(raw)
  const blocks = Array.isArray(parsed) ? parsed.filter(isBlockLike) : []

  if (blocks.length === 0) {
    return <p className="doc-muted ec-outline__empty">No sections yet.</p>
  }

  const entries = buildOutline(blocks)
  return (
    <nav className="ec-outline" aria-label="Page structure">
      <ul className="ec-outline__list">
        {entries.map((entry) => (
          <OutlineRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </nav>
  )
}

export default SectionOutline
