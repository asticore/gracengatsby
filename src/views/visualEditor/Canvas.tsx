'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { asBlockStyle, blockStyleToCss } from '@/lib/blockStyle'
import type { SectionColumn, SectionNode } from '@/lib/sectionTree'

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
    <InsertSlot containerPath={containerPath} at={0} onAdd={handlers.onAdd} subtle={nodes.length > 0} />
    {nodes.map((node, index) => {
      const path = [...containerPath, index]
      return (
        <React.Fragment key={node._id || `${pathKey(containerPath)}-${index}`}>
          <CanvasNode node={node} path={path} handlers={handlers} depth={depth} total={nodes.length} index={index} />
          <InsertSlot containerPath={containerPath} at={index + 1} onAdd={handlers.onAdd} subtle />
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
          ⠿
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
          ⧉
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
          ✕
        </button>
      </div>

      <div className="ve-node__body">
        {node.blockType === 'section' ? (
          <SectionColumns columns={node.columns || []} path={path} handlers={handlers} depth={depth} />
        ) : (
          <div className="ve-node__preview">
            <CanvasBlockPreview data={node as Record<string, unknown>} />
          </div>
        )}
      </div>
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
          className={`ve-column ve-column--${column.width ?? 12}`}
          key={column._id || columnIndex}
          style={blockStyleToCss(asBlockStyle(column.design))}
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

/** The hover "+" that opens the element library at a specific position. */
const InsertSlot: React.FC<{
  containerPath: NodePath
  at: number
  onAdd: (containerPath: NodePath, at: number) => void
  subtle?: boolean
}> = ({ containerPath, at, onAdd, subtle }) => (
  <div className={`ve-insert ${subtle ? '' : 've-insert--always'}`}>
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
