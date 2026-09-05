'use client'

import React, { useEffect, useState } from 'react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import type { SectionNode } from '@/lib/sectionTree'

import { CanvasNodeList, type CanvasHandlers } from './Canvas'
import type { FrameToParentMessage, ParentToFrameMessage } from './canvasBridge'
import { CANVAS_ORIGIN, isBridgeMessage } from './canvasBridge'
import { pathKey, type NodePath } from './treeOps'
import { VISUAL_EDITOR_CSS } from './visualEditor.styles'

const post = (message: FrameToParentMessage) => {
  window.parent.postMessage(message, CANVAS_ORIGIN())
}

/**
 * Mounted at /visual-editor-canvas (inside the real (frontend) layout, so it
 * gets the actual styles.css, fonts, theme vars and Header/Footer) and shown
 * as an iframe by VisualEditor.tsx. Renders whatever block tree the parent
 * last sent down, using the exact same CanvasNodeList the old same-document
 * canvas used - only the interaction handlers changed, from direct callbacks
 * into postMessage requests. See canvasBridge.ts for why this split exists.
 */
export const CanvasFrame: React.FC = () => {
  const [blocks, setBlocks] = useState<SectionNode[]>([])
  const [selectedPath, setSelectedPath] = useState<NodePath | null>(null)
  const [dragHoverKey, setDragHoverKey] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CANVAS_ORIGIN() || event.source !== window.parent) return
      const data: unknown = event.data
      if (!isBridgeMessage(data)) return
      const msg = data as ParentToFrameMessage
      if (msg.type === 'init') {
        setBlocks(msg.blocks)
        setSelectedPath(msg.selectedPath)
      } else if (msg.type === 'selected') {
        setSelectedPath(msg.selectedPath)
      } else if (msg.type === 'dragHover') {
        setDragHoverKey(msg.key)
      }
    }
    window.addEventListener('message', onMessage)
    post({ source: 've-canvas', type: 'ready' })
    return () => window.removeEventListener('message', onMessage)
  }, [])

  const handlers: CanvasHandlers = {
    selectedKey: selectedPath ? pathKey(selectedPath) : null,
    dragHoverKey,
    onSelect: (path) => {
      setSelectedPath(path)
      post({ source: 've-canvas', type: 'select', path })
    },
    onAdd: (containerPath, at) => post({ source: 've-canvas', type: 'add', containerPath, at }),
    onDelete: (path) => post({ source: 've-canvas', type: 'delete', path }),
    onDuplicate: (path) => post({ source: 've-canvas', type: 'duplicate', path }),
    onMove: (path, direction) => post({ source: 've-canvas', type: 'move', path, direction }),
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = String(active.id).split('.').map(Number)
    const to = String(over.id).split('.').map(Number)
    if (from.slice(0, -1).join('.') !== to.slice(0, -1).join('.')) return

    const containerPath = from.slice(0, -1)
    post({ source: 've-canvas', type: 'reorder', containerPath, from: from[from.length - 1], to: to[to.length - 1] })
  }

  const topLevelIds = blocks.map((_, index) => pathKey([index]))

  const deselect = () => {
    setSelectedPath(null)
    post({ source: 've-canvas', type: 'select', path: null })
  }

  return (
    <div className="ve-frame-root" onClick={deselect} role="presentation">
      {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
      <style dangerouslySetInnerHTML={{ __html: VISUAL_EDITOR_CSS }} />

      {blocks.length === 0 && (
        <div className="ve-empty-canvas">
          This page has no sections yet.
          <br />
          <button
            type="button"
            className="ve-btn ve-btn--primary"
            style={{ marginTop: 14 }}
            onClick={(e) => {
              e.stopPropagation()
              post({ source: 've-canvas', type: 'add', containerPath: [], at: 0 })
            }}
          >
            Add your first element
          </button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={topLevelIds} strategy={verticalListSortingStrategy}>
          <CanvasNodeList nodes={blocks} containerPath={[]} handlers={handlers} depth={0} />
        </SortableContext>
      </DndContext>
    </div>
  )
}

export default CanvasFrame
