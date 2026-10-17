'use client'

import React from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'

import { asBlockStyle, blockFxClasses, blockFxVars, blockStyleCss, blockStyleToCss, hasFxLayer } from '@/lib/blockStyle'
import { sectionLayoutProps, type SectionLayout } from '@/lib/sectionLayout'
import { columnWidthVars, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

import { ShapeDivider } from '@/components/blocks/StyledBlock'

import ParticlesBackground from '@/components/blocks/ParticlesLazy'
import { getBlockDef } from './blockSchemas'
import { CanvasBlockPreview } from './CanvasBlockPreview'
import type { ColumnOp } from './canvasBridge'
import { pathKey, type NodePath } from './treeOps'
import { lexicalToPlainText } from './richTextUtil'

/**
 * Get text fields that can be edited inline on the canvas for a block.
 * Includes simple text and textarea fields like Heading.text, Text.content, Button.text.
 */
function getEditableTextFields(node: SectionNode & Record<string, unknown>) {
  const blockDef = getBlockDef(node.blockType)
  if (!blockDef) return []
  // Filter to simple text/textarea fields that canEditAsPlainText can handle
  return blockDef.fields.filter((f) => (f.type === 'text' || f.type === 'textarea') && !f.supportsMergeTags)
}

/**
 * Get current value of a field from the block node.
 */
function getFieldValue(node: SectionNode & Record<string, unknown>, fieldName: string): string {
  const value = node[fieldName]
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'root' in value) {
    // Rich text (Lexical JSON) - convert to plain text
    return lexicalToPlainText(value)
  }
  return ''
}

export type CanvasHandlers = {
  selectedKey: string | null
  /** Lock state by node path key (see lockState.ts). A blocked node has its move/duplicate/delete disabled. */
  locks?: Record<string, { mode: 'structure' | 'full'; blocked: boolean }>
  onSelect: (path: NodePath) => void
  onAdd: (containerPath: NodePath, at: number) => void
  onDelete: (path: NodePath) => void
  onDuplicate: (path: NodePath) => void
  onMove: (path: NodePath, direction: -1 | 1) => void
  /** Column toolbar / empty-column actions (add, duplicate, delete, move, inner section). */
  onColumnOp?: (path: NodePath, op: ColumnOp) => void
  /** Key (see slotKey below) of the insert slot a library-card drag is currently over, or null.
   *  Driven by the parent's 'dragHover' bridge message - the parent resolves drop targets
   *  itself via elementFromPoint, so this is purely for visual feedback. */
  dragHoverKey: string | null
  /** Key of the insert slot whose "+" was last clicked and hasn't been dismissed yet - stays
   *  lit (Elementor keeps its add-panel open the same way) until a block gets added there, a
   *  different node is selected, or the canvas is clicked elsewhere. Purely local UI state,
   *  tracked in CanvasFrame.tsx - see openInsertKey there. */
  openInsertKey: string | null
  /** Path of the block currently being dragged by its handle (dnd-kit), or null. Slots that
   *  would be invalid or no-op targets for it are disabled. */
  dragPath?: NodePath | null
}

/** Stable identity for an insert slot, matched against data-ve-container/data-ve-at by the
 *  parent's elementFromPoint lookup - see VisualEditor.tsx. */
