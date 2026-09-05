'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'
import { defaultColumns } from '@/lib/sectionTree'

import { getBlockDef } from './visualEditor/blockSchemas'
import { CANVAS_ORIGIN, isBridgeMessage, type FrameToParentMessage } from './visualEditor/canvasBridge'
import { EditorDock, type DockTab } from './visualEditor/EditorDock'
import {
  cloneNode,
  getNode,
  insertNode,
  insertNodes,
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
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')
  const [dockTab, setDockTab] = useState<DockTab>('elements')
  // Where the next element/template pick lands. Always defined (unlike the
  // old popup's open/closed state) since the dock is always visible now -
  // defaults to the end of the page until a specific "+" sets it.
  const [insertTarget, setInsertTarget] = useState<{ containerPath: NodePath; at: number }>({
    containerPath: [],
    at: 0,
  })
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [frameReady, setFrameReady] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)

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
        const withStableIds = withIds(raw)
        setBlocks(withStableIds)
        setInsertTarget({ containerPath: [], at: withStableIds.length })
        setDocTitle(surface.titleField ? String(doc?.[surface.titleField] || 'Untitled') : surface.label)
        setStatus((doc?._status as string) || null)
        setLoading(false)
      })
      .catch((err) => {
        setError(String((err as Error)?.message || err))
        setLoading(false)
      })
  }, [apiUrl, surface])

  // Warns before a tab close/refresh discards unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const selectedNode = selectedPath ? getNode(blocks, selectedPath) : undefined
  const selectedDef = selectedNode ? getBlockDef(selectedNode.blockType) : undefined

  /* ---------------------------------------------------------------------- */
  /* Tree mutations                                                          */
  /* ---------------------------------------------------------------------- */

  /** A fresh node for a block type - a brand-new section starts with two columns so it is immediately useful. */
  const buildNode = useCallback((blockType: string): SectionNode | null => {
    const def = getBlockDef(blockType)
    if (!def) return null
    const node: SectionNode = { ...(def.defaultValue() as SectionNode), _id: nextId() }
    if (blockType === 'section') node.columns = defaultColumns(2, nextId)
    return node
  }, [])

  const addBlock = useCallback(
    (blockType: string) => {
      const node = buildNode(blockType)
      if (!node) return
      const { containerPath, at } = insertTarget

      setBlocks((prev) => insertNode(prev, containerPath, at, node))
      setSelectedPath([...containerPath, at])
      setDockTab('settings')
      setDirty(true)
    },
    [insertTarget, buildNode],
  )

  /** Same as addBlock, but for a drag-and-drop from the library that already knows its own target. */
  const addBlockAt = useCallback(
    (blockType: string, containerPath: NodePath, at: number) => {
      const node = buildNode(blockType)
      if (!node) return

      setBlocks((prev) => insertNode(prev, containerPath, at, node))
      setSelectedPath([...containerPath, at])
      setInsertTarget({ containerPath, at: at + 1 })
      setDockTab('settings')
      setDirty(true)
    },
    [buildNode],
  )

  /** Templates (a curated preset or a saved Page Template) insert several blocks at once. */
  const addTemplateBlocks = useCallback(
    (templateBlocks: SectionNode[]) => {
      if (templateBlocks.length === 0) return
      const { containerPath, at } = insertTarget
      const withFreshIds = templateBlocks.map((node) => cloneNode({ ...node, _id: undefined }, nextId))

      setBlocks((prev) => insertNodes(prev, containerPath, at, withFreshIds))
      setSelectedPath([...containerPath, at])
      setDockTab('settings')
      setDirty(true)
    },
    [insertTarget],
  )

  const deleteBlock = useCallback((path: NodePath) => {
    setBlocks((prev) => updateNode(prev, path, () => null))
    setSelectedPath(null)
    setDirty(true)
  }, [])

  const duplicateBlock = useCallback((path: NodePath) => {
    const { containerPath, index } = splitPath(path)
    setBlocks((prev) => {
      const original = getNode(prev, path)
      if (!original) return prev
      return insertNode(prev, containerPath, index + 1, cloneNode(original, nextId))
    })
    setDirty(true)
  }, [])

  const moveBlock = useCallback((path: NodePath, direction: -1 | 1) => {
    const { containerPath, index } = splitPath(path)
    setBlocks((prev) => reorderWithin(prev, containerPath, index, index + direction))
    setSelectedPath([...containerPath, index + direction])
    setDirty(true)
  }, [])

  const updateSelected = useCallback(
    (next: Record<string, unknown>) => {
      if (!selectedPath) return
      setBlocks((prev) => updateNode(prev, selectedPath, (node) => ({ ...(next as SectionNode), _id: node._id })))
      setDirty(true)
    },
    [selectedPath],
  )

  const reorderBlock = useCallback((containerPath: NodePath, from: number, to: number) => {
    setBlocks((prev) => reorderWithin(prev, containerPath, from, to))
    setSelectedPath(null)
    setDirty(true)
  }, [])

  /* ---------------------------------------------------------------------- */
  /* Canvas iframe bridge - see visualEditor/canvasBridge.ts                */
  /* ---------------------------------------------------------------------- */

  // Handles every request the canvas iframe sends up. The frame never
  // mutates its own copy of the tree for these (only local selection state) -
  // it waits for the "blocks"/"selected" push below, same as every other
  // consumer of this state.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== iframeRef.current?.contentWindow) return
      const data: unknown = event.data
      if (!isBridgeMessage(data)) return
      const msg = data as FrameToParentMessage
      switch (msg.type) {
        case 'ready':
          setFrameReady(true)
          break
        case 'select':
          setSelectedPath(msg.path)
          setDockTab(msg.path ? 'settings' : 'elements')
          break
        case 'add':
          setInsertTarget({ containerPath: msg.containerPath, at: msg.at })
          setDockTab('elements')
          break
        case 'delete':
          deleteBlock(msg.path)
          break
        case 'duplicate':
          duplicateBlock(msg.path)
          break
        case 'move':
          moveBlock(msg.path, msg.direction)
          break
        case 'reorder':
          reorderBlock(msg.containerPath, msg.from, msg.to)
          break
        case 'drop':
          addBlockAt(msg.blockType, msg.containerPath, msg.at)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [deleteBlock, duplicateBlock, moveBlock, reorderBlock, addBlockAt])

  // Pushes the current tree + selection down to the frame whenever either
  // changes (including every keystroke made in the field panel), and once
  // more as soon as the frame announces it has mounted and can receive it.
  useEffect(() => {
    if (!frameReady) return
    iframeRef.current?.contentWindow?.postMessage(
      { source: 've-canvas', type: 'init', blocks, selectedPath },
      CANVAS_ORIGIN(),
    )
  }, [frameReady, blocks, selectedPath])

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
      setDirty(false)
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

  return (
    <div className="ve-root">
      {/* eslint-disable-next-line react/no-danger -- static string constant, no user input */}
      <style dangerouslySetInnerHTML={{ __html: VISUAL_EDITOR_CSS }} />
      <div className="ve-topbar">
        <div className="ve-topbar__left">
          <a
            href={backHref}
            className="ve-btn ve-btn--ghost"
            onClick={(event) => {
              if (!dirty) return
              event.preventDefault()
              if (window.confirm('You have unsaved changes. Leave without saving?')) {
                window.location.href = backHref
              }
            }}
          >
            Back
          </a>
          <button
            type="button"
            className="ve-btn ve-btn--ghost ve-btn--icon"
            onClick={() => setDockCollapsed((c) => !c)}
            aria-label={dockCollapsed ? 'Show panel' : 'Collapse panel'}
            title={dockCollapsed ? 'Show panel' : 'Collapse panel'}
          >
            {dockCollapsed ? '»' : '«'}
          </button>
          <span className="ve-topbar__title">
            Visual editor - {docTitle} {status && <span className="ve-topbar__status">({status})</span>}
          </span>
        </div>
        <div className="ve-topbar__actions">
          <div className="ve-device-toggle" role="group" aria-label="Preview device">
            <button
              type="button"
              className={`ve-device-btn ${device === 'desktop' ? 've-device-btn--active' : ''}`}
              onClick={() => setDevice('desktop')}
              aria-label="Desktop preview"
              title="Desktop preview - full width"
            >
              Desktop
            </button>
            <button
              type="button"
              className={`ve-device-btn ${device === 'tablet' ? 've-device-btn--active' : ''}`}
              onClick={() => setDevice('tablet')}
              aria-label="Tablet preview"
              title="Tablet preview"
            >
              Tablet
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
        <EditorDock
          collapsed={dockCollapsed}
          tab={dockTab}
          onTabChange={setDockTab}
          targetLabel={insertTarget.containerPath.length === 0 ? 'the page' : 'this column'}
          onPickBlock={addBlock}
          onPickTemplate={addTemplateBlocks}
          selectedNode={selectedNode as Record<string, unknown> | undefined}
          selectedDef={selectedDef}
          onChangeSelected={updateSelected}
          onCloseSelected={() => {
            setSelectedPath(null)
            setDockTab('elements')
          }}
          onDeleteSelected={() => selectedPath && deleteBlock(selectedPath)}
          onDuplicateSelected={() => selectedPath && duplicateBlock(selectedPath)}
        />

        <div className="ve-canvas-wrap" role="presentation">
          {error && (
            <p className="ve-error" style={{ padding: 12 }}>
              {error}
            </p>
          )}

          {/*
            The canvas itself is a same-origin iframe on the real front-end
            layout (real styles.css, fonts, Header/Footer) so what's shown
            here is pixel-exact with the live page - see
            visualEditor/canvasBridge.ts for why a same-document canvas
            can't do that safely, and what crosses the postMessage bridge.
            Sized by CSS alone (the ve-canvas--desktop/mobile width below);
            the iframe's own viewport width is what makes the site's real
            responsive breakpoints kick in, so no "device" value needs to be
            sent into the frame at all.
          */}
          <div className={`ve-canvas ve-canvas--${device}`}>
            {!frameReady && <div className="ve-canvas__loading">Loading canvas</div>}
            <iframe
              ref={iframeRef}
              src="/visual-editor-canvas"
              title="Page canvas"
              className="ve-canvas__frame"
              style={{ display: frameReady ? 'block' : 'none' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default VisualEditorView
