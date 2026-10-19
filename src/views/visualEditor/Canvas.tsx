'use client'

import React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

import { asBlockStyle, blockFxClasses, blockFxVars, blockStyleCss, blockStyleToCss, hasFxLayer, kenBurnsLayer, overlayStyle } from '@/lib/blockStyle'
import { carouselStyle, gridStyle, parseSectionLayout, resolveDirections, sectionLayoutProps, type SectionLayout } from '@/lib/sectionLayout'
import { columnWidthVars, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { ShapeDivider } from '@/components/blocks/StyledBlock'
import '@/components/blocks/tabs.css'

import ParticlesBackground from '@/components/blocks/ParticlesLazy'
import { BgNoise, BgSlideshow } from '@/components/blocks/BgSlideshow'
import { BgVideo } from '@/components/blocks/BgVideo'
import { getBlockDef } from './blockSchemas'
import { CanvasBlockPreview } from './CanvasBlockPreview'
import type { CanvasDevice, ColumnOp } from './canvasBridge'
import { columnPercentFor, resizeAdjacent } from './columnOps'
import { pathKey, type NodePath } from './treeOps'
import { lexicalToPlainText } from './richTextUtil'

/**
 * Get text fields that can be edited inline on the canvas for a block.
 * Includes simple text and textarea fields like Heading.text, Text.content, Button.text.
 */
function getEditableTextFields(node: SectionNode & Record<string, unknown>) {
  const blockDef = getBlockDef(node.blockType)
  if (!blockDef) return []
  // Filter to simple text/textarea fields that canEditAsPlainText can handle
  return blockDef.fields.filter((f) => (f.type === 'text' || f.type === 'textarea') && !f.supportsMergeTags)
}

/**
 * Get current value of a field from the block node.
 */
function getFieldValue(node: SectionNode & Record<string, unknown>, fieldName: string): string {
  const value = node[fieldName]
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'root' in value) {
    // Rich text (Lexical JSON) - convert to plain text
    return lexicalToPlainText(value)
  }
  return ''
}

export type CanvasHandlers = {
  selectedKey: string | null
  /** Lock state by node path key (see lockState.ts). A blocked node has its move/duplicate/delete disabled. */
  locks?: Record<string, { mode: 'structure' | 'full'; blocked: boolean }>
  onSelect: (path: NodePath) => void
  onAdd: (containerPath: NodePath, at: number) => void
  onDelete: (path: NodePath) => void
  onDuplicate: (path: NodePath) => void
  onMove: (path: NodePath, direction: -1 | 1) => void
  /** Column toolbar / empty-column actions (add, duplicate, delete, move, inner section). */
  onColumnOp?: (path: NodePath, op: ColumnOp) => void
  /** Double-click rename of a section tab / accordion panel (writes column.label, same as the Navigator). '' clears it. */
  onRenameColumn?: (path: NodePath, label: string) => void
  /** The device preview being edited (the top bar's toggle). Column widths are per device. */
  device?: CanvasDevice
  /** Drag-resize of a column boundary: `widths` is the percent width of every column of the section at `sectionPath`, for `device`. */
  onColumnWidths?: (sectionPath: NodePath, widths: number[]) => void
  /** Key (see slotKey below) of the insert slot a library-card drag is currently over, or null.
   *  Driven by the parent's 'dragHover' bridge message - the parent resolves drop targets
   *  itself via elementFromPoint, so this is purely for visual feedback. */
  dragHoverKey: string | null
  /** Key of the insert slot whose "+" was last clicked and hasn't been dismissed yet - stays
   *  lit (Elementor keeps its add-panel open the same way) until a block gets added there, a
   *  different node is selected, or the canvas is clicked elsewhere. Purely local UI state,
   *  tracked in CanvasFrame.tsx - see openInsertKey there. */
  openInsertKey: string | null
  /** Path of the block currently being dragged by its handle (dnd-kit), or null. Slots that
   *  would be invalid or no-op targets for it are disabled. */
  dragPath?: NodePath | null
}

/** Stable identity for an insert slot, matched against data-ve-container/data-ve-at by the
 *  parent's elementFromPoint lookup - see VisualEditor.tsx. */