export const slotKey = (containerPath: NodePath, at: number): string => `${pathKey(containerPath)}|${at}`

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
      dragHoverKey={handlers.dragHoverKey}
      openInsertKey={handlers.openInsertKey}
      dragPath={handlers.dragPath}
      locks={handlers.locks}
      subtle={nodes.length > 0}
      empty={nodes.length === 0 && containerPath.length > 0}
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
            dragHoverKey={handlers.dragHoverKey}
            openInsertKey={handlers.openInsertKey}
            dragPath={handlers.dragPath}
            locks={handlers.locks}
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
  const lock = handlers.locks?.[key]
  const blocked = Boolean(lock?.blocked)

  // The block itself is not moved while dragging (a DragOverlay ghost follows the pointer, see
  // CanvasFrame.tsx), so cross-container moves never fight a sortable list's transforms.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `node:${key}`,
    data: { path, label: `${def?.icon ?? ''} ${def?.label || node.blockType}`.trim() },
    disabled: blocked,
  })

  const wrapperStyle: React.CSSProperties = {
    ...blockStyleToCss(design),
    ...blockFxVars(design),
    opacity: isDragging ? 0.4 : undefined,
  }
  // Tablet / mobile overrides: the canvas iframe is as wide as the previewed device, so the same
  // media rules the live page uses apply here (hidden-on-this-device blocks are faded, not removed).
  const scopeId = `ve-n-${path.join('_')}`
  const deviceCss = blockStyleCss(design, scopeId, { editor: true })
  const hasMinHeight = [design.minHeight, design.tablet?.minHeight, design.mobile?.minHeight].some((v) => typeof v === 'number')

  return (
    <div
      ref={setNodeRef}
      id={scopeId}
      data-ve-node={JSON.stringify(path)}
      className={`ve-node ${isSelected ? 've-node--selected' : ''} ${lock ? 've-node--locked' : ''} ${hasMinHeight ? 've-node--minh' : ''} ${blockFxClasses(design)} ve-node--depth-${Math.min(depth, 3)}`}
      style={wrapperStyle}
      onClick={(event) => {
        // Stop the click bubbling to an ancestor section, so clicking a nested
        // block selects that block rather than its container.
        event.stopPropagation()
        handlers.onSelect(path)
      }}
    >
      {deviceCss && <style dangerouslySetInnerHTML={{ __html: deviceCss }} />}
      {design.parallax === 'background' && design.bgType === 'image' && design.bgImageUrl && (
        <div className="be-fx be-fx--parbg" aria-hidden="true" style={{ backgroundImage: `url(${design.bgImageUrl})` }} />
      )}
      {hasFxLayer(design) && (
        <div className={`be-fx be-fx--${design.bgEffect}`} aria-hidden="true">
          {design.bgEffect === 'particles' && (
            <ParticlesBackground count={design.particlesCount ?? 50} interact={design.particlesInteract ?? 'repel'} color={design.bgEffectColor || '#6366f1'} />
          )}
        </div>
      )}
      <div className="ve-node__toolbar">
        <button type="button" className="ve-drag-handle" {...attributes} {...(blocked ? {} : listeners)} disabled={blocked} aria-label="Drag to move">
          ⠿
        </button>
        <span className="ve-node__label">
          {lock && (
            <span className="ve-node__lock" role="img" aria-label={lock.mode === 'full' ? 'Fully locked' : 'Structure locked'} title={lock.mode === 'full' ? 'Fully locked' : 'Structure locked: text only'}>
              🔒{' '}
            </span>
          )}
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
          disabled={blocked || index === 0}
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
          disabled={blocked || index === total - 1}
          aria-label="Move down"
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="ve-node__act"
          disabled={blocked}
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
          disabled={blocked}
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
          anim={design.dividerTopAnim}
          speed={design.dividerTopSpeed}
          position="top"
        />
      )}
      <div className="ve-node__body">
        {node.blockType === 'section' ? (
          <SectionColumns columns={node.columns || []} layout={design.layout} path={path} handlers={handlers} depth={depth} />
        ) : (
          <div
            className="ve-node__preview"
            onDoubleClick={(e) => {
              e.stopPropagation()
              // Double-click on text blocks triggers inline edit mode
              // Send message to parent with block info; parent opens editor
              const blockId = node._id || pathKey(path)
              const editableFields = getEditableTextFields(node)
              if (editableFields.length > 0) {
                const field = editableFields[0]
                const value = getFieldValue(node, field.name)
                window.parent.postMessage(
                  {
                    source: 've-canvas',
                    type: 'requestEdit',
                    blockId,
                    blockType: node.blockType,
                    elementType: node.elementType,
                    field: field.name,
                    value,
                    path,
                    device: 'desktop', // Placeholder - parent supplies actual device
                  },
                  window.location.origin
                )
              }
            }}
          >
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
          anim={design.dividerBottomAnim}
          speed={design.dividerBottomSpeed}
          position="bottom"
        />
      )}
    </div>
  )
}

const SectionColumns: React.FC<{
  columns: SectionColumn[]
  /** The section's optional flow settings (design.layout), same data the live page renders. */
  layout?: SectionLayout
  path: NodePath
  handlers: CanvasHandlers
  depth: number
}> = ({ columns, layout, path, handlers, depth }) => {
  const flow = sectionLayoutProps(layout, 've-section')
  if (columns.length === 0) {
    return (
      <div className="ve-section-empty">
        This section has no columns yet — add one from the Layout tab on the right.
      </div>
    )
  }

  const ownerLocked = Boolean(handlers.locks?.[pathKey(path)]?.blocked)

  return (
    <div
      className={flow.className ? `ve-section ${flow.className}` : 've-section'}
      {...flow.attrs}
      style={Object.keys(flow.style).length > 0 ? (flow.style as React.CSSProperties) : undefined}
    >
      {columns.map((column, columnIndex) => (
        <CanvasColumn
          key={column._id || columnIndex}
          column={column}
          columnPath={[...path, columnIndex]}
          index={columnIndex}
          count={columns.length}
          handlers={handlers}
          depth={depth}
          ownerLocked={ownerLocked}
        />
      ))}
    </div>
  )
}

/**
 * One column on the canvas. Selectable like a block (its path is an even-length one): hovering
 * outlines it in green, clicking selects it and opens its settings, and the selected column
 * carries a small toolbar (move left / right, add, duplicate, delete).
 */
