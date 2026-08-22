'use client'

import React, { useEffect, useMemo, useState } from 'react'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'

import { getBlockDef, VISUAL_BLOCKS, type CanvasBlock } from './visualEditor/blockSchemas'
import { CanvasBlockPreview } from './visualEditor/CanvasBlockPreview'
import { FieldPanel } from './visualEditor/FieldPanel'
import { SortableBlock } from './visualEditor/SortableBlock'
import { VISUAL_EDITOR_SURFACES } from './visualEditor/surfaces'
import './visualEditor/visualEditor.css'

let idCounter = 0
const nextTempId = () => `ve-${Date.now()}-${idCounter++}`

function parsePath(): { mode: 'collection' | 'global'; slug: string; id?: string } | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/admin\/visual-editor\/(collection|global)\/([^/]+)(?:\/([^/]+))?/)
  if (!match) return null
  return { mode: match[1] as 'collection' | 'global', slug: match[2], id: match[3] }
}

export const VisualEditorView: React.FC = () => {
  const route = useMemo(() => parsePath(), [])
  const surface = route ? VISUAL_EDITOR_SURFACES[route.slug] : undefined

  const [loading, setLoading] = useState(() => Boolean(route && surface))
  const [error, setError] = useState<string | null>(() => (route && surface ? null : 'Unknown editor target.'))
  const [blocks, setBlocks] = useState<CanvasBlock[]>([])
  const [docTitle, setDocTitle] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'publishing' | 'published' | 'error'>('idle')
  const [activeDragId, setActiveDragId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const apiUrl = useMemo(() => {
    if (!route || !surface) return null
    return surface.kind === 'global' ? `/api/globals/${surface.slug}` : `/api/${surface.slug}/${route.id}`
  }, [route, surface])

  useEffect(() => {
    if (!apiUrl) return
    fetch(`${apiUrl}?depth=0`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((json) => {
        const doc = json as Record<string, unknown>
        const rawBlocks = (doc?.[surface!.blocksField] as Record<string, unknown>[] | undefined) || []
        setBlocks(rawBlocks.map((b) => ({ ...b, _tempId: nextTempId() }) as CanvasBlock))
        setDocTitle(surface!.titleField ? String(doc?.[surface!.titleField] || 'Untitled') : surface!.label)
        setStatus((doc?._status as string) || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(String((err as Error)?.message || err))
        setLoading(false)
      })
  }, [apiUrl, surface])

  const selectedIndex = blocks.findIndex((b) => b._tempId === selectedId)
  const selectedBlock = selectedIndex >= 0 ? blocks[selectedIndex] : null
  const selectedDef = selectedBlock ? getBlockDef(selectedBlock.blockType) : null

  const updateBlock = (tempId: string, next: Record<string, unknown>) => {
    setBlocks((prev) => prev.map((b) => (b._tempId === tempId ? ({ ...next, _tempId: tempId } as CanvasBlock) : b)))
  }

  const deleteBlock = (tempId: string) => {
    setBlocks((prev) => prev.filter((b) => b._tempId !== tempId))
    setSelectedId(null)
  }

  const duplicateBlock = (tempId: string) => {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b._tempId === tempId)
      if (idx === -1) return prev
      const copy = { ...prev[idx], _tempId: nextTempId() }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  const addBlock = (blockType: string) => {
    const def = getBlockDef(blockType)
    if (!def) return
    const block = { ...def.defaultValue(), _tempId: nextTempId() } as CanvasBlock
    setBlocks((prev) => [...prev, block])
    setSelectedId(block._tempId)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDragId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return
    setBlocks((prev) => {
      const oldIndex = prev.findIndex((b) => b._tempId === active.id)
      const newIndex = prev.findIndex((b) => b._tempId === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  const save = async (publish: boolean) => {
    if (!apiUrl || !surface) return
    setSaving(publish ? 'publishing' : 'saving')
    try {
      const cleaned = blocks.map(({ _tempId, ...rest }) => rest)
      const body: Record<string, unknown> = { [surface.blocksField]: cleaned }
      if (publish) body._status = 'published'
      const res = await fetch(apiUrl, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      setSaving(publish ? 'published' : 'saved')
      if (publish) setStatus('published')
      setTimeout(() => setSaving('idle'), 2000)
    } catch (err) {
      setSaving('error')
      setError(String((err as Error).message || err))
    }
  }

  const backHref = surface
    ? surface.kind === 'global'
      ? `/admin/globals/${surface.slug}`
      : `/admin/collections/${surface.slug}/${route?.id}`
    : '/admin'

  if (loading) return <div className="ve-loading-screen">Loading visual editor…</div>

  if (error && blocks.length === 0) {
    return (
      <div className="ve-loading-screen ve-error">
        Couldn&apos;t load this document: {error}. <a href={backHref}>Go back</a>
      </div>
    )
  }

  const activeBlock = activeDragId ? blocks.find((b) => b._tempId === activeDragId) : null

  return (
    <div className="ve-root">
      <div className="ve-topbar">
        <div className="ve-topbar__left">
          <a href={backHref} className="ve-btn ve-btn--ghost">
            ← Back
          </a>
          <span className="ve-topbar__title">
            Visual editor - {docTitle} {status && <span className="ve-topbar__status">({status})</span>}
          </span>
        </div>
        <div className="ve-topbar__actions">
          <button type="button" className="ve-btn" onClick={() => save(false)} disabled={saving === 'saving'}>
            {saving === 'saving' ? 'Saving…' : saving === 'saved' ? 'Saved ✓' : 'Save draft'}
          </button>
          <button
            type="button"
            className="ve-btn ve-btn--primary"
            onClick={() => save(true)}
            disabled={saving === 'publishing'}
          >
            {saving === 'publishing' ? 'Publishing…' : saving === 'published' ? 'Published ✓' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="ve-body">
        <div className="ve-canvas-wrap">
          <div className="ve-canvas">
            {error && <p className="ve-error" style={{ padding: 12 }}>{error}</p>}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={(e) => setActiveDragId(String(e.active.id))}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={blocks.map((b) => b._tempId)} strategy={verticalListSortingStrategy}>
                {blocks.length === 0 && (
                  <div className="ve-empty-canvas">This page has no sections yet - add one below to get started.</div>
                )}
                {blocks.map((block) => (
                  <SortableBlock
                    key={block._tempId}
                    id={block._tempId}
                    data={block}
                    isSelected={block._tempId === selectedId}
                    onSelect={() => setSelectedId(block._tempId)}
                  />
                ))}
              </SortableContext>
              <DragOverlay>{activeBlock ? <CanvasBlockPreview data={activeBlock} /> : null}</DragOverlay>
            </DndContext>
          </div>

          <div className="ve-palette">
            {VISUAL_BLOCKS.map((def) => (
              <button key={def.slug} type="button" className="ve-palette__item" onClick={() => addBlock(def.slug)}>
                {def.icon} + {def.label}
              </button>
            ))}
          </div>
        </div>

        {selectedBlock && selectedDef && (
          <FieldPanel
            blockDef={selectedDef}
            data={selectedBlock}
            onChange={(next) => updateBlock(selectedBlock._tempId, next)}
            onClose={() => setSelectedId(null)}
            onDelete={() => deleteBlock(selectedBlock._tempId)}
            onDuplicate={() => duplicateBlock(selectedBlock._tempId)}
          />
        )}
      </div>
    </div>
  )
}

export default VisualEditorView