export const slotKey = (containerPath: NodePath, at: number): string => `${pathKey(containerPath)}|${at}`

/**
 * Renders one level of the block tree. Sections recurse back into this
 * component for each of their columns, so nesting depth is unbounded and every
 * block - however deep - gets the same selection and toolbar behaviour.
 */
export const CanvasNodeList: React.FC<{
  nodes: SectionNode[]
  containerPath: NodePath
  handlers: CanvasHandlers
  depth: number
}> = ({ nodes, containerPath, handlers, depth }) => (
  <>
    <InsertSlot
      containerPath={containerPath}
      at={0}
      onAdd={handlers.onAdd}
      dragHoverKey={handlers.dragHoverKey}
      openInsertKey={handlers.openInsertKey}
      dragPath={handlers.dragPath}
      locks={handlers.locks}
      subtle={nodes.length > 0}
      empty={nodes.length === 0 && containerPath.length > 0}
    />
    {nodes.map((node, index) => {
      const path = [...containerPath, index]
      return (
        <React.Fragment key={node._id || `${pathKey(containerPath)}-${index}`}>
          <CanvasNode node={node} path={path} handlers={handlers} depth={depth} total={nodes.length} index={index} />
          <InsertSlot
            containerPath={containerPath}
            at={index + 1}
            onAdd={handlers.onAdd}
            dragHoverKey={handlers.dragHoverKey}
            openInsertKey={handlers.openInsertKey}
            dragPath={handlers.dragPath}
            locks={handlers.locks}
            subtle
          />
        </React.Fragment>
      )
    })}
  </>
)