const CanvasColumn: React.FC<{
  column: SectionColumn
  columnPath: NodePath
  index: number
  count: number
  handlers: CanvasHandlers
  depth: number
  ownerLocked: boolean
}> = ({ column, columnPath, index, count, handlers, depth, ownerLocked }) => {
  const selected = handlers.selectedKey === pathKey(columnPath)
  const design = asBlockStyle(column.design)
  const scopeId = `ve-c-${columnPath.join('_')}`
  const deviceCss = blockStyleCss(design, scopeId, { editor: true })
  const op = (event: React.MouseEvent, name: ColumnOp) => {
    event.stopPropagation()
    handlers.onColumnOp?.(columnPath, name)
  }
  const empty = (column.blocks || []).length === 0

  return (
    <div
      id={scopeId}
      className={`ve-column ${selected ? 've-column--selected' : ''}`}
      data-ve-column={JSON.stringify(columnPath)}
      style={{ ...columnWidthVars(column), ...blockStyleToCss(design) }}
      onClick={(event) => {
        // A block inside stops its own click, so this only fires for the column itself.
        event.stopPropagation()
        handlers.onSelect(columnPath)
      }}
    >
      {deviceCss && <style dangerouslySetInnerHTML={{ __html: deviceCss }} />}
      <div className="ve-column__tag">Column {index + 1}</div>
      {selected && (
        <div className="ve-column__toolbar" role="toolbar" aria-label={`Column ${index + 1} actions`}>
          <button type="button" className="ve-column__act" disabled={ownerLocked || index === 0} onClick={(e) => op(e, 'moveLeft')} aria-label="Move column left" title="Move column left">
            {'←'}
          </button>
          <button type="button" className="ve-column__act" disabled={ownerLocked || index === count - 1} onClick={(e) => op(e, 'moveRight')} aria-label="Move column right" title="Move column right">
            {'→'}
          </button>
          <button type="button" className="ve-column__act" disabled={ownerLocked} onClick={(e) => op(e, 'add')} aria-label="Add column" title="Add column after this one">
            +
          </button>
          <button type="button" className="ve-column__act" disabled={ownerLocked} onClick={(e) => op(e, 'duplicate')} aria-label="Duplicate column" title="Duplicate column">
            {'⧉'}
          </button>
          <button type="button" className="ve-column__act ve-column__act--danger" disabled={ownerLocked || count <= 1} onClick={(e) => op(e, 'delete')} aria-label="Delete column" title={count <= 1 ? 'A section needs at least one column' : 'Delete column'}>
            {'✕'}
          </button>
        </div>
      )}
      <CanvasNodeList nodes={column.blocks || []} containerPath={columnPath} handlers={handlers} depth={depth + 1} />
      {empty && !ownerLocked && (
        <button type="button" className="ve-column__inner" onClick={(e) => op(e, 'innerSection')}>
          Add inner section
        </button>
      )}
    </div>
  )
}

/**
 * The hover "+" that opens the element library at a specific position -
 * Elementor's circular add button between/around blocks. Also doubles as a
 * drop target for a card dragged out of the library (see ElementLibrary.tsx):
 * it carries data-ve-container/data-ve-at/data-ve-slot so the parent
 * document can find it via elementFromPoint and resolve a drop, since a
 * native dragover/drop listener attached here (inside the iframe's own
 * document) doesn't reliably fire for a drag that started in the parent
 * document - see VisualEditor.tsx and canvasBridge.ts's 'dragHover' message.
 */
const InsertSlot: React.FC<{
  containerPath: NodePath
  at: number
  onAdd: (containerPath: NodePath, at: number) => void
  dragHoverKey: string | null
  openInsertKey: string | null
  dragPath?: NodePath | null
  locks?: CanvasHandlers['locks']
  subtle?: boolean
  /** The container has no blocks: render as a visible "Drop a block here" zone. */
  empty?: boolean
}> = ({ containerPath, at, onAdd, dragHoverKey, openInsertKey, dragPath, locks, subtle, empty }) => {
  const key = slotKey(containerPath, at)

  // A handle-drag can't land inside the dragged block, next to itself (a no-op), or in a
  // container whose owner is locked for this person.
  let disabled = !dragPath
  if (dragPath) {
    const inside = containerPath.length >= dragPath.length && dragPath.every((v, i) => containerPath[i] === v)
    const parent = dragPath.slice(0, -1)
    const idx = dragPath[dragPath.length - 1]
    const sameList = parent.length === containerPath.length && parent.every((v, i) => containerPath[i] === v)
    const noop = sameList && (at === idx || at === idx + 1)
    const lockedTarget = containerPath.length > 0 && Boolean(locks?.[pathKey(containerPath.slice(0, -1))]?.blocked)
    disabled = inside || noop || lockedTarget
  }
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${pathKey(containerPath)}:${at}`,
    data: { containerPath, at },
    disabled,
  })

  const active = dragHoverKey === key || (isOver && !disabled)
  const isOpen = openInsertKey === key

  return (
    <div
      ref={setNodeRef}
      className={`ve-insert ${subtle ? '' : 've-insert--always'} ${empty ? 've-insert--empty' : ''} ${active ? 've-insert--drag-over' : ''} ${isOpen ? 've-insert--open' : ''}`}
      data-ve-slot="1"
      data-ve-container={JSON.stringify(containerPath)}
      data-ve-at={at}
    >
      <button
        type="button"
        className="ve-insert__btn"
        onClick={(e) => {
          e.stopPropagation()
          onAdd(containerPath, at)
        }}
        aria-label={isOpen ? 'Close element picker' : 'Add an element here'}
        title={isOpen ? 'Close element picker' : 'Add an element here'}
      >
        +
      </button>
    </div>
  )
}
