'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { getBlockDef } from './blockSchemas'
import { CanvasBlockPreview } from './CanvasBlockPreview'

export const SortableBlock: React.FC<{
  id: string
  data: Record<string, unknown>
  isSelected: boolean
  onSelect: () => void
}> = ({ id, data, isSelected, onSelect }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const blockDef = getBlockDef(data.blockType as string)

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`ve-canvas-block ${isSelected ? 've-canvas-block--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="ve-canvas-block__toolbar">
        <button type="button" className="ve-drag-handle" {...attributes} {...listeners} aria-label="Drag to reorder">
          ⠿
        </button>
        <span className="ve-canvas-block__label">
          {blockDef?.icon} {blockDef?.label || String(data.blockType)}
        </span>
      </div>
      <div className="ve-canvas-block__preview">
        <CanvasBlockPreview data={data} />
      </div>
    </div>
  )
}
