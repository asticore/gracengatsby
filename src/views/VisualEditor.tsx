'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { closestCenter, DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'

import type { SectionNode } from '@/lib/sectionTree'
import { defaultColumns } from '@/lib/sectionTree'

import { getBlockDef } from './visualEditor/blockSchemas'
import { CanvasNodeList, type CanvasHandlers } from './visualEditor/Canvas'
import { ElementLibrary } from './visualEditor/ElementLibrary'
import { FieldPanel } from './visualEditor/FieldPanel'
import {
  cloneNode,
  getNode,
  insertNode,
  pathKey,
  reorderWithin,
  splitPath,
  stripEditorIds,
  updateNode,
  type NodePath,
} from './visualEditor/treeOps'
import { VISUAL_EDITOR_SURFACES } from './visualEditor/surfaces'
import { VISUAL_EDITOR_CSS } from './visualEditor/visualEditor.styles'

let idCounter = 0
const nextId = () => `ve-${Date.now()}-${idCounter++}`

function parsePath(): { mode: 'collection' | 'global'; slug: string; id?: string } | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/admin\/visual-editor\/(collection|global)\/([^/]+)(?:\/([^/]+))?/)
  if (!match) return null
  return { mode: match[1] as 'collection' | 'global', slug: match[2], id: match[3] }
}

/** Gives every node in a loaded tree a stable client id for selection and keys. */
function withIds(nodes: SectionNode[]): SectionNode[] {
  return nodes.map((node) => {
    const next: SectionNode = { ...node, _id: node._id || nextId() }
    if (node.blockType === 'section' && Array.isArray(node.columns)) {
      next.columns = node.columns.map((column) => ({
        ...column,
        _id: column._id || nextId(),
        blocks: withIds(column.blocks || []),
      }))
    }
    return next
  })
}

