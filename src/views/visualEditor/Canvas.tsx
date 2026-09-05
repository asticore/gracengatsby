'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { asBlockStyle, blockStyleToCss } from '@/lib/blockStyle'
import { columnWidthVars, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { ShapeDivider } from '@/components/blocks/StyledBlock'
import { getBlockDef } from './blockSchemas'
import { CanvasBlockPreview } from './CanvasBlockPreview'
import { pathKey, type NodePath } from './treeOps'

export type CanvasHandlers = {
  selectedKey: string | null
  onSelect: (path: NodePath) => void
  onAdd: (containerPath: NodePath, at: number) => void
  onDelete: (path: NodePath) => void
  onDuplicate: (path: NodePath) => void
  onMove: (path: NodePath, direction: -1 | 1) => void
  /** A block dragged in from the element library was dropped at this slot. */
  onDropBlock: (containerPath: NodePath, at: number, blockType: string) => void
}

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
      onDropBlock={handlers.onDropBlock}
      subtle={nodes.length > 0}
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
            onDropBlock={handlers.onDropBlock}
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

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: key })

  const wrapperStyle: React.CSSProperties = {
    ...blockStyleToCss(design),
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      className={`ve-node ${isSelected ? 've-node--selected' : ''} ve-node--depth-${Math.min(depth, 3)}`}
      style={wrapperStyle}
      onClick={(event) => {
        // Stop the click bubbling to an ancestor section, so clicking a nested
        // block selects that block rather than its container.
        event.stopPropagation()
        handlers.onSelect(path)
      }}
    >
      <div className="ve-node__toolbar">
        <button type="button" className="ve-drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
          ⋿
        </button>
        <span className="ve-node__label">
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
          disabled={index === 0}
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
          disabled={index === total - 1}
          aria-label="Move down"
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="ve-node__act"
          onClick={(e) => {
            e.stopPropagation()
            handlers.onDuplicate(path)
          }}
          aria-label="Duplicate"
          title="Duplicate"
        >
          ⦇
        </button>
        <button
          type="button"
          className="ve-node__act ve-node__act--danger"
          onClick={(e) => {
            e.stopPropagation()
            handlers.onDelete(path)
          }}
          aria-label="Delete"
          title="Delete"
        >
          ✗
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
          <SectionColumns columns={node.columns || []} path={path} handlers={handlers} depth={depth} />
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
  path: NodePath
  handlers: CanvasHandlers
  depth: number
}> = ({ columns, path, handlers, depth }) => {
  if (columns.length === 0) {
    return (
      <div className="ve-section-empty">
        This section has no columns yet — add one from the Layout tab on the right.
      </div>
    )
  }

  return (
    <div className="ve-section">
      {columns.map((column, columnIndex) => (
        <div
          className="ve-column"
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
 * drop target: dragging a card out of the library (see ElementLibrary.tsx)
 * sets `application/x-ve-block` on the native dataTransfer, which any slot
 * along the drag path can accept directly (no cross-iframe coordinate math
 * needed - the browser's own native DnD already delivers dragover/drop to
 * whatever element the pointer is over, iframe boundary included, since
 * it's one browser-level drag session).
 */
const InsertSlot: React.FC<{
  containerPath: NodePath
  at: number
  onAdd: (containerPath: NodePath, at: number) => void
  onDropBlock: (containerPath: NodePath, at: number, blockType: string) => void
  subtle?: boolean
}> = ({ containerPath, at, onAdd, onDropBlock, subtle }) => {
  const [dragOver, setDragOver] = React.useState(false)

  return (
    <div
      className={`ve-insert ${subtle ? '' : 've-insert--always'} ${dragOver ? 've-insert--drag-over' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('application/x-ve-block')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragOver) setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        const blockType = e.dataTransfer.getData('application/x-ve-block')
        setDragOver(false)
        if (!blockType) return
        e.preventDefault()
        e.stopPropagation()
        onDropBlock(containerPath, at, blockType)
      }}
    >
      <button
        type="button"
        className="ve-insert__btn"
        onClick={(e) => {
          e.stopPropagation()
          onAdd(containerPath, at)
        }}
        aria-label="Add an element here"
        title="Add an element here"
      >
        +
      </button>
    </div>
  )
}