const CanvasNode: React.FC<{
  node: SectionNode
  path: NodePath
  handlers: CanvasHandlers
  depth: number
  index: number
  total: number
}> = ({ node, path, handlers, depth, index, total }) => {
  const key = pathKey(path)
  const isSelected = handlers.selectedKey === key
  const def = getBlockDef(node.blockType)
  const design = asBlockStyle(node.design)
  const lock = handlers.locks?.[key]
  const blocked = Boolean(lock?.blocked)

  // The block itself is not moved while dragging (a DragOverlay ghost follows the pointer, see
  // CanvasFrame.tsx), so cross-container moves never fight a sortable list's transforms.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${key}`,
    data: { path, label: `${def?.icon ?? ''} ${def?.label || node.blockType}`.trim() },
    disabled: blocked,
  })

  const wrapperStyle: React.CSSProperties = {
    ...blockStyleToCss(design),
    ...blockFxVars(design),
    // Only override opacity while dragging; an unconditional `opacity: undefined` would drop the design's opacity.
    ...(isDragging ? { opacity: 0.4 } : {}),
  }
  // Tablet / mobile overrides: the canvas iframe is as wide as the previewed device, so the same
  // media rules the live page uses apply here (hidden-on-this-device blocks are faded, not removed).
  const scopeId = `ve-n-${path.join('_')}`
  const deviceCss = blockStyleCss(design, scopeId, { editor: true })
  const hasMinHeight = [design.minHeight, design.tablet?.minHeight, design.mobile?.minHeight].some((v) => typeof v === 'number')

  return (
    <div
      ref={setNodeRef}
      id={scopeId}
      data-ve-node={JSON.stringify(path)}
      className={`ve-node ${isSelected ? 've-node--selected' : ''} ${lock ? 've-node--locked' : ''} ${hasMinHeight ? 've-node--minh' : ''} ${blockFxClasses(design)} ve-node--depth-${Math.min(depth, 3)} ${depth === 0 && index === 0 ? 've-node--first' : ''}`}
      style={wrapperStyle}
      onClick={(event) => {
        // Stop the click bubbling to an ancestor section, so clicking a nested
        // block selects that block rather than its container.
        event.stopPropagation()
        handlers.onSelect(path)
      }}
    >
      {deviceCss && <style dangerouslySetInnerHTML={{ __html: deviceCss }} />}
      {design.parallax === 'background' && design.bgType === 'image' && design.bgImageUrl && (
        <div className="be-fx be-fx--parbg" aria-hidden="true" style={{ backgroundImage: `url(${design.bgImageUrl})` }} />
      )}
      {(() => { const kb = kenBurnsLayer(design); return kb ? <div className={kb.className} aria-hidden="true" style={kb.style} /> : null })()}
      <BgSlideshow design={design} />
      {design.bgType === 'video' &&<BgVideo src={design.bgVideoUrl} poster={design.bgVideoPoster} loop={design.bgVideoLoop} />}
      {hasFxLayer(design) && (
        <div className={`be-fx be-fx--${design.bgEffect}`} aria-hidden="true">
          {design.bgEffect === 'particles' && (
            <ParticlesBackground
              count={design.particlesCount ?? 50}
              interact={design.particlesInteract ?? 'repel'}
              color={design.bgEffectColor || '#6366f1'}
              sizeMin={design.particlesSizeMin}
              sizeMax={design.particlesSizeMax}
              speed={design.particlesSpeed}
              opacity={design.particlesOpacity === undefined ? undefined : design.particlesOpacity / 100}
              links={design.particlesLinks}
              linkDistance={design.particlesLinkDistance}
              interactRadius={design.particlesInteractRadius}
              shape={design.particlesShape}
            />
          )}
        </div>
      )}
      <BgNoise design={design} />
      {(() => { const o = overlayStyle(design); return o ? <div className="be-fx be-fx--overlay" aria-hidden="true" style={o} /> : null })()}
      <div className="ve-node__toolbar">
        <button type="button" className="ve-drag-handle" {...attributes} {...(blocked ? {} : listeners)} disabled={blocked} aria-label="Drag to move">
          ⠿
        </button>
        <span className="ve-node__label">
          {lock && (
            <span className="ve-node__lock" role="img" aria-label={lock.mode === 'full' ? 'Fully locked' : 'Structure locked'} title={lock.mode === 'full' ? 'Fully locked' : 'Structure locked: text only'}>
              🔒{' '}
            </span>
          )}
          {def?.icon} {def?.label || node.blockType}
        </span>
        <span className="ve-node__spacer" />
        <button
          type="button"
          className="ve-node__act"
          onClick={(e) => {
            e.stopPropagation()
            handlers.onMove(path, -1)
          }}
          disabled={blocked || index === 0}
          aria-label="Move up"
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          className="ve-node__act"
          onClick={(e) => {
            e.stopPropagation()
            handlers.onMove(path, 1)
          }}
          disabled={blocked || index === total - 1}
          aria-label="Move down"
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="ve-node__act"
          disabled={blocked}
          onClick={(e) => {
            e.stopPropagation()
            handlers.onDuplicate(path)
          }}
          aria-label="Duplicate"
          title="Duplicate"
        >
          ⧉
        </button>
        <button
          type="button"
          className="ve-node__act ve-node__act--danger"
          disabled={blocked}
          onClick={(e) => {
            e.stopPropagation()
            handlers.onDelete(path)
          }}
          aria-label="Delete"
          title="Delete"
        >
          ✕
        </button>
      </div>
      {/* Shape dividers are real rendered SVGs on the live site (StyledBlock),
          not a CSS style - so the wrapperStyle above (blockStyleToCss) alone
          never showed them here. Rendering the same <ShapeDivider> around the
          body keeps the canvas honest with what Save/Publish produces. */}
      {design.dividerTop && (
        <ShapeDivider
          shape={design.dividerTop}
          color={design.dividerTopColor}
          height={design.dividerTopHeight}
          flip={design.dividerTopFlip}
          anim={design.dividerTopAnim}
          speed={design.dividerTopSpeed}
          position="top"
        />
      )}
      <div className="ve-node__body">
        {node.blockType === 'section' ? (
          <SectionColumns columns={node.columns || []} layout={design.layout} path={path} handlers={handlers} depth={depth} />
        ) : (
          <div
            className="ve-node__preview"
            onDoubleClick={(e) => {
              e.stopPropagation()
              // Double-click on text blocks triggers inline edit mode
              // Send message to parent with block info; parent opens editor
              const blockId = node._id || pathKey(path)
              const editableFields = getEditableTextFields(node)
              if (editableFields.length > 0) {
                const field = editableFields[0]
                const value = getFieldValue(node, field.name)
                window.parent.postMessage(
                  {
                    source: 've-canvas',
                    type: 'requestEdit',
                    blockId,
                    blockType: node.blockType,
                    elementType: node.elementType,
                    field: field.name,
                    value,
                    path,
                    device: 'desktop', // Placeholder - parent supplies actual device
                  },
                  window.location.origin
                )
              }
            }}
          >
            <CanvasBlockPreview data={node as Record<string, unknown>} />
          </div>
        )}
      </div>
      {design.dividerBottom && (
        <ShapeDivider
          shape={design.dividerBottom}
          color={design.dividerBottomColor}
          height={design.dividerBottomHeight}
          flip={design.dividerBottomFlip}
          anim={design.dividerBottomAnim}
          speed={design.dividerBottomSpeed}
          position="bottom"
        />
      )}
    </div>
  )
}

