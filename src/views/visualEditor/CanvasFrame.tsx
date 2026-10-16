'use client'

import React, { useEffect, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'

import type { SectionNode } from '@/lib/sectionTree'

import { CanvasNodeList, slotKey, type CanvasHandlers } from './Canvas'
import type { FrameToParentMessage, ParentToFrameMessage } from './canvasBridge'
import { CANVAS_ORIGIN, isBridgeMessage } from './canvasBridge'
import { pathKey, type NodePath } from './treeOps'
import { VISUAL_EDITOR_CSS } from './visualEditor.styles'

/** Pointer must be within this many px of a valid insert slot for a drop to count. */
const SLOT_REACH = 160

/**
 * Picks the insert slot nearest the pointer (2D distance to each slot's rect, ties broken by
 * vertical distance to its centre). Slots are the only droppables, so a drop anywhere over a
 * block body or an empty column still resolves to the closest valid slot; far from every
 * slot (or outside the page) there is no target and the drop is refused.
 */
const nearestSlot: CollisionDetection = ({ droppableContainers, droppableRects, pointerCoordinates, collisionRect }) => {
  const px = pointerCoordinates?.x ?? (collisionRect ? collisionRect.left + collisionRect.width / 2 : 0)
  const py = pointerCoordinates?.y ?? (collisionRect ? collisionRect.top + collisionRect.height / 2 : 0)
  let best: { id: string | number; score: number; d: number; data: unknown } | null = null
  for (const container of droppableContainers) {
    if (container.disabled) continue
    const rect = droppableRects.get(container.id)
    if (!rect) continue
    const dx = Math.max(rect.left - px, 0, px - (rect.left + rect.width))
    const dy = Math.max(rect.top - py, 0, py - (rect.top + rect.height))
    const d = Math.hypot(dx, dy)
    if (d > SLOT_REACH) continue
    const score = d * 10000 + Math.abs(py - (rect.top + rect.height / 2))
    if (!best || score < best.score) best = { id: container.id, score, d, data: container }
  }
  return best ? [{ id: best.id, data: { droppableContainer: best.data, value: best.d } }] : []
}

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
  const [locks, setLocks] = useState<NonNullable<CanvasHandlers['locks']>>({})
  const [dragHoverKey, setDragHoverKey] = useState<string | null>(null)
  // Which "+" is currently open (Elementor-style: it stays lit, not just a hover flash, until
  // dismissed) - purely local, since it's canvas UI state rather than document content the
  // parent needs to know about. Cleared below whenever the parent pushes a fresh selection
  // (a block just got added, or something else claimed the selection) or the user clicks a
  // different node or empty canvas.
  const [openInsertKey, setOpenInsertKey] = useState<string | null>(null)

  // Block being dragged by its handle (dnd-kit): its path, and the label shown on the ghost.
  const [drag, setDrag] = useState<{ path: NodePath; label: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CANVAS_ORIGIN() || event.source !== window.parent) return
      const data: unknown = event.data
      if (!isBridgeMessage(data)) return
      const msg = data as ParentToFrameMessage
      if (msg.type === 'init') {
        setBlocks(msg.blocks)
        setLocks(msg.locks ?? {})
        setSelectedPath(msg.selectedPath)
        setOpenInsertKey(null)
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
    locks,
    dragHoverKey,
    openInsertKey,
    dragPath: drag?.path ?? null,
    onSelect: (path) => {
      setSelectedPath(path)
      setOpenInsertKey(null)
      post({ source: 've-canvas', type: 'select', path })
    },
    onAdd: (containerPath, at) => {
      const key = slotKey(containerPath, at)
      // A second click on the same "+" (now showing as an "x", see visualEditor.styles.ts)
      // just closes it again, rather than opening a second picker on top of itself.
      setOpenInsertKey((current) => (current === key ? null : key))
      post({ source: 've-canvas', type: 'add', containerPath, at })
    },
    onDelete: (path) => post({ source: 've-canvas', type: 'delete', path }),
    onDuplicate: (path) => post({ source: 've-canvas', type: 'duplicate', path }),
    onMove: (path, direction) => post({ source: 've-canvas', type: 'move', path, direction }),
  }

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { path?: NodePath; label?: string } | undefined
    if (!data?.path) return
    setDrag({ path: data.path, label: data.label || 'Block' })
    setDragOver(false)
    setOpenInsertKey(null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const from = drag?.path
    setDrag(null)
    setDragOver(false)
    const target = event.over?.data.current as { containerPath?: NodePath; at?: number } | undefined
    if (!from || !target || !target.containerPath || typeof target.at !== 'number') return
    post({ source: 've-canvas', type: 'moveTo', from, containerPath: target.containerPath, at: target.at })
  }

  const handleDragCancel = () => {
    setDrag(null)
    setDragOver(false)
  }

  const deselect = () => {
    setSelectedPath(null)
    setOpenInsertKey(null)
    post({ source: 've-canvas', type: 'select', path: null })
  }

  return (
    <div
      className={`ve-frame-root ${drag ? (dragOver ? 've-frame-root--dragging' : 've-frame-root--no-drop') : ''}`}
      data-ve-root="1"
      onClick={deselect}
      role="presentation"
    >
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

      <DndContext
        sensors={sensors}
        collisionDetection={nearestSlot}
        onDragStart={handleDragStart}
        onDragOver={(event) => setDragOver(Boolean(event.over))}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <CanvasNodeList nodes={blocks} containerPath={[]} handlers={handlers} depth={0} />
        <DragOverlay dropAnimation={null}>
          {drag ? <div className="ve-drag-ghost">{drag.label}</div> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}

export default CanvasFrame
