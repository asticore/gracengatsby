'use client'

import React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

import { asBlockStyle, blockStyleToCss } from '@/lib/blockStyle'
import { sectionLayoutProps, type SectionLayout } from '@/lib/sectionLayout'
import { columnWidthVars, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { ShapeDivider } from '@/components/blocks/StyledBlock'
import { getBlockDef } from './blockSchemas'
import { CanvasBlockPreview } from './CanvasBlockPreview'
import { pathKey, type NodePath } from './treeOps'

export type CanvasHandlers = {
  selectedKey: string | null
  /** Lock state by node path key (see lockState.ts). A blocked node has its move/duplicate/delete disabled. */
  locks?: Record<string, { mode: 'structure' | 'full'; blocked: boolean }>
  onSelect: (path: NodePath) => void
  onAdd: (containerPath: NodePath, at: number) => void
  onDelete: (path: NodePath) => void
  onDuplicate: (path: NodePath) => void
  onMove: (path: NodePath, direction: -1 | 1) => void
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
    opacity: isDragging ? 0.4 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      data-ve-node={JSON.stringify(path)}
      className={`ve-node ${isSelected ? 've-node--selected' : ''} ${lock ? 've-node--locked' : ''} ve-node--depth-${Math.min(depth, 3)}`}
      style={wrapperStyle}
      onClick={(event) => {
        // Stop the click bubbling to an ancestor section, so clicking a nested
        // block selects that block rather than its container.
        event.stopPropagation()
        handlers.onSelect(path)
      }}
    >
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
          position="top"
        />
      )}
      <div className="ve-node__body">
        {node.blockType === 'section' ? (
          <SectionColumns columns={node.columns || []} layout={design.layout} path={path} handlers={handlers} depth={depth} />
        ) : (
          <div className="ve-node__preview">
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
          position="bottom"
        />
      )}
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
  if (columns.length === 0) {
    return (
      <div className="ve-section-empty">
        This section has no columns yet — add one from the Layout tab on the right.
      </div>
    )
  }

  return (
    <div
      className={flow.className ? `ve-section ${flow.className}` : 've-section'}
      {...flow.attrs}
      style={Object.keys(flow.style).length > 0 ? (flow.style as React.CSSProperties) : undefined}
    >
      {columns.map((column, columnIndex) => (
        <div
          className="ve-column"
          data-ve-column={JSON.stringify([...path, columnIndex])}
          key={column._id || columnIndex}
          style={{ ...columnWidthVars(column), ...blockStyleToCss(asBlockStyle(column.design)) }}
        >
          <div className="ve-column__tag">Column {columnIndex + 1}</div>
          <CanvasNodeList
            nodes={column.blocks || []}
            containerPath={[...path, columnIndex]}
            handlers={handlers}
            depth={depth + 1}
          />
        </div>
      ))}
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