/**
 * Inline title editor for a tab / accordion panel. Enter or blur calls onDone with the draft,
 * Escape calls onDone(null) to cancel. Local state only; `done` guards against the blur that
 * follows Enter/Escape unmounting the input.
 */
const TabLabelInput: React.FC<{ initial: string; placeholder: string; onDone: (value: string | null) => void }> = ({ initial, placeholder, onDone }) => {
  const [draft, setDraft] = React.useState(initial)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const doneRef = React.useRef(false)
  React.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const finish = (value: string | null) => {
    if (doneRef.current) return
    doneRef.current = true
    onDone(value)
  }
  return (
    <input
      ref={inputRef}
      className="ve-tabs-bar__label-input"
      value={draft}
      placeholder={placeholder}
      aria-label="Tab title"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => finish(draft)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') {
          e.preventDefault()
          finish(draft)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          finish(null)
        }
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    />
  )
}

/** The custom property columnWidthVars() writes for each device (see sectionTree.ts). */
const WIDTH_VAR: Record<CanvasDevice, string> = { desktop: '--be-col-d', tablet: '--be-col-t', mobile: '--be-col-m' }

/**
 * Where the drag-resize handles go: one at each boundary whose two columns sit side by side.
 * `left` is the boundary's position, as a percent of the section, from the start of its row. A
 * column that would wrap onto a new row has no handle on its left.
 */
function resizeBoundaries(widths: number[]): { index: number; left: number }[] {
  const out: { index: number; left: number }[] = []
  let used = 0
  for (let i = 0; i < widths.length - 1; i++) {
    if (used > 0 && used + widths[i] > 100 + 1e-6) used = 0
    used += widths[i]
    if (used + widths[i + 1] <= 100 + 1e-6) out.push({ index: i, left: used })
  }
  return out
}

type ResizeDrag = {
  startX: number
  inner: number
  start: number[]
  cols: HTMLElement[]
  prop: string
  saved: string[]
  last: number[]
  moved: boolean
}

/**
 * The thin bar between two neighbouring columns (Elementor-style). Dragging moves the boundary:
 * the two columns are previewed by setting their width custom property directly, and one
 * `onCommit` on release turns the whole drag into a single tree update (one undo step). Defined
 * at module level so it keeps its identity across renders.
 */