export const VisualEditorView: React.FC = () => {
  const route = useMemo(() => parsePath(), [])
  const surface = route ? VISUAL_EDITOR_SURFACES[route.slug] : undefined

  const [loading, setLoading] = useState(() => Boolean(route && surface))
  const [error, setError] = useState<string | null>(() => (route && surface ? null : 'Unknown editor target.'))
  const [blocks, setBlocks] = useState<SectionNode[]>([])
  const [docTitle, setDocTitle] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [selectedPath, setSelectedPath] = useState<NodePath | null>(null)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'publishing' | 'published' | 'error'>('idle')
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [library, setLibrary] = useState<{ containerPath: NodePath; at: number } | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const apiUrl = useMemo(() => {
    if (!route || !surface) return null
    return surface.kind === 'global' ? `/api/globals/${surface.slug}` : `/api/${surface.slug}/${route.id}`
  }, [route, surface])

  useEffect(() => {
    if (!apiUrl || !surface) return
    fetch(`${apiUrl}?depth=0`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        return res.json()
      })
      .then((json) => {
        const doc = json as Record<string, unknown>
        const raw = (doc?.[surface.blocksField] as SectionNode[] | undefined) || []
        setBlocks(withIds(raw))
        setDocTitle(surface.titleField ? String(doc?.[surface.titleField] || 'Untitled') : surface.label)
        setStatus((doc?._status as string) || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(String((err as Error)?.message || err))
        setLoading(false)
      })
  }, [apiUrl, surface])

  const selectedNode = selectedPath ? getNode(blocks, selectedPath) : undefined
  const selectedDef = selectedNode ? getBlockDef(selectedNode.blockType) : undefined

  /* ---------------------------------------------------------------------- */
  /* Tree mutations                                                          */
  /* ---------------------------------------------------------------------- */

  const addBlock = useCallback((blockType: string, containerPath: NodePath, at: number) => {
    const def = getBlockDef(blockType)
    if (!def) return

    const node: SectionNode = { ...(def.defaultValue() as SectionNode), _id: nextId() }
    // A brand-new section starts with two columns so it is immediately useful.
    if (blockType === 'section') node.columns = defaultColumns(2, nextId)

    setBlocks((prev) => insertNode(prev, containerPath, at, node))
    setSelectedPath([...containerPath, at])
    setLibrary(null)
  }, [])

  const deleteBlock = useCallback((path: NodePath) => {
    setBlocks((prev) => updateNode(prev, path, () => null))
    setSelectedPath(null)
  }, [])

  const duplicateBlock = useCallback((path: NodePath) => {
    const { containerPath, index } = splitPath(path)
    setBlocks((prev) => {
      const original = getNode(prev, path)
      if (!original) return prev
      return insertNode(prev, containerPath, index + 1, cloneNode(original, nextId))
    })
  }, [])

  const moveBlock = useCallback((path: NodePath, direction: -1 | 1) => {
    const { containerPath, index } = splitPath(path)
    setBlocks((prev) => reorderWithin(prev, containerPath, index, index + direction))
    setSelectedPath([...containerPath, index + direction])
  }, [])

  const updateSelected = useCallback(
    (next: Record<string, unknown>) => {
      if (!selectedPath) return
      setBlocks((prev) => updateNode(prev, selectedPath, (node) => ({ ...(next as SectionNode), _id: node._id })))
    },
    [selectedPath],
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const from = String(active.id).split('.').map(Number)
    const to = String(over.id).split('.').map(Number)

    // dnd-kit sorts within one SortableContext, and the top-level list is the
    // only one registered. Guard anyway so a stray cross-container drop is a
    // no-op rather than a corrupted tree - the up/down buttons move blocks
    // between columns.
    if (from.slice(0, -1).join('.') !== to.slice(0, -1).join('.')) return

    const containerPath = from.slice(0, -1)
    setBlocks((prev) => reorderWithin(prev, containerPath, from[from.length - 1], to[to.length - 1]))
    setSelectedPath(null)
  }

  /* ---------------------------------------------------------------------- */

  const save = async (publish: boolean) => {
    if (!apiUrl || !surface) return
    setSaving(publish ? 'publishing' : 'saving')
    try {
      const body: Record<string, unknown> = { [surface.blocksField]: stripEditorIds(blocks) }
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

  if (loading) return <div className="ve-loading-screen">Loading visual editor</div>

  if (error && blocks.length === 0) {
    return (
      <div className="ve-loading-screen ve-error">
        Couldn&apos;t load this document: {error}. <a href={backHref}>Go back</a>
      </div>
    )
  }

  const handlers: CanvasHandlers = {
    selectedKey: selectedPath ? pathKey(selectedPath) : null,
    onSelect: setSelectedPath,
    onAdd: (containerPath, at) => setLibrary({ containerPath, at }),
    onDelete: deleteBlock,
    onDuplicate: duplicateBlock,
    onMove: moveBlock,
  }

  const topLevelIds = blocks.map((_, index) => pathKey([index]))

  return (
    <div className="ve-root">
      {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
      <style dangerouslySetInnerHTML={{ __html: VISUAL_EDITOR_CSS }} />
      <div className="ve-topbar">
        <div className="ve-topbar__left">
          <a href={backHref} className="ve-btn ve-btn--ghost">
            Back
          </a>
          <span className="ve-topbar__title">
            Visual editor - {docTitle} {status && <span className="ve-topbar__status">({status})</span>}
          </span>
        </div>
        <div className="ve-topbar__actions">
          <button
            type="button"
            className="ve-btn ve-btn--ghost"
            onClick={() => setLibrary({ containerPath: [], at: blocks.length })}
          >
            + Add element
          </button>
          <div className="ve-device-toggle" role="group" aria-label="Preview device">
            <button
              type="button"
              className={`ve-device-btn ${device === 'desktop' ? 've-device-btn--active' : ''}`}
              onClick={() => setDevice('desktop')}
              aria-label="Desktop preview"
              title="Desktop preview"
            >
              Desktop
            </button>
            <button
              type="button"
              className={`ve-device-btn ${device === 'mobile' ? 've-device-btn--active' : ''}`}
              onClick={() => setDevice('mobile')}
              aria-label="Mobile preview"
              title="Mobile preview"
            >
              Mobile
            </button>
          </div>
          <button type="button" className="ve-btn" onClick={() => save(false)} disabled={saving === 'saving'}>
            {saving === 'saving' ? 'Saving' : saving === 'saved' ? 'Saved' : 'Save draft'}
          </button>
          <button
            type="button"
            className="ve-btn ve-btn--primary"
            onClick={() => save(true)}
            disabled={saving === 'publishing'}
          >
            {saving === 'publishing' ? 'Publishing' : saving === 'published' ? 'Published' : 'Publish'}
          </button>
        </div>
      </div>

      <div className="ve-body">
        <div className="ve-canvas-wrap" onClick={() => setSelectedPath(null)} role="presentation">
          <div className={`ve-canvas ve-canvas--${device}`}>
            {error && (
              <p className="ve-error" style={{ padding: 12 }}>
                {error}
              </p>
            )}

            {blocks.length === 0 && (
              <div className="ve-empty-canvas">
                This page has no sections yet.
                <br />
                <button
                  type="button"
                  className="ve-btn ve-btn--primary"
                  style={{ marginTop: 14 }}
                  onClick={() => setLibrary({ containerPath: [], at: 0 })}
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
        </div>

        {selectedNode && selectedDef && (
          <FieldPanel
            blockDef={selectedDef}
            data={selectedNode as Record<string, unknown>}
            onChange={updateSelected}
            onClose={() => setSelectedPath(null)}
            onDelete={() => selectedPath && deleteBlock(selectedPath)}
            onDuplicate={() => selectedPath && duplicateBlock(selectedPath)}
          />
        )}
      </div>

      {library && (
        <ElementLibrary
          title={library.containerPath.length === 0 ? 'Add an element' : 'Add to this column'}
          onPick={(blockType) => addBlock(blockType, library.containerPath, library.at)}
          onClose={() => setLibrary(null)}
        />
      )}
    </div>
  )
}

export default VisualEditorView
