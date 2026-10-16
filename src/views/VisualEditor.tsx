'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { SectionNode } from '@/lib/sectionTree'
import { defaultColumns } from '@/lib/sectionTree'

import { getElementDef } from '@/lib/elements/registry'
import { can } from '@/features/roles/permissions'

import { getBlockDef } from './visualEditor/blockSchemas'
import { CANVAS_ORIGIN, isBridgeMessage, type FrameToParentMessage } from './visualEditor/canvasBridge'
import { EditorDock, type DockTab } from './visualEditor/EditorDock'
import {
  cloneNode,
  getNode,
  insertNode,
  insertNodes,
  moveNode,
  movedNodePath,
  reorderWithin,
  splitPath,
  stripEditorIds,
  updateNode,
  type NodePath,
} from './visualEditor/treeOps'
import { VISUAL_EDITOR_SURFACES } from './visualEditor/surfaces'
import { normaliseFormConfig } from '@/features/forms/config'
import { hasUnpublishedChanges as formHasUnpublishedChanges, upgradeFieldsToLayout, walkLayout } from '@/features/forms/layout'
import type { FormConfig } from '@/features/forms/types'
import { FormEditorContext } from './visualEditor/formInputs'
import { FormSettingsPanel } from './visualEditor/FormSettingsPanel'
import { SaveAsTemplateDialog } from './visualEditor/SaveAsTemplate'
import { VISUAL_EDITOR_CSS } from './visualEditor/visualEditor.styles'
import { clientToFrame, isLibraryDragTypes, resolveDropSlotInDoc, VE_BLOCK_MIME, VE_TEMPLATE_MIME } from './visualEditor/dropSlot'

let idCounter = 0
const nextId = () => `ve-${Date.now()}-${idCounter++}`

