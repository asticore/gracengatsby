'use client'

import { readFlatDesign } from '@/lib/design/upgrade'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey, UiStringVars } from '@/features/uiStrings'

import type { SectionColumn, SectionNode } from '@/lib/sectionTree'
import { getElementDef } from '@/lib/elements/registry'

import { asBlockStyle, type BlockStyle } from '@/lib/blockStyle'
import { parseSectionLayout } from '@/lib/sectionLayout'

import { getBlockDef } from './blockSchemas'
import { pathKey, type NodePath } from './treeOps'
import { isHiddenEverywhere, planKeyMove, planNavDrop, toggleHideEverywhere, zoneFromOffset, type DropZone } from './navigatorOps'
import { toStoredDesign } from '@/lib/design/storeDesign'
import './navLibraryPresets.css'

interface NavigatorPanelProps {
  nodes: SectionNode[]
  selectedPath: NodePath | null
  onSelect: (path: NodePath) => void
  onRename: (path: NodePath, name: string) => void
  onSetAnchor: (path: NodePath, anchor: string) => void
  /** Expanded state keyed by pathKey; a node is expanded unless its entry is false. */
  expandedState?: Record<string, boolean>
  onExpandedStateChange?: (state: Record<string, boolean>) => void
  /** Move a block (drag or Alt+Up/Down): same arguments as the canvas handle-drag move. Enables reordering. */
  onMove?: (from: NodePath, containerPath: NodePath, at: number) => void
  /** Replace a node's design (used by the Hide toggle). Enables the Hide button. */
  onDesignChange?: (path: NodePath, design: Record<string, unknown>) => void
  /** True when the node at this path is locked for the current person (no drag, no hide). */
  isLocked?: (path: NodePath) => boolean
}

type Dnd = {
  onMove?: NavigatorPanelProps['onMove']
  onDesignChange?: NavigatorPanelProps['onDesignChange']
  isLocked?: NavigatorPanelProps['isLocked']
  dragFrom: NodePath | null
  setDragFrom: (p: NodePath | null) => void
  listLength: (path: NodePath) => number
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
  kind: 'section' | 'column' | 'block' | 'virtual'
  /** Tooltip for virtual (legacy part) rows. */
  hint?: string
  icon: string
  typeLabel: string
  name: string
  custom: boolean
  anchor: string
  design?: unknown
  /** Number of blocks in this column (column rows only). */
  blockCount?: number
  hasChildren: boolean
  children: Row[]
}

type Tr = (key: UiStringKey, vars?: UiStringVars) => string

function describe(node: SectionNode, index: number, t: Tr): Pick<Row, 'icon' | 'typeLabel' | 'name' | 'custom' | 'kind'> {
  const label = typeof node.label === 'string' ? node.label.trim() : ''
  if (node.blockType === 'section') {
    return { kind: 'section', icon: '▭', typeLabel: t('ve.nav.section'), name: label || t('ve.nav.sectionNumbered', { n: index + 1 }), custom: Boolean(label) }
  }
  let typeLabel = node.blockType
  let icon = '▫'
  if (node.blockType === 'element') {
    const def = getElementDef(String((node as { elementType?: string }).elementType || ''))
    const elType = String((node as { elementType?: string }).elementType || '')
    if (def) {
      typeLabel = def.label
      icon = def.icon
    } else typeLabel = elType ? elType.charAt(0).toUpperCase() + elType.slice(1) : t('ve.nav.element')
    if (!label) {
      const props = ((node as { props?: Record<string, unknown> }).props || {}) as Record<string, unknown>
      let main = ''
      for (const k of ['text', 'title', 'heading', 'frontTitle', 'quote', 'name']) {
        const v = props[k]
        if (typeof v === 'string' && v.trim()) {
          main = v.trim()
          break
        }
      }
      if (main) {
        if (main.length > 28) main = `${main.slice(0, 27)}…`
        return { kind: 'block', icon, typeLabel, name: `${typeLabel}: ${main}`, custom: false }
      }
    }
  } else {
    const def = getBlockDef(node.blockType)
    if (def) {
      typeLabel = def.label
      icon = def.icon
    }
  }
  return { kind: 'block', icon, typeLabel, name: label || typeLabel, custom: Boolean(label) }
}

