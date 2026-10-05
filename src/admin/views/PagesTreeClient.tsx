'use client'

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import type { TreePage, TreeNode } from '@/features/pagesTree/plan'
import { buildTree, planMoves, pagePath } from '@/features/pagesTree/plan'
import { applyDrop, dropZone, type ArrangementEntry } from './pagesTreeArrangement'

type Arrangement = Map<number, ArrangementEntry>

interface PagesTreeClientProps {
  pages: TreePage[]
  canEdit: boolean
  newDocumentURL?: string
}

/**
 * Client component for the pages tree view.
 * Renders pages in a nested tree structure with drag-to-reorder and keyboard controls.
 */
export function PagesTreeClient({ pages, canEdit, newDocumentURL }: PagesTreeClientProps) {
  const router = useRouter()
  const [arrangement, setArrangement] = useState<Arrangement>(new Map())
  const [errors, setErrors] = useState<Array<{ id?: number; message: string }>>([])
  // Everything starts expanded, so track what the user collapsed instead of what they opened.
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set())
  const expandedIds = useMemo(
    () => new Set(pages.filter((p) => !collapsedIds.has(p.id)).map((p) => p.id)),
    [pages, collapsedIds],
  )
  const [draggedId, setDraggedId] = useState<number | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [dialogMoves, setDialogMoves] = useState<any[]>([])
  const [createRedirects, setCreateRedirects] = useState(true)
  const [savingState, setSavingState] = useState<'idle' | 'preview' | 'confirm'>('idle')
  const [anyMoveHasPathChange, setAnyMoveHasPathChange] = useState(false)
  const focusTrapRef = useRef<HTMLDivElement>(null)

  // Compute current pages with arrangement applied
  const currentPages = useMemo(() => {
    return pages.map(p => {
      const entry = arrangement.get(p.id)
      if (!entry) return p
      return { ...p, parent: entry.parent, sortOrder: entry.sortOrder }
    })
  }, [pages, arrangement])

  const tree = useMemo(() => buildTree(currentPages), [currentPages])

  // Auto-clear errors on next action
  const clearErrors = useCallback(() => {
    setErrors([])
  }, [])

  // Toggle expand for a tree item
  const toggleExpanded = (id: number) => {
    const next = new Set(collapsedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setCollapsedIds(next)
  }

  // Apply a drop and validate
  const handleDrop = useCallback(
    (draggedId: number, targetId: number, zone: 'before' | 'after' | 'inside') => {
      clearErrors()

      if (!canEdit) return

      const newArrangement = applyDrop(pages, arrangement, draggedId, targetId, zone)

      // Check if this is a valid move with planMoves
      const moves = Array.from(newArrangement.entries()).map(([id, entry]) => ({
        id,
        parent: entry.parent,
        sortOrder: entry.sortOrder,
      }))

      const result = planMoves(pages, moves)

      if (!result.ok) {
        setErrors((result as any).errors.map((e: any) => ({ id: e.id, message: e.message })))
        return
      }

      setArrangement(newArrangement)
    },
    [pages, arrangement, canEdit, clearErrors]
  )

  // Keyboard handlers for tree items
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, pageId: number, parentId: number | null, siblingIds: number[]) => {
      if (!canEdit) return

      const isAltKey = e.altKey
      if (!isAltKey) return

      const pageIndex = siblingIds.indexOf(pageId)
      if (pageIndex === -1) return

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          clearErrors()
          if (pageIndex > 0) {
            const prevId = siblingIds[pageIndex - 1]
            handleDrop(pageId, prevId, 'before')
          }
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          clearErrors()
          if (pageIndex < siblingIds.length - 1) {
            const nextId = siblingIds[pageIndex + 1]
            handleDrop(pageId, nextId, 'after')
          }
          break
        }
        case 'ArrowRight': {
          e.preventDefault()
          clearErrors()
          if (pageIndex > 0) {
            const prevId = siblingIds[pageIndex - 1]
            handleDrop(pageId, prevId, 'inside')
          }
          break
        }
        case 'ArrowLeft': {
          e.preventDefault()
          clearErrors()
          const currentPage = currentPages.find(p => p.id === pageId)
          if (currentPage && currentPage.parent !== null) {
            handleDrop(pageId, currentPage.parent, 'after')
          }
          break
        }
      }
    },
    [canEdit, currentPages, handleDrop, clearErrors]
  )

  // Save changes: post preview
  const handleSave = async () => {
    if (savingState !== 'idle') return
    clearErrors()

    const moves = Array.from(arrangement.entries()).map(([id, entry]) => ({
      id,
      parent: entry.parent,
      sortOrder: entry.sortOrder,
    }))

    setSavingState('preview')

    try {
      const response = await fetch('/api/admin-pages-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves, mode: 'preview' }),
      })

      const data: any = await response.json()

      if (!response.ok) {
        setErrors(data.errors || [{ message: 'Failed to preview changes' }])
        setSavingState('idle')
        return
      }

      if (!data.plan?.ok) {
        setErrors(data.plan?.errors || [{ message: 'Invalid move' }])
        setSavingState('idle')
        return
      }

      setDialogMoves(data.plan.moves)
      setAnyMoveHasPathChange(data.plan.moves.some((m: any) => m.pathChanged))
      setCreateRedirects(true)
      setSavingState('confirm')
      setShowDialog(true)
    } catch (err) {
      setErrors([{ message: String(err) }])
      setSavingState('idle')
    }
  }

  // Confirm save
  const handleConfirm = async () => {
    setSavingState('preview')

    const moves = Array.from(arrangement.entries()).map(([id, entry]) => ({
      id,
      parent: entry.parent,
      sortOrder: entry.sortOrder,
    }))

    try {
      const response = await fetch('/api/admin-pages-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves, mode: 'commit', createRedirects }),
      })

      const data: any = await response.json()

      if (!response.ok) {
        setErrors([{ message: data.error || 'Failed to save changes' }])
        setSavingState('idle')
        return
      }

      // Success: clear arrangement and refresh
      setArrangement(new Map())
      setShowDialog(false)
      setSavingState('idle')
      router.refresh()
    } catch (err) {
      setErrors([{ message: String(err) }])
      setSavingState('idle')
    }
  }

  // Cancel dialog
  const handleCancel = () => {
    setShowDialog(false)
    setSavingState('idle')
  }

  // Discard changes
  const handleDiscard = () => {
    clearErrors()
    setArrangement(new Map())
  }

  // Trap focus in dialog
  useEffect(() => {
    if (!showDialog) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [showDialog])

  const sensors = useSensors(
    useSensor(PointerSensor, { distance: 5 } as any),
    useSensor(KeyboardSensor)
  )

  const handleDragStart = (event: DragStartEvent) => {
    if (!canEdit) return
    setDraggedId(Number(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedId(null)

    if (!canEdit) return

    const draggedId = Number(event.active.id)
    const targetId = event.over ? Number(event.over.id) : null

    if (!targetId) return

    // Top quarter of the row: before it. Bottom quarter: after it. Middle: becomes its child.
    const dragged = event.active.rect.current.translated
    const over = event.over?.rect
    const zone =
      dragged && over
        ? dropZone(dragged.top + dragged.height / 2, over.top, over.height)
        : 'inside'
    handleDrop(draggedId, targetId, zone)
  }

  if (pages.length === 0) {
    return (
      <div className="pages-tree pages-tree--empty">
        <p className="pages-tree__empty-message">No pages yet</p>
        {newDocumentURL && (
          <Link href={newDocumentURL} className="pages-tree__create-link">
            Create first page
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className="pages-tree">
      {errors.length > 0 && (
        <div className="pages-tree__alert" role="alert">
          {errors[0].message}
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={canEdit ? handleDragStart : undefined}
        onDragEnd={canEdit ? handleDragEnd : undefined}
      >
        <TreeNodeList
          nodes={tree}
          pages={currentPages}
          expandedIds={expandedIds}
          draggedId={draggedId}
          onToggleExpanded={toggleExpanded}
          onKeyDown={handleKeyDown}
          canEdit={canEdit}
        />
      </DndContext>

      {arrangement.size > 0 && canEdit && (
        <div className="pages-tree__sticky-bar">
          <span>{arrangement.size} change(s)</span>
          <div className="pages-tree__sticky-bar-buttons">
            <button
              className="pages-tree__btn pages-tree__btn--primary"
              onClick={handleSave}
              disabled={savingState !== 'idle'}
            >
              Save changes
            </button>
            <button
              className="pages-tree__btn pages-tree__btn--secondary"
              onClick={handleDiscard}
              disabled={savingState !== 'idle'}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {showDialog && (
        <ConfirmDialog
          moves={dialogMoves}
          showRedirectsCheckbox={anyMoveHasPathChange}
          createRedirects={createRedirects}
          onCreateRedirectsChange={setCreateRedirects}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
          isLoading={savingState === 'preview'}
          focusTrapRef={focusTrapRef}
        />
      )}
    </div>
  )
}

interface TreeNodeListProps {
  nodes: TreeNode[]
  pages: TreePage[]
  expandedIds: Set<number>
  draggedId: number | null
  onToggleExpanded: (id: number) => void
  onKeyDown: (e: React.KeyboardEvent, pageId: number, parentId: number | null, siblingIds: number[]) => void
  canEdit: boolean
}

function TreeNodeList({
  nodes,
  pages,
  expandedIds,
  draggedId,
  onToggleExpanded,
  onKeyDown,
  canEdit,
}: TreeNodeListProps) {
  const sortableIds = nodes.map(n => String(n.page.id))

  return (
    <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
      <ul className="pages-tree__list" role="tree">
        {nodes.map(node => (
          <TreeNodeItem
            key={node.page.id}
            node={node}
            pages={pages}
            expandedIds={expandedIds}
            draggedId={draggedId}
            onToggleExpanded={onToggleExpanded}
            onKeyDown={onKeyDown}
            canEdit={canEdit}
          />
        ))}
      </ul>
    </SortableContext>
  )
}

interface TreeNodeItemProps {
  node: TreeNode
  pages: TreePage[]
  expandedIds: Set<number>
  draggedId: number | null
  onToggleExpanded: (id: number) => void
  onKeyDown: (e: React.KeyboardEvent, pageId: number, parentId: number | null, siblingIds: number[]) => void
  canEdit: boolean
}

function TreeNodeItem({
  node,
  pages,
  expandedIds,
  draggedId,
  onToggleExpanded,
  onKeyDown,
  canEdit,
}: TreeNodeItemProps) {
  const { page, children, depth } = node
  const isExpanded = expandedIds.has(page.id)
  const isDragging = draggedId === page.id

  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: String(page.id),
    disabled: !canEdit,
  })

  const pagePathStr = pagePath(pages, page.id) || '/'

  // Get siblings for keyboard navigation
  // Same ordering buildTree uses, so keyboard moves act on what is on screen.
  const siblings = pages
    .filter(p => p.parent === page.parent)
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        a.title.toLowerCase().localeCompare(b.title.toLowerCase()) ||
        a.id - b.id,
    )
  const siblingIds = siblings.map(s => s.id)

  const sortableIds = children.map(c => String(c.page.id))

  return (
    <li
      ref={setNodeRef}
      role="treeitem"
      aria-level={depth}
      aria-expanded={children.length > 0 ? isExpanded : undefined}
      // eslint-disable-next-line jsx-a11y/role-has-required-aria-props
      className={`pages-tree__item ${isDragging ? 'pages-tree__item--dragging' : ''}`}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <div className="pages-tree__row">
        {children.length > 0 && (
          <button
            className="pages-tree__toggle"
            onClick={() => onToggleExpanded(page.id)}
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
            type="button"
          >
            {isExpanded ? '▼' : '▶'}
          </button>
        )}
        {!children.length && <div className="pages-tree__toggle-spacer" />}

        {canEdit && (
          <button
            className="pages-tree__handle"
            {...attributes}
            {...listeners}
            aria-label={`Drag ${page.title}`}
            type="button"
          >
            ⠿
          </button>
        )}

        <div
          className="pages-tree__content"
          onKeyDown={e => onKeyDown(e, page.id, page.parent, siblingIds)}
          tabIndex={canEdit ? 0 : -1}
          role="button"
        >
          <Link href={`/admin/collections/pages/${page.id}`} className="pages-tree__title">
            {page.title}
          </Link>

          <span className="pages-tree__path">{pagePathStr}</span>

          {page.status === 'draft' && <span className="pages-tree__badge pages-tree__badge--draft">Draft</span>}
          {page.isHomepage && <span className="pages-tree__badge pages-tree__badge--homepage">Homepage</span>}

          {children.length > 0 && <span className="pages-tree__count">({children.length})</span>}
        </div>
      </div>

      {children.length > 0 && isExpanded && (
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          <ul className="pages-tree__list">
            {children.map(child => (
              <TreeNodeItem
                key={child.page.id}
                node={child}
                pages={pages}
                expandedIds={expandedIds}
                draggedId={draggedId}
                onToggleExpanded={onToggleExpanded}
                onKeyDown={onKeyDown}
                canEdit={canEdit}
              />
            ))}
          </ul>
        </SortableContext>
      )}
    </li>
  )
}

interface ConfirmDialogProps {
  moves: any[]
  showRedirectsCheckbox: boolean
  createRedirects: boolean
  onCreateRedirectsChange: (value: boolean) => void
  onConfirm: () => void
  onCancel: () => void
  isLoading: boolean
  focusTrapRef: React.RefObject<HTMLDivElement>
}

function ConfirmDialog({
  moves,
  showRedirectsCheckbox,
  createRedirects,
  onCreateRedirectsChange,
  onConfirm,
  onCancel,
  isLoading,
  focusTrapRef,
}: ConfirmDialogProps) {
  return (
    <div className="pages-tree__dialog-overlay" onClick={onCancel}>
      <div
        ref={focusTrapRef}
        className="pages-tree__dialog"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <h2>Confirm changes</h2>
        <div className="pages-tree__dialog-moves">
          {moves.map((move, idx) => (
            <div key={idx} className="pages-tree__move-item">
              <div className="pages-tree__move-title">{move.title}</div>
              <div className="pages-tree__move-path">
                {move.oldPath} → {move.newPath}
              </div>
              {move.descendantCount > 0 && (
                <details className="pages-tree__descendants">
                  <summary>
                    +{move.descendantCount} sub-page{move.descendantCount === 1 ? '' : 's'} move{move.descendantCount === 1 ? 's' : ''} with it
                  </summary>
                  <ul>
                    {move.descendants.map((desc: any) => (
                      <li key={desc.id}>
                        {desc.title}: {desc.oldPath} → {desc.newPath}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}
        </div>

        {showRedirectsCheckbox && (
          <label className="pages-tree__checkbox-label">
            <input
              type="checkbox"
              checked={createRedirects}
              onChange={e => onCreateRedirectsChange(e.target.checked)}
              disabled={isLoading}
            />
            Create redirects for old URLs
          </label>
        )}

        <div className="pages-tree__dialog-buttons">
          <button
            className="pages-tree__btn pages-tree__btn--primary"
            onClick={onConfirm}
            disabled={isLoading}
          >
            Confirm and save
          </button>
          <button
            className="pages-tree__btn pages-tree__btn--secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default PagesTreeClient