function parsePath(): { mode: 'collection' | 'global'; slug: string; id?: string } | null {
  if (typeof window === 'undefined') return null
  const match = window.location.pathname.match(/\/admin\/visual-editor\/(collection|global)\/([^\/]+)(?:\/([^\/]+))?/)
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

import { parseLocks, serializeLocks, type LockEntry, type Locks, type LockUser } from '@/features/roles/locks'
import { canInsertInto, effectiveLock, lockedKeySet, lockKeyOf, lockMapForCanvas, withNodeLock } from './visualEditor/lockState'
import type { LockUi } from './visualEditor/LockControls'

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
  const [userPermissions, setUserPermissions] = useState<{ canEditStyle: boolean; canEditLayout: boolean } | null>(null)
  // Where the next element/template pick lands. Always defined (unlike the
  // old popup's open/closed state) since the dock is always visible now -
  // defaults to the end of the page until a specific "+" sets it.
  const [insertTarget, setInsertTarget] = useState<{ containerPath: NodePath; at: number }>({
    containerPath: [],
    at: 0,
  })
  const [dockCollapsed, setDockCollapsed] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [locks, setLocks] = useState<Locks>({ nodes: {} })
  const [locksDirty, setLocksDirty] = useState(false)
  const [lockUser, setLockUser] = useState<(LockUser & { canManageLocks?: boolean }) | null>(null)
  const [roleChoices, setRoleChoices] = useState<string[]>(['editor', 'viewer'])
  const [lockNotice, setLockNotice] = useState<string | null>(null)
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false)
  const [templateToast, setTemplateToast] = useState<string | null>(null)
  const [frameReady, setFrameReady] = useState(false)
  // Form builder state (only used when the surface is the Forms collection).
  const [formConfig, setFormConfig] = useState<FormConfig>(() => normaliseFormConfig(null))
  const [formStatus, setFormStatus] = useState<'draft' | 'published'>('draft')
  const [embedKey, setEmbedKey] = useState<string | undefined>(undefined)
  const [publishedLayout, setPublishedLayout] = useState<unknown>(null)
  const formMode = surface?.formMode === true

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const lastHoverKey = useRef<string | null>(null)

  const apiUrl = useMemo(() => {
    if (!route || !surface) return null
    return surface.kind === 'global' ? `/api/globals/${surface.slug}` : `/api/${surface.slug}/${route.id}`
  }, [route, surface])

  // Fetch document and user permissions
  useEffect(() => {
    if (!apiUrl || !surface) return
    Promise.all([
      fetch(`${apiUrl}?depth=0`, { credentials: 'include' }).then(r => r.ok ? r.json() : null),
      fetch('/api/users/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then((r: any) => r?.user ?? null),
    ])
      .then(([doc, user]: any[]) => {
        if (doc && typeof doc === 'object') {
          let raw = (doc[surface.blocksField] as SectionNode[] | undefined) || []
          if (surface.formMode) {
            // A form made before the visual builder has only a flat field list: show it as a layout. Nothing is
            // written back until the person saves, and the upgrade gives the same tree every time.
            if (!Array.isArray(raw) || raw.length === 0) raw = upgradeFieldsToLayout(doc.fields) as unknown as SectionNode[]
            setFormConfig(normaliseFormConfig(doc.formConfig))
            setFormStatus(doc.formStatus === 'draft' ? 'draft' : 'published')
            setEmbedKey(typeof doc.embedKey === 'string' ? doc.embedKey : undefined)
            setPublishedLayout(doc.publishedLayout ?? null)
          }
          const withStableIds = withIds(raw)
          setBlocks(withStableIds)
          setInsertTarget({ containerPath: [], at: withStableIds.length })
          setDocTitle(surface.titleField ? String(doc[surface.titleField] || 'Untitled') : surface.label)
          setStatus(surface.formMode ? (doc.formStatus === 'draft' ? 'draft' : 'published') : (doc._status as string) || null)
          setLocks(parseLocks(doc.locks))
        }
        if (user) {
          setLockUser({ ...user, canManageLocks: can(user, 'locks', 'update') })
          setUserPermissions({
            canEditStyle: can(user, 'content.editStyle', 'update'),
            canEditLayout: can(user, 'content.editLayout', 'update'),
          })
        }
        setLoading(false)
      })
      .catch((err) => {
        setError(String((err as Error)?.message || err))
        setLoading(false)
      })
  }, [apiUrl, surface])

  useEffect(() => {
    fetch('/api/roles?depth=0&limit=100', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((res: any) => {
        const slugs = (res?.docs ?? []).map((d: any) => d.slug).filter((x: unknown): x is string => typeof x === 'string' && x !== 'admin' && x !== 'customer')
        if (slugs.length) setRoleChoices(Array.from(new Set(['editor', 'viewer', ...slugs])))
      })
      .catch(() => {})
  }, [])

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

  // Latest tree/locks/user for the mutation callbacks below (they are memoised without them).
  const lockCtx = useRef({ blocks, locks, lockUser, formConfig })
  useEffect(() => {
    lockCtx.current = { blocks, locks, lockUser, formConfig }
  }, [blocks, locks, lockUser, formConfig])
  /** True (and tells the person why) when a locked section stops this edit. */
  const lockedOut = useCallback((path: NodePath): boolean => {
    const { blocks: b, locks: l, lockUser: u } = lockCtx.current
    const lock = effectiveLock(b, path, l, u)
    if (lock?.blocked) {
      setLockNotice(`"${lock.label}" is locked. ${lock.unlockRoles.length ? `Roles that can unlock it: ${lock.unlockRoles.join(', ')}.` : 'Only an admin can unlock it.'}`)
      setTimeout(() => setLockNotice(null), 5000)
      return true
    }
    return false
  }, [])
  const insertBlocked = useCallback((containerPath: NodePath): boolean => {
    const { blocks: b, locks: l, lockUser: u } = lockCtx.current
    if (canInsertInto(b, containerPath, l, u)) return false
    setLockNotice('This part of the page is locked, so nothing can be added here.')
    setTimeout(() => setLockNotice(null), 5000)
    return true
  }, [])
  // For an `element` node, swap in the specific element's label/icon (from
  // the registry) so the panel header reads "Heading", not the generic
  // "Element" - the block def itself doesn't know which element it holds.
  const selectedDef = selectedNode
    ? (() => {
        const base = getBlockDef(selectedNode.blockType)
        if (!base || selectedNode.blockType !== 'element') return base
        const elementDef = getElementDef((selectedNode as { elementType?: string }).elementType || '')
        return elementDef ? { ...base, label: elementDef.label, icon: elementDef.icon } : base
      })()
    : undefined

  /* ---------------------------------------------------------------------- */
  /* Tree mutations                                                          */
  /* ---------------------------------------------------------------------- */

  /**
   * A fresh node for a block type - a brand-new section starts with two
   * columns so it is immediately useful.
   *
   * "element:<type>" is a synthetic slug, not a real block: the library shows
   * one card per src/lib/elements/registry.ts entry rather than one card for
   * the generic `element` block (which has nothing to edit until an
   * elementType is chosen) - see blockSchemas.ts's `element` entry.
   */
  const buildNode = useCallback((blockType: string): SectionNode | null => {
    if (blockType.startsWith('element:')) {
      const elementType = blockType.slice('element:'.length)
      const elementDef = getElementDef(elementType)
      if (!elementDef) return null
      return { blockType: 'element', elementType, props: elementDef.defaultProps(), _id: nextId() } as SectionNode
    }

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
      if (insertBlocked(containerPath)) return

      setBlocks((prev) => insertNode(prev, containerPath, at, node))
      setSelectedPath([...containerPath, at])
      setDockTab('settings')
      setDirty(true)
    },
    [insertTarget, buildNode, insertBlocked],
  )

  /** Same as addBlock, but for a drag-and-drop from the library that already knows its own target. */
  const addBlockAt = useCallback(
    (blockType: string, containerPath: NodePath, at: number) => {
      const node = buildNode(blockType)
      if (!node) return
      if (insertBlocked(containerPath)) return

      setBlocks((prev) => insertNode(prev, containerPath, at, node))
      setSelectedPath([...containerPath, at])
      setInsertTarget({ containerPath, at: at + 1 })
      setDockTab('settings')
      setDirty(true)
    },
    [buildNode, insertBlocked],
  )

  /** Templates (a curated preset or a saved Page Template) insert several blocks at once. */
  const insertTemplateAt = useCallback(
    (templateBlocks: SectionNode[], containerPath: NodePath, at: number) => {
      if (templateBlocks.length === 0) return
      if (insertBlocked(containerPath)) return
      const withFreshIds = templateBlocks.map((node) => cloneNode({ ...node, _id: undefined }, nextId))

      setBlocks((prev) => insertNodes(prev, containerPath, at, withFreshIds))
      setSelectedPath([...containerPath, at])
      setDockTab('settings')
      setDirty(true)
    },
    [insertBlocked],
  )

  const addTemplateBlocks = useCallback(
    (templateBlocks: SectionNode[]) => insertTemplateAt(templateBlocks, insertTarget.containerPath, insertTarget.at),
    [insertTarget, insertTemplateAt],
  )

  const deleteBlock = useCallback((path: NodePath) => {
    if (lockedOut(path)) return
    setBlocks((prev) => updateNode(prev, path, () => null))
    setSelectedPath(null)
    setDirty(true)
  }, [lockedOut])

  const duplicateBlock = useCallback((path: NodePath) => {
    if (lockedOut(path)) return
    const { containerPath, index } = splitPath(path)
    setBlocks((prev) => {
      const original = getNode(prev, path)
      if (!original) return prev
      return insertNode(prev, containerPath, index + 1, cloneNode(original, nextId))
    })
    setDirty(true)
  }, [lockedOut])

  const moveBlock = useCallback((path: NodePath, direction: -1 | 1) => {
    if (lockedOut(path)) return
    const { containerPath, index } = splitPath(path)
    setBlocks((prev) => reorderWithin(prev, containerPath, index, index + direction))
    setSelectedPath([...containerPath, index + direction])
    setDirty(true)
  }, [lockedOut])

  const updateSelected = useCallback(
    (next: Record<string, unknown>) => {
      if (!selectedPath) return
      const lock = effectiveLock(lockCtx.current.blocks, selectedPath, lockCtx.current.locks, lockCtx.current.lockUser)
      if (lock?.blocked && lock.mode === 'full') return
      setBlocks((prev) => updateNode(prev, selectedPath, (node) => ({ ...(next as SectionNode), _id: node._id })))
      setDirty(true)
    },
    [selectedPath],
  )

  /** Handle-drag drop: move a block into any list (same column, another column, out of/into sections). */
  const moveBlockTo = useCallback((from: NodePath, containerPath: NodePath, at: number) => {
    if (lockedOut(from) || insertBlocked(containerPath)) return
    const { blocks: current } = lockCtx.current
    const landed = movedNodePath(current, from, containerPath, at)
    if (!landed) return
    setBlocks((prev) => moveNode(prev, from, containerPath, at))
    setSelectedPath(landed)
    setDirty(true)
  }, [lockedOut, insertBlocked])

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
        case 'moveTo':
          moveBlockTo(msg.from, msg.containerPath, msg.at)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [deleteBlock, duplicateBlock, moveBlock, moveBlockTo])

  // Pushes the current tree + selection down to the frame whenever either
  // changes (including every keystroke made in the field panel), and once
  // more as soon as the frame announces it has mounted and can receive it.
  useEffect(() => {
    if (!frameReady) return
    iframeRef.current?.contentWindow?.postMessage(
      { source: 've-canvas', type: 'init', blocks, selectedPath, locks: lockMapForCanvas(blocks, locks, lockUser) },
      CANVAS_ORIGIN(),
    )
  }, [frameReady, blocks, selectedPath, locks, lockUser])

  const sendDragHover = useCallback((key: string | null) => {
    if (lastHoverKey.current === key) return
    lastHoverKey.current = key
    iframeRef.current?.contentWindow?.postMessage({ source: 've-canvas', type: 'dragHover', key }, CANVAS_ORIGIN())
  }, [])

  /* A card dragged out of the element library (ElementLibrary.tsx) carries a native HTML5
   * dataTransfer, which is shared across the whole browser-level drag session regardless of
   * which document a listener sits in - but a listener placed *inside* the iframe's own
   * document (as the old InsertSlot did) doesn't reliably receive dragover/drop for a drag
   * that started in the parent document. Handling it here instead, on the wrapper that sits
   * over the iframe in the parent document, sidesteps that entirely; elementFromPoint (above)
   * finds which insert slot the pointer is actually over inside the frame. */
  const isLibraryDrag = (event: React.DragEvent<HTMLDivElement>) => isLibraryDragTypes(event.dataTransfer.types)

  const resolveAt = useCallback((clientX: number, clientY: number) => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!iframe || !doc) return null
    const pt = clientToFrame(iframe.getBoundingClientRect(), clientX, clientY)
    return pt ? resolveDropSlotInDoc(doc, pt.x, pt.y) : null
  }, [])

  // Root cause of "can't drag from the dock": events over an <iframe> fire in the iframe's own
  // document and never reach React handlers on the parent wrapper, so while a library card is
  // dragged the frame is made pointer-transparent (CSS: .ve-canvas--lib-drag) and the wrapper
  // receives dragover/drop instead. Tracked from document-level drag events.
  const [libDrag, setLibDrag] = useState(false)
  useEffect(() => {
    const onStart = (e: DragEvent) => {
      if (isLibraryDragTypes(e.dataTransfer?.types)) setLibDrag(true)
    }
    const onEnd = () => {
      setLibDrag(false)
      sendDragHover(null)
    }
    document.addEventListener('dragstart', onStart, true)
    document.addEventListener('dragend', onEnd, true)
    document.addEventListener('drop', onEnd, true)
    return () => {
      document.removeEventListener('dragstart', onStart, true)
      document.removeEventListener('dragend', onEnd, true)
      document.removeEventListener('drop', onEnd, true)
    }
  }, [sendDragHover])

  const onCanvasDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!isLibraryDrag(event)) return
      event.preventDefault()
      const slot = resolveAt(event.clientX, event.clientY)
      // Auto-scroll the frame when hovering near its top/bottom edge.
      const frame = iframeRef.current
      if (frame) {
        const r = frame.getBoundingClientRect()
        if (event.clientY - r.top < 48) frame.contentWindow?.scrollBy(0, -24)
        else if (r.bottom - event.clientY < 48) frame.contentWindow?.scrollBy(0, 24)
      }
      // No valid slot (outside the page, or a locked container): not-allowed cursor, no highlight.
      const allowed = Boolean(slot) && canInsertInto(lockCtx.current.blocks, slot!.containerPath, lockCtx.current.locks, lockCtx.current.lockUser)
      event.dataTransfer.dropEffect = allowed ? 'copy' : 'none'
      sendDragHover(allowed ? slot!.key : null)
    },
    [sendDragHover, resolveAt],
  )

  const onCanvasDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      // Only clear once the pointer has actually left the wrapper (not just moved onto a
      // child), otherwise the highlight flickers off between adjacent slots.
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
      sendDragHover(null)
    },
    [sendDragHover],
  )

  const onCanvasDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const blockType = event.dataTransfer.getData(VE_BLOCK_MIME)
      const templateRaw = event.dataTransfer.getData(VE_TEMPLATE_MIME)
      const slot = resolveAt(event.clientX, event.clientY)
      sendDragHover(null)
      setLibDrag(false)
      if (!blockType && !templateRaw) return
      event.preventDefault()
      if (!slot) {
        setLockNotice('Drop it between blocks, on a block, or in an empty column.')
        setTimeout(() => setLockNotice(null), 4000)
        return
      }
      if (blockType) {
        addBlockAt(blockType, slot.containerPath, slot.at)
        return
      }
      try {
        const parsed: unknown = JSON.parse(templateRaw)
        if (Array.isArray(parsed)) insertTemplateAt(parsed as SectionNode[], slot.containerPath, slot.at)
      } catch {
        setLockNotice('That template could not be dropped.')
        setTimeout(() => setLockNotice(null), 4000)
      }
    },
    [addBlockAt, insertTemplateAt, sendDragHover, resolveAt],
  )

  const save = async (publish: boolean, options: { unpublish?: boolean } = {}) => {
    if (!apiUrl || !surface) return
    setSaving(publish ? 'publishing' : 'saving')
    // What this request carries. Edits made while it is in flight keep the dirty flag set.
    const sent = { blocks, locks, formConfig }
    try {
      const body: Record<string, unknown> = { [surface.blocksField]: stripEditorIds(blocks, lockedKeySet(locks)) }
      if (locksDirty && lockable) body.locks = serializeLocks(locks)
      if (surface.formMode) {
        // Draft saves touch the working copy only; Publish also takes the snapshot visitors see.
        body.formConfig = formConfig
        if (publish) {
          body.publishedLayout = body[surface.blocksField]
          body.formStatus = 'published'
        } else if (options.unpublish) {
          body.formStatus = 'draft'
        }
      } else if (publish) body._status = 'published'

      const res = await fetch(apiUrl, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)

      setSaving(publish ? 'published' : 'saved')
      if (surface.formMode) {
        const saved = (await res.json().catch((): null => null)) as { doc?: { embedKey?: string; publishedLayout?: unknown; formStatus?: string } } | null
        if (saved?.doc?.embedKey) setEmbedKey(saved.doc.embedKey)
        if (publish) {
          setFormStatus('published')
          setStatus('published')
          setPublishedLayout(body.publishedLayout)
        } else if (options.unpublish) {
          setFormStatus('draft')
          setStatus('draft')
        }
      } else if (publish) setStatus('published')
      const current = lockCtx.current
      if (current.blocks === sent.blocks && current.locks === sent.locks && current.formConfig === sent.formConfig) {
        setDirty(false)
        setLocksDirty(false)
      }
      setTimeout(() => setSaving('idle'), 2000)
    } catch (err) {
      setSaving('error')
      setError(String((err as Error).message || err))
    }
  }

  const lockable = surface?.slug === 'pages' || surface?.slug === 'page-templates' || surface?.slug === 'site-templates'
  const selectedLock = selectedPath ? effectiveLock(blocks, selectedPath, locks, lockUser) : null
  const selectedKey = selectedPath ? lockKeyOf(selectedNode, selectedPath) : undefined
  const ownEntry = selectedKey ? locks.nodes[selectedKey] : undefined
  const canEditOwn = Boolean(lockUser?.roles?.includes('admin') || lockUser?.canManageLocks || (ownEntry && !selectedLock?.blocked))
  const textTypes = new Set(['text', 'textarea', 'richText'])
  const lockFieldDefs = selectedNode
    ? selectedNode.blockType === 'element'
      ? getElementDef(String((selectedNode as { elementType?: string }).elementType || ''))?.fields ?? []
      : selectedDef?.fields ?? []
    : []
  const lockUi: LockUi | undefined =
    lockable && selectedNode
      ? {
          lock: selectedLock,
          entry: ownEntry,
          hasKey: Boolean(selectedKey),
          canEditLock: canEditOwn,
          textFields: lockFieldDefs.filter((f) => textTypes.has(f.type)).map((f) => ({ name: f.name, label: f.label })),
          roleChoices,
          onChangeLock: (entry: LockEntry | null) => {
            if (!selectedKey) return
            setLocks((prev) => withNodeLock(prev, selectedKey, entry))
            setLocksDirty(true)
            setDirty(true)
          },
        }
      : undefined

  const formFieldChoices = useMemo(
    () => (formMode ? walkLayout(blocks).fields.filter((f) => f.name && f.type !== 'page').map((f) => ({ name: f.name!, label: f.label || f.name! })) : []),
    [formMode, blocks],
  )
  const formUnpublished = formMode ? formHasUnpublishedChanges({ layout: stripEditorIds(blocks, lockedKeySet(locks)), publishedLayout } as never) : false
  const isAdmin = Boolean(lockUser?.roles?.includes('admin'))

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
      { }
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
            {dockCollapsed ? String.fromCodePoint(0xbb) : String.fromCodePoint(0xab)}
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
          {!formMode && (
            <button
              type="button"
              className="ve-btn"
              onClick={() => setSaveTemplateOpen(true)}
              disabled={blocks.length === 0}
              title={selectedPath && selectedPath.length === 1 ? 'Save the selected section, or the whole page, as a reusable template' : 'Save this page as a reusable template'}
            >
              Save as template
            </button>
          )}
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

      <FormEditorContext.Provider value={{ fields: formFieldChoices }}>
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
          userPermissions={userPermissions}
          lockUi={lockUi}
          formPanel={
            formMode ? (
              <FormSettingsPanel
                config={formConfig}
                onChange={(next) => {
                  setFormConfig(next)
                  setDirty(true)
                }}
                formId={route?.id}
                embedKey={embedKey}
                formStatus={formStatus}
                hasUnpublishedChanges={formUnpublished}
                isAdmin={isAdmin}
                busy={saving === 'saving' || saving === 'publishing'}
                onPublish={() => save(true)}
                onUnpublish={() => save(false, { unpublish: true })}
              />
            ) : undefined
          }
        />

        <div className="ve-canvas-wrap" role="presentation">
          {lockNotice && (
            <p className="ve-error" role="status" style={{ padding: 12 }}>
              &#128274; {lockNotice}
            </p>
          )}
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
          <div
            className={`ve-canvas ve-canvas--${device} ${libDrag ? 've-canvas--lib-drag' : ''}`}
            onDragOver={onCanvasDragOver}
            onDragLeave={onCanvasDragLeave}
            onDrop={onCanvasDrop}
          >
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
      </FormEditorContext.Provider>
      {saveTemplateOpen && (
        <SaveAsTemplateDialog
          pageBlocks={blocks}
          selectedSection={selectedPath && selectedPath.length === 1 ? getNode(blocks, selectedPath) : undefined}
          defaultName={docTitle}
          onClose={() => setSaveTemplateOpen(false)}
          onSaved={() => {
            setSaveTemplateOpen(false)
            setTemplateToast('Saved to My templates')
            setTimeout(() => setTemplateToast(null), 4000)
          }}
        />
      )}
      {templateToast && (
        <div className="ve-tpl__toast" role="status">
          {templateToast}
        </div>
      )}
    </div>
  )
}

export default VisualEditorView