function str(v: unknown): string {
  if (typeof v !== 'string') return ''
  const t = v.trim()
  return t.length > 28 ? `${t.slice(0, 27)}…` : t
}

function virtualParts(node: SectionNode, t: Tr): Array<[string, string, string]> {
  const n = node as Record<string, unknown>
  const part = (label: string, v: unknown): [string, string, string] => [label, label, str(v)]
  switch (node.blockType) {
    case 'hero':
      return [part(t('ve.nav.heading'), n.heading), part(t('ve.nav.subheading'), n.subheading), part(t('ve.nav.primaryButton'), n.primaryCtaLabel)]
    case 'ctaBanner':
      return [part(t('ve.nav.heading'), n.heading), part(t('ve.nav.text'), n.text), part(t('ve.nav.button'), n.buttonLabel)]
    case 'imageText':
      return [[t('ve.nav.image'), t('ve.nav.image'), ''], part(t('ve.nav.text'), n.text)]
    default:
      return []
  }
}

function buildRows(nodes: SectionNode[], base: NodePath, depth: number, t: Tr): Row[] {
  return nodes.map((node, i) => {
    const path = [...base, i]
    const info = describe(node, i, t)
    const columns: SectionColumn[] = node.blockType === 'section' && Array.isArray(node.columns) ? node.columns : []
    const mk = (extra: Pick<Row, 'kind' | 'icon' | 'typeLabel' | 'name'> & Partial<Row>, d: number, key: string): Row => ({
      key, path, depth: d, custom: false, anchor: '', hasChildren: false, children: [], ...extra,
    })
    const dispMode = node.blockType === 'section' ? parseSectionLayout(asBlockStyle(node.design).layout)?.display : undefined
    const panelKind = dispMode === 'tabs' ? 'Tab' : dispMode === 'accordion' ? 'Panel' : ''
    let children: Row[]
    if (columns.length === 1 && !panelKind) {
      // Single column: show its blocks directly under the section (real paths kept).
      children = buildRows(columns[0].blocks || [], [...path, 0], depth + 1, t)
    } else {
      children = columns.map((column, ci) => {
        const cPath = [...path, ci]
        const label = typeof column.label === 'string' ? column.label.trim() : ''
        const kids = buildRows(column.blocks || [], cPath, depth + 2, t)
        return {
          key: pathKey(cPath),
          path: cPath,
          depth: depth + 1,
          kind: 'column' as const,
          icon: '▯',
          typeLabel: t('ve.nav.column'),
          name: label || (dispMode === 'tabs' ? t('ve.nav.tabNumbered', { n: ci + 1 }) : dispMode === 'accordion' ? t('ve.nav.panelNumbered', { n: ci + 1 }) : t('ve.nav.columnNumbered', { n: ci + 1 })),
          custom: Boolean(label),
          anchor: (readFlatDesign(column.design).anchorId as string | undefined) || '',
          blockCount: (column.blocks || []).length,
          hasChildren: kids.length > 0,
          children: kids,
        }
      })
    }
    if (node.blockType !== 'section') {
      for (const [label, typeLabel, value] of virtualParts(node, t)) {
        children.push(mk({ kind: 'virtual', icon: '▫', typeLabel, name: value ? `${label}: ${value}` : label, hint: t('ve.nav.legacyHint') }, depth + 1, `${pathKey(path)}:${label}`))
      }
    }
    return {
      key: pathKey(path),
      path,
      depth,
      ...info,
      anchor: (readFlatDesign(node.design).anchorId as string | undefined) || '',
      design: node.design,
      hasChildren: children.length > 0,
      children,
    }
  })
}