const ColumnResizeHandle: React.FC<{
  index: number
  left: number
  widths: number[]
  device: CanvasDevice
  disabled: boolean
  onCommit: (widths: number[]) => void
}> = ({ index, left, widths, device, disabled, onCommit }) => {
  const [tip, setTip] = React.useState<[number, number] | null>(null)
  const drag = React.useRef<ResizeDrag | null>(null)

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (disabled || event.button !== 0) return
    const section = event.currentTarget.parentElement
    if (!section) return
    const cols = Array.from(section.children).filter((el): el is HTMLElement => el instanceof HTMLElement && el.classList.contains('ve-column'))
    const pair = [cols[index], cols[index + 1]]
    if (!pair[0] || !pair[1]) return
    const style = getComputedStyle(section)
    const inner = section.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0)
    if (inner <= 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const prop = WIDTH_VAR[device]
    drag.current = {
      startX: event.clientX,
      inner,
      start: widths,
      cols: pair,
      prop,
      saved: pair.map((col) => col.style.getPropertyValue(prop)),
      last: widths,
      moved: false,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const next = resizeAdjacent(d.start, index, ((event.clientX - d.startX) / d.inner) * 100)
    d.last = next
    d.moved = next.some((w, i) => w !== d.start[i])
    d.cols.forEach((col, k) => col.style.setProperty(d.prop, `${next[index + k]}%`))
    setTip([next[index], next[index + 1]])
  }

  const finish = (event: React.PointerEvent<HTMLDivElement>, commit: boolean) => {
    const d = drag.current
    drag.current = null
    setTip(null)
    if (!d) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (commit && d.moved) {
      // Keep the preview on the columns: the tree update arrives with the same widths.
      onCommit(d.last)
      return
    }
    d.cols.forEach((col, k) => {
      if (d.saved[k]) col.style.setProperty(d.prop, d.saved[k])
      else col.style.removeProperty(d.prop)
    })
  }

  return (
    <div
      className={`ve-col-resize${tip ? ' ve-col-resize--active' : ''}`}
      style={{ left: `${left}%` }}
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize columns ${index + 1} and ${index + 2}`}
      aria-disabled={disabled || undefined}
      title="Drag to resize these two columns"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finish(event, true)}
      onPointerCancel={(event) => finish(event, false)}
      onClick={(event) => event.stopPropagation()}
    >
      {tip && <span className="ve-col-resize__tip" role="status">{`${tip[0]}% / ${tip[1]}%`}</span>}
    </div>
  )
}

const SectionColumns: React.FC<{
  columns: SectionColumn[]
  /** The section's optional flow settings (design.layout), same data the live page renders. */
  layout?: SectionLayout
  path: NodePath
  handlers: CanvasHandlers
  depth: number
}> = ({ columns, layout, path, handlers, depth }) => {
  const flow = sectionLayoutProps(layout, 've-section')
  const parsedLayout = parseSectionLayout(layout)
  const display = parsedLayout?.display
  const panelMode = display === 'tabs' || display === 'accordion'
  // Which panel shows in tabs / accordion mode. Selecting a column (or anything inside it)
  // from elsewhere - navigator, canvas click - switches to it.
  const [activeIdx, setActiveIdx] = React.useState(0)
  // Tab / panel whose title is being renamed by double-click (null = none). Local UI state only.
  const [editingIdx, setEditingIdx] = React.useState<number | null>(null)
  const prefix = `${pathKey(path)}.`
  const selKey = handlers.selectedKey
  const selIdx = panelMode && selKey && selKey.startsWith(prefix) ? Number(selKey.slice(prefix.length).split('.')[0]) : null
  const [seenSel, setSeenSel] = React.useState<number | null>(null)
  if (seenSel !== selIdx) {
    setSeenSel(selIdx)
    if (selIdx !== null && Number.isInteger(selIdx)) setActiveIdx(selIdx)
  }
  if (columns.length === 0) {
    return (
      <div className="ve-section-empty">
        This section has no columns yet — add one from the Layout tab on the right.
      </div>
    )
  }

  const ownerLocked = Boolean(handlers.locks?.[pathKey(path)]?.blocked)

  if (panelMode) {
    const active = Math.min(Math.max(activeIdx, 0), columns.length - 1)
    const fallbackOf = (i: number) => (display === 'tabs' ? `Tab ${i + 1}` : `Panel ${i + 1}`)
    const titleOf = (c: SectionColumn, i: number) => c.label || fallbackOf(i)
    const pick = (event: React.MouseEvent, i: number) => {
      event.stopPropagation()
      setActiveIdx(i)
      handlers.onSelect([...path, i])
    }
    const startRename = (event: React.MouseEvent, i: number) => {
      event.stopPropagation()
      if (!ownerLocked) setEditingIdx(i)
    }
    const finishRename = (column: SectionColumn, i: number, value: string | null) => {
      setEditingIdx(null)
      if (value === null) return
      const next = value.trim()
      if (next !== (column.label || '')) handlers.onRenameColumn?.([...path, i], next)
    }
    const colorVar = parsedLayout?.tabsColor ? ({ '--be-tab-color': parsedLayout.tabsColor } as React.CSSProperties) : undefined
    const addBtn = (
      <button
        type="button"
        className="ve-tabs-bar__add"
        disabled={ownerLocked}
        onClick={(e) => {
          e.stopPropagation()
          handlers.onColumnOp?.([...path, columns.length - 1], 'add')
        }}
        aria-label={display === 'tabs' ? 'Add tab' : 'Add panel'}
        title={display === 'tabs' ? 'Add tab' : 'Add panel'}
      >
        +
      </button>
    )
    const renderPanel = (column: SectionColumn, i: number) => (
      <CanvasColumn
        key={column._id || i}
        column={column}
        columnPath={[...path, i]}
        index={i}
        count={columns.length}
        handlers={handlers}
        depth={depth}
        ownerLocked={ownerLocked}
      />
    )
    if (display === 'tabs') {
      return (
        <div className="ve-section ve-tabs" style={colorVar}>
          <div className="ve-tabs-bar" role="tablist" data-align={parsedLayout?.tabsAlign || 'start'}>
            {columns.map((column, i) =>
              editingIdx === i && !ownerLocked ? (
                <span key={column._id || i} className={`ve-tabs-bar__tab ve-tabs-bar__tab--editing ${i === active ? 've-tabs-bar__tab--active' : ''}`}>
                  <TabLabelInput initial={column.label || ''} placeholder={fallbackOf(i)} onDone={(value) => finishRename(column, i, value)} />
                </span>
              ) : (
                <button key={column._id || i} type="button" role="tab" aria-selected={i === active} className={`ve-tabs-bar__tab ${i === active ? 've-tabs-bar__tab--active' : ''}`} onClick={(e) => pick(e, i)} onDoubleClick={(e) => startRename(e, i)}>
                  {titleOf(column, i)}
                </button>
              ),
            )}
            {addBtn}
          </div>
          {renderPanel(columns[active], active)}
        </div>
      )
    }
    return (
      <div className="ve-section ve-tabs" style={colorVar}>
        {columns.map((column, i) => (
          <React.Fragment key={column._id || i}>
            {editingIdx === i && !ownerLocked ? (
              <div className={`ve-acc-head ve-acc-head--editing ${i === active ? 've-acc-head--active' : ''}`}>
                <TabLabelInput initial={column.label || ''} placeholder={fallbackOf(i)} onDone={(value) => finishRename(column, i, value)} />
                <span aria-hidden="true">{i === active ? String.fromCharCode(0x2212) : '+'}</span>
              </div>
            ) : (
              <button type="button" className={`ve-acc-head ${i === active ? 've-acc-head--active' : ''}`} aria-expanded={i === active} onClick={(e) => pick(e, i)} onDoubleClick={(e) => startRename(e, i)}>
                <span>{titleOf(column, i)}</span>
                <span aria-hidden="true">{i === active ? String.fromCharCode(0x2212) : '+'}</span>
              </button>
            )}
            {i === active && renderPanel(column, i)}
          </React.Fragment>
        ))}
        {addBtn}
      </div>
    )
  }

  const slides = columns.map((column, columnIndex) => (
    <CanvasColumn
      key={column._id || columnIndex}
      column={column}
      columnPath={[...path, columnIndex]}
      index={columnIndex}
      count={columns.length}
      handlers={handlers}
      depth={depth}
      ownerLocked={ownerLocked}
    />
  ))
  if (display === 'grid') {
    // Same columns, laid out as the live grid (same .be-grid rules, so the breakpoints match the site).
    const boxedWidth = flow.style['--be-boxed']
    const vars = { ...gridStyle(layout), ...(boxedWidth ? { '--be-boxed': boxedWidth } : {}) }
    return (
      <div className="ve-grid">
        <p className="ve-grid__hint">Grid: each column is a cell</p>
        <div className={flow.className ? `be-grid ${flow.className}` : 'be-grid'} style={vars as React.CSSProperties}>
          {slides}
        </div>
      </div>
    )
  }
  if (display === 'modal') {
    // Shown inline so the content can be edited; the live site hides it behind a button.
    const label = parseSectionLayout(layout)?.modalLabel || 'Open'
    return (
      <div className="ve-modal">
        <p className="ve-modal__hint">Popup: opens from a button on the live site (button text: {label}). Edit the content here.</p>
        <div className={flow.className ? `ve-section ${flow.className}` : 've-section'} {...flow.attrs} style={Object.keys(flow.style).length > 0 ? (flow.style as React.CSSProperties) : undefined}>
          {slides}
        </div>
      </div>
    )
  }
  if (display === 'carousel') {
    // Same columns, laid out as the live carousel's horizontal scroll-snap track.
    return (
      <div className="ve-carousel">
        <p className="ve-carousel__hint">Carousel: each column is a slide</p>
        <div className="ve-section ve-carousel__track" style={carouselStyle(layout) as React.CSSProperties}>
          {slides}
        </div>
      </div>
    )
  }
  // Drag-resize handles between side-by-side columns. Not drawn where the section stacks on this
  // device (the widths then are only a share of the full width), when a width is px / auto / fill,
  // or for the scroll-story modes (their columns are cards / steps / a track, not a row to resize).
  const device: CanvasDevice = handlers.device ?? 'desktop'
  const scrollStory = display === 'stack' || display === 'hscroll' || display === 'sticky-steps'
  const stacked = resolveDirections(parseSectionLayout(layout))[device].startsWith('column')
  const percents = columns.map((column) => columnPercentFor(column, device))
  const boundaries =
    handlers.onColumnWidths && !stacked && !scrollStory && percents.every((p): p is number => p !== null) ? resizeBoundaries(percents as number[]) : []
  const row = (
    <div
      className={flow.className ? `ve-section ${flow.className}` : 've-section'}
      {...flow.attrs}
      style={Object.keys(flow.style).length > 0 ? (flow.style as React.CSSProperties) : undefined}
    >
      {slides}
      {boundaries.map(({ index, left }) => (
        <ColumnResizeHandle
          key={index}
          index={index}
          left={left}
          widths={percents as number[]}
          device={device}
          disabled={ownerLocked}
          onCommit={(next) => handlers.onColumnWidths?.(path, next)}
        />
      ))}
    </div>
  )
  if (scrollStory) {
    return (
      <div className="ve-scroll-story">
        <span className="ve-scroll-story__badge">Scroll story preview on live page</span>
        {row}
      </div>
    )
  }
  return row
}

/**
 * One column on the canvas. Selectable like a block (its path is an even-length one): hovering
 * outlines it in green, clicking selects it and opens its settings, and the selected column
 * carries a small toolbar (move left / right, add, duplicate, delete).
 */
const CanvasColumn: React.FC<{
  column: SectionColumn
  columnPath: NodePath
  index: number
  count: number
  handlers: CanvasHandlers
  depth: number
  ownerLocked: boolean
}> = ({ column, columnPath, index, count, handlers, depth, ownerLocked }) => {
  const selected = handlers.selectedKey === pathKey(columnPath)
  const design = asBlockStyle(column.design)
  const scopeId = `ve-c-${columnPath.join('_')}`
  const deviceCss = blockStyleCss(design, scopeId, { editor: true })
  const op = (event: React.MouseEvent, name: ColumnOp) => {
    event.stopPropagation()
    handlers.onColumnOp?.(columnPath, name)
  }
  const empty = (column.blocks || []).length === 0

  return (
    <div
      id={scopeId}
      className={`ve-column ${selected ? 've-column--selected' : ''} ${blockFxClasses(design)}`}
      data-ve-column={JSON.stringify(columnPath)}
      style={{ ...columnWidthVars(column), ...blockStyleToCss(design) }}
      onClick={(event) => {
        // A block inside stops its own click, so this only fires for the column itself.
        event.stopPropagation()
        handlers.onSelect(columnPath)
      }}
    >
      {deviceCss && <style dangerouslySetInnerHTML={{ __html: deviceCss }} />}
      <div className="ve-column__tag">Column {index + 1}</div>
      {selected && (
        <div className="ve-column__toolbar" role="toolbar" aria-label={`Column ${index + 1} actions`}>
          <button type="button" className="ve-column__act" disabled={ownerLocked || index === 0} onClick={(e) => op(e, 'moveLeft')} aria-label="Move column left" title="Move column left">
            {'←'}
          </button>
          <button type="button" className="ve-column__act" disabled={ownerLocked || index === count - 1} onClick={(e) => op(e, 'moveRight')} aria-label="Move column right" title="Move column right">
            {'→'}
          </button>
          <button type="button" className="ve-column__act" disabled={ownerLocked} onClick={(e) => op(e, 'add')} aria-label="Add column" title="Add column after this one">
            +
          </button>
          <button type="button" className="ve-column__act" disabled={ownerLocked} onClick={(e) => op(e, 'duplicate')} aria-label="Duplicate column" title="Duplicate column">
            {'⧉'}
          </button>
          <button type="button" className="ve-column__act ve-column__act--danger" disabled={ownerLocked || count <= 1} onClick={(e) => op(e, 'delete')} aria-label="Delete column" title={count <= 1 ? 'A section needs at least one column' : 'Delete column'}>
            {'✕'}
          </button>
        </div>
      )}
      <CanvasNodeList nodes={column.blocks || []} containerPath={columnPath} handlers={handlers} depth={depth + 1} />
      {empty && !ownerLocked && (
        <button type="button" className="ve-column__inner" onClick={(e) => op(e, 'innerSection')}>
          Add inner section
        </button>
      )}
    </div>
  )
}

/**
 * The hover "+" that opens the element library at a specific position -
 * Elementor's circular add button between/around blocks. Also doubles as a
 * drop target for a card dragged out of the library (see ElementLibrary.tsx):
 * it carries data-ve-container/data-ve-at/data-ve-slot so the parent
 * document can find it via elementFromPoint and resolve a drop, since a
 * native dragover/drop listener attached here (inside the iframe's own
 * document) doesn't reliably fire for a drag that started in the parent
 * document - see VisualEditor.tsx and canvasBridge.ts's 'dragHover' message.
 */
const InsertSlot: React.FC<{
  containerPath: NodePath
  at: number
  onAdd: (containerPath: NodePath, at: number) => void
  dragHoverKey: string | null
  openInsertKey: string | null
  dragPath?: NodePath | null
  locks?: CanvasHandlers['locks']
  subtle?: boolean
  /** The container has no blocks: render as a visible "Drop a block here" zone. */
  empty?: boolean
}> = ({ containerPath, at, onAdd, dragHoverKey, openInsertKey, dragPath, locks, subtle, empty }) => {
  const key = slotKey(containerPath, at)

  // A handle-drag can't land inside the dragged block, next to itself (a no-op), or in a
  // container whose owner is locked for this person.
  let disabled = !dragPath
  if (dragPath) {
    const inside = containerPath.length >= dragPath.length && dragPath.every((v, i) => containerPath[i] === v)
    const parent = dragPath.slice(0, -1)
    const idx = dragPath[dragPath.length - 1]
    const sameList = parent.length === containerPath.length && parent.every((v, i) => containerPath[i] === v)
    const noop = sameList && (at === idx || at === idx + 1)
    const lockedTarget = containerPath.length > 0 && Boolean(locks?.[pathKey(containerPath.slice(0, -1))]?.blocked)
    disabled = inside || noop || lockedTarget
  }
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${pathKey(containerPath)}:${at}`,
    data: { containerPath, at },
    disabled,
  })

  const active = dragHoverKey === key || (isOver && !disabled)
  const isOpen = openInsertKey === key

  return (
    <div
      ref={setNodeRef}
      className={`ve-insert ${subtle ? '' : 've-insert--always'} ${empty ? 've-insert--empty' : ''} ${active ? 've-insert--drag-over' : ''} ${isOpen ? 've-insert--open' : ''}`}
      data-ve-slot="1"
      data-ve-container={JSON.stringify(containerPath)}
      data-ve-at={at}
    >
      <button
        type="button"
        className="ve-insert__btn"
        onClick={(e) => {
          e.stopPropagation()
          onAdd(containerPath, at)
        }}
        aria-label={isOpen ? 'Close element picker' : 'Add an element here'}
        title={isOpen ? 'Close element picker' : 'Add an element here'}
      >
        +
      </button>
    </div>
  )
}
