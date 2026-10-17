'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SectionColumn, SectionNode } from '@/lib/sectionTree'
import { getElementDef } from '@/lib/elements/registry'

import { getBlockDef } from './blockSchemas'
import { pathKey, type NodePath } from './treeOps'

interface NavigatorPanelProps {
  nodes: SectionNode[]
  selectedPath: NodePath | null
  onSelect: (path: NodePath) => void
  onRename: (path: NodePath, name: string) => void
  onSetAnchor: (path: NodePath, anchor: string) => void
  /** Expanded state keyed by pathKey; a node is expanded unless its entry is false. */
  expandedState?: Record<string, boolean>
  onExpandedStateChange?: (state: Record<string, boolean>) => void
}

/** Lowercase a-z0-9-_ only; must not start with a digit or hyphen (valid, linkable id). */
export function sanitiseAnchor(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/^[\d-]+/, '')
}

type Row = {
  key: string
  path: NodePath
  depth: number
  kind: 'section' | 'column' | 'block'
  icon: string
  typeLabel: string
  name: string
  custom: boolean
  anchor: string
  hasChildren: boolean
  children: Row[]
}

function describe(node: SectionNode, index: number): Pick<Row, 'icon' | 'typeLabel' | 'name' | 'custom' | 'kind'> {
  const label = typeof node.label === 'string' ? node.label.trim() : ''
  if (node.blockType === 'section') {
    return { kind: 'section', icon: '▭', typeLabel: 'Section', name: label || `Section ${index + 1}`, custom: Boolean(label) }
  }
  let typeLabel = node.blockType
  let icon = '▫'
  if (node.blockType === 'element') {
    const def = getElementDef(String((node as { elementType?: string }).elementType || ''))
    if (def) {
      typeLabel = def.label
      icon = def.icon
    } else typeLabel = 'Element'
  } else {
    const def = getBlockDef(node.blockType)
    if (def) {
      typeLabel = def.label
      icon = def.icon
    }
  }
  return { kind: 'block', icon, typeLabel, name: label || typeLabel, custom: Boolean(label) }
}

function buildRows(nodes: SectionNode[], base: NodePath, depth: number): Row[] {
  return nodes.map((node, i) => {
    const path = [...base, i]
    const info = describe(node, i)
    const columns: SectionColumn[] = node.blockType === 'section' && Array.isArray(node.columns) ? node.columns : []
    const children: Row[] = columns.map((column, ci) => {
      const cPath = [...path, ci]
      const label = typeof column.label === 'string' ? column.label.trim() : ''
      const kids = buildRows(column.blocks || [], cPath, depth + 2)
      return {
        key: pathKey(cPath),
        path: cPath,
        depth: depth + 1,
        kind: 'column' as const,
        icon: '▯',
        typeLabel: 'Column',
        name: label || `Column ${ci + 1}`,
        custom: Boolean(label),
        anchor: column.design?.anchorId || '',
        hasChildren: kids.length > 0,
        children: kids,
      }
    })
    return {
      key: pathKey(path),
      path,
      depth,
      ...info,
      anchor: node.design?.anchorId || '',
      hasChildren: children.length > 0,
      children,
    }
  })
}

function matches(row: Row, q: string): boolean {
  return `${row.name} ${row.typeLabel} ${row.anchor}`.toLowerCase().includes(q)
}

/** Rows to show for a search: a row stays if it or any descendant matches. */
function filterRows(rows: Row[], q: string): Row[] {
  const out: Row[] = []
  for (const row of rows) {
    const kids = filterRows(row.children, q)
    if (matches(row, q) || kids.length > 0) out.push({ ...row, children: kids })
  }
  return out
}

function collectKeys(rows: Row[], into: string[] = []): string[] {
  for (const r of rows) {
    if (r.hasChildren) into.push(r.key)
    collectKeys(r.children, into)
  }
  return into
}

const NavRow: React.FC<{
  row: Row
  expanded: Record<string, boolean>
  forceOpen: boolean
  selectedKey: string | null
  onToggle: (key: string) => void
  onSelect: (path: NodePath) => void
  onRename: (path: NodePath, name: string) => void
  onSetAnchor: (path: NodePath, anchor: string) => void
}> = ({ row, expanded, forceOpen, selectedKey, onToggle, onSelect, onRename, onSetAnchor }) => {
  const [renaming, setRenaming] = useState(false)
  const [anchoring, setAnchoring] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const rowRef = useRef<HTMLDivElement>(null)
  const selected = selectedKey === row.key
  const open = forceOpen || expanded[row.key] !== false

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  const startRename = () => {
    setDraft(row.custom ? row.name : '')
    setAnchoring(false)
    setRenaming(true)
  }
  const commitRename = () => {
    if (!renaming) return
    setRenaming(false)
    if (draft.trim() !== (row.custom ? row.name : '')) onRename(row.path, draft)
  }
  const startAnchor = () => {
    setDraft(row.anchor)
    setRenaming(false)
    setAnchoring(true)
  }
  const commitAnchor = () => {
    if (!anchoring) return
    setAnchoring(false)
    const next = sanitiseAnchor(draft)
    if (next !== row.anchor) onSetAnchor(row.path, next)
  }

  const onRowKey = (e: React.KeyboardEvent) => {
    if (renaming || anchoring || e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onSelect(row.path)
    } else if (e.key === 'F2') {
      e.preventDefault()
      startRename()
    } else if (e.key === 'ArrowRight' && row.hasChildren && !open) {
      e.preventDefault()
      onToggle(row.key)
    } else if (e.key === 'ArrowLeft' && row.hasChildren && open) {
      e.preventDefault()
      onToggle(row.key)
    }
  }

  const copyLink = () => {
    try {
      void navigator.clipboard?.writeText(`#${row.anchor}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <li role="treeitem" aria-expanded={row.hasChildren ? open : undefined} aria-selected={selected}>
      <div
        ref={rowRef}
        className={`ve-nav__row${selected ? ' ve-nav__row--selected' : ''}`}
        tabIndex={0}
        onClick={() => onSelect(row.path)}
        onDoubleClick={startRename}
        onKeyDown={onRowKey}
      >
        <button
          type="button"
          className={`ve-nav__caret${row.hasChildren ? '' : ' ve-nav__caret--empty'}`}
          aria-label={open ? 'Collapse' : 'Expand'}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(row.key)
          }}
        >
          {open ? '▼' : '▶'}
        </button>
        <span className="ve-nav__icon" aria-hidden="true">{row.icon}</span>
        {renaming ? (
          <input
            className="ve-nav__input"
            autoFocus
            aria-label={`Rename ${row.typeLabel}`}
            placeholder={row.custom ? row.typeLabel : row.name}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitRename()
              else if (e.key === 'Escape') setRenaming(false)
            }}
          />
        ) : (
          <>
            <span className="ve-nav__label" title={row.name}>{row.name}</span>
            {row.custom && row.kind !== 'column' && <span className="ve-nav__type">{row.typeLabel}</span>}
          </>
        )}
        {row.anchor && !renaming && <span className="ve-nav__anchor" title={`Jump link: #${row.anchor}`}>#{row.anchor}</span>}
        {!renaming && (
          <span className="ve-nav__actions" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="ve-nav__icon-btn" title="Rename (F2)" aria-label={`Rename ${row.name}`} onClick={startRename}>✎</button>
            <button type="button" className="ve-nav__icon-btn" title="Set anchor for jump links" aria-label={`Set anchor for ${row.name}`} onClick={startAnchor}>🔗</button>
          </span>
        )}
      </div>
      {anchoring && (
        <>
          <div className="ve-nav__anchor-edit">
            <span>#</span>
            <input
              className="ve-nav__input"
              autoFocus
              aria-label="Anchor id"
              placeholder="e.g. pricing"
              value={draft}
              onChange={(e) => setDraft(sanitiseAnchor(e.target.value))}
              onBlur={commitAnchor}
              onKeyDown={(e) => {
                e.stopPropagation()
                if (e.key === 'Enter') commitAnchor()
                else if (e.key === 'Escape') setAnchoring(false)
              }}
            />
          </div>
          <p className="ve-nav__hint">Link to it with <code>#{draft || 'anchor'}</code>. Letters, numbers, - and _ only.</p>
        </>
      )}
      {row.anchor && !anchoring && selected && (
        <p className="ve-nav__hint">
          <button type="button" className="ve-nav__icon-btn" onClick={copyLink}>{copied ? 'Copied' : `Copy #${row.anchor}`}</button>
        </p>
      )}
      {row.hasChildren && open && (
        <ul role="group">
          {row.children.map((child) => (
            <NavRow
              key={child.key}
              row={child}
              expanded={expanded}
              forceOpen={forceOpen}
              selectedKey={selectedKey}
              onToggle={onToggle}
              onSelect={onSelect}
              onRename={onRename}
              onSetAnchor={onSetAnchor}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

export const NavigatorPanel: React.FC<NavigatorPanelProps> = ({
  nodes,
  selectedPath,
  onSelect,
  onRename,
  onSetAnchor,
  expandedState = {},
  onExpandedStateChange,
}) => {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const allRows = useMemo(() => buildRows(nodes, [], 0), [nodes])
  const rows = useMemo(() => (q ? filterRows(allRows, q) : allRows), [allRows, q])
  const selectedKey = selectedPath && selectedPath.length ? pathKey(selectedPath) : null

  // Selecting on the canvas opens every ancestor so the row is visible.
  const selectedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!selectedPath || selectedKey === selectedRef.current) return
    selectedRef.current = selectedKey
    const ancestors = selectedPath.slice(0, -1).map((_, i) => pathKey(selectedPath.slice(0, i + 1)))
    if (ancestors.some((k) => expandedState[k] === false)) {
      const next = { ...expandedState }
      for (const k of ancestors) delete next[k]
      onExpandedStateChange?.(next)
    }
  }, [selectedPath, selectedKey, expandedState, onExpandedStateChange])

  const toggle = useCallback(
    (key: string) => onExpandedStateChange?.({ ...expandedState, [key]: expandedState[key] === false }),
    [expandedState, onExpandedStateChange],
  )
  const expandAll = () => onExpandedStateChange?.({})
  const collapseAll = () =>
    onExpandedStateChange?.(Object.fromEntries(collectKeys(allRows).map((k) => [k, false])))

  return (
    <div className="ve-nav">
      <div className="ve-nav__tools">
        <input
          type="search"
          className="ve-nav__search"
          placeholder="Search name, type or #anchor"
          aria-label="Search page structure"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="ve-nav__btn" onClick={expandAll}>Expand</button>
        <button type="button" className="ve-nav__btn" onClick={collapseAll}>Collapse</button>
      </div>
      {rows.length === 0 ? (
        <p className="ve-nav__empty">{q ? 'No matches.' : 'This page has no sections yet.'}</p>
      ) : (
        <ul className="ve-nav__tree" role="tree" aria-label="Page structure">
          {rows.map((row) => (
            <NavRow
              key={row.key}
              row={row}
              expanded={expandedState}
              forceOpen={Boolean(q)}
              selectedKey={selectedKey}
              onToggle={toggle}
              onSelect={onSelect}
              onRename={onRename}
              onSetAnchor={onSetAnchor}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