/** A selected column of a single-column section is shown as the section row. */
function resolveSelectedKey(nodes: SectionNode[], sel: NodePath | null): string | null {
  if (!sel || !sel.length) return null
  if (sel.length % 2 === 0) {
    let node: SectionNode | undefined = nodes[sel[0]]
    for (let k = 1; node && k < sel.length - 1; k += 2) node = node.columns?.[sel[k]]?.blocks?.[sel[k + 1]]
    if (node && node.blockType === 'section' && node.columns?.length === 1) return pathKey(sel.slice(0, -1))
  }
  return pathKey(sel)
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

const readOnlyKind = (row: Row): boolean => row.kind === 'virtual'

const NavRow: React.FC<{
  row: Row
  expanded: Record<string, boolean>
  forceOpen: boolean
  selectedKey: string | null
  onToggle: (key: string) => void
  onSelect: (path: NodePath) => void
  onRename: (path: NodePath, name: string) => void
  onSetAnchor: (path: NodePath, anchor: string) => void
  dnd: Dnd
}> = ({ row, expanded, forceOpen, selectedKey, onToggle, onSelect, onRename, onSetAnchor, dnd }) => {
  const t = useAdminT()
  const [renaming, setRenaming] = useState(false)
  const [anchoring, setAnchoring] = useState(false)
  const [draft, setDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [dropZone, setDropZone] = useState<DropZone | null>(null)
  const isColumn = row.kind === 'column'
  const locked = Boolean(dnd.isLocked?.(row.path))
  const hidden = !isColumn && !readOnlyKind(row) && isHiddenEverywhere(row.design)
  const canDrag = Boolean(dnd.onMove) && !readOnlyKind(row) && !isColumn && !locked
  const rowRef = useRef<HTMLDivElement>(null)
  const selected = selectedKey === row.key
  const readOnly = row.kind === 'virtual'
  const activate = () => onSelect(row.path)
  const open = forceOpen || expanded[row.key] !== false

  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  const startRename = () => {
    if (readOnly) return
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
    if (readOnly) return
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
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      if (!canDrag) return
      const plan = planKeyMove(row.path, e.key === 'ArrowUp' ? -1 : 1, dnd.listLength(row.path))
      if (plan) dnd.onMove?.(row.path, plan.containerPath, plan.at)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
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
        className={`ve-nav__row${selected ? ' ve-nav__row--selected' : ''}${hidden ? ' ve-nav__row--hidden' : ''}${dropZone ? ` ve-nav__row--drop-${dropZone}` : ''}${dnd.dragFrom && pathKey(dnd.dragFrom) === row.key ? ' ve-nav__row--dragging' : ''}`}
        tabIndex={0}
        title={row.hint}
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) return
          e.dataTransfer.setData('application/x-ve-nav', pathKey(row.path))
          e.dataTransfer.effectAllowed = 'move'
          dnd.setDragFrom(row.path)
        }}
        onDragEnd={() => {
          dnd.setDragFrom(null)
          setDropZone(null)
        }}
        onDragOver={(e) => {
          const from = dnd.dragFrom
          if (!from || !dnd.onMove || row.kind === 'virtual' || locked) return
          const rect = e.currentTarget.getBoundingClientRect()
          const zone = zoneFromOffset(e.clientY - rect.top, rect.height, isColumn)
          if (!planNavDrop(row.path, isColumn, zone, row.blockCount)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (zone !== dropZone) setDropZone(zone)
        }}
        onDragLeave={() => setDropZone(null)}
        onDrop={(e) => {
          const from = dnd.dragFrom
          const zone = dropZone
          setDropZone(null)
          dnd.setDragFrom(null)
          if (!from || !zone || !dnd.onMove) return
          const plan = planNavDrop(row.path, isColumn, zone, row.blockCount)
          if (!plan) return
          e.preventDefault()
          dnd.onMove(from, plan.containerPath, plan.at)
        }}
        onClick={activate}
        onDoubleClick={startRename}
        onKeyDown={onRowKey}
      >
        <button
          type="button"
          className={`ve-nav__caret${row.hasChildren ? '' : ' ve-nav__caret--empty'}`}
          aria-label={open ? t('ve.nav.collapse') : t('ve.nav.expand')}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation()
            onToggle(row.key)
          }}
        >
          {open ? '▼' : '▶'}
        </button>
        <span className="ve-nav__icon" aria-hidden="true">
          {row.icon}
        </span>
        {renaming ? (
          <input
            className="ve-nav__input"
            autoFocus
            aria-label={t('ve.nav.renameType', { type: row.typeLabel })}
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
        {hidden && !renaming && <span className="ve-nav__flag" title={t('ve.nav.hiddenAll')} aria-label={t('ve.nav.hiddenAll')}>{String.fromCharCode(0x1f6ab)}</span>}
        {locked && !renaming && <span className="ve-nav__flag" title={t('ve.nav.locked')} aria-label={t('ve.nav.locked')}>{String.fromCharCode(0x1f512)}</span>}
        {row.kind === 'virtual' && <span className="ve-nav__type" title={row.hint}>legacy</span>}
        {row.anchor && !renaming && <span className="ve-nav__anchor" title={t('ve.nav.jumpLink', { anchor: row.anchor })}>#{row.anchor}</span>}
        {!renaming && !readOnly && (
          <span className="ve-nav__actions" onClick={(e) => e.stopPropagation()}>
            {dnd.onDesignChange && !isColumn && !locked && (
              <button
                type="button"
                className="ve-nav__icon-btn"
                title={hidden ? t('ve.nav.showOnAll') : t('ve.nav.hideOnAll')}
                aria-label={hidden ? t('ve.nav.showNamed', { name: row.name }) : t('ve.nav.hideNamed', { name: row.name })}
                aria-pressed={hidden}
                onClick={() => dnd.onDesignChange?.(row.path, toStoredDesign(toggleHideEverywhere(row.design) as unknown as BlockStyle))}
              >
                {hidden ? String.fromCharCode(0x1f576) : String.fromCharCode(0x1f441)}
              </button>
            )}
            <button type="button" className="ve-nav__icon-btn" title={t('ve.nav.rename')} aria-label={t('ve.nav.renameNamed', { name: row.name })} onClick={startRename}>✎</button>
            <button type="button" className="ve-nav__icon-btn" title={t('ve.nav.setAnchor')} aria-label={t('ve.nav.setAnchorNamed', { name: row.name })} onClick={startAnchor}>🔗</button>
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
              aria-label={t('ve.nav.anchorId')}
              placeholder={t('ve.nav.anchorPlaceholder')}
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
          <p className="ve-nav__hint">{t('ve.nav.anchorHintLead')} <code>#{draft || 'anchor'}</code>. {t('ve.nav.anchorHintTail')}</p>
        </>
      )}
      {row.anchor && !anchoring && selected && (
        <p className="ve-nav__hint">
          <button type="button" className="ve-nav__icon-btn" onClick={copyLink}>{copied ? t('ve.nav.copied') : t('ve.nav.copyLink', { anchor: row.anchor })}</button>
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
              dnd={dnd}
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
  onMove,
  onDesignChange,
  isLocked,
}) => {
  const [dragFrom, setDragFrom] = useState<NodePath | null>(null)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const t = useAdminT()
  const allRows = useMemo(() => buildRows(nodes, [], 0, t), [nodes, t])
  const rows = useMemo(() => (q ? filterRows(allRows, q) : allRows), [allRows, q])
  const selectedKey = useMemo(() => resolveSelectedKey(nodes, selectedPath), [nodes, selectedPath])

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
  const dnd: Dnd = useMemo(
    () => ({
      onMove,
      onDesignChange,
      isLocked,
      dragFrom,
      setDragFrom,
      listLength: (path: NodePath) => {
        let list: SectionNode[] = nodes
        for (let i = 0; i < path.length - 1; i += 2) list = list[path[i]]?.columns?.[path[i + 1]]?.blocks || []
        return list.length
      },
    }),
    [onMove, onDesignChange, isLocked, dragFrom, nodes],
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
          placeholder={t('ve.nav.searchPlaceholder')}
          aria-label={t('ve.nav.searchLabel')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="ve-nav__btn" onClick={expandAll}>{t('ve.nav.expand')}</button>
        <button type="button" className="ve-nav__btn" onClick={collapseAll}>{t('ve.nav.collapse')}</button>
      </div>
      {rows.length === 0 ? (
        <p className="ve-nav__empty">{q ? t('ve.nav.noMatches') : t('ve.nav.noSections')}</p>
      ) : (
        <ul className="ve-nav__tree" role="tree" aria-label={t('ve.nav.tree')}>
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
              dnd={dnd}
            />
          ))}
        </ul>
      )}
    </div>
  )
}