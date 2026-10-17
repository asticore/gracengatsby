import type { SectionNode } from '@/lib/sectionTree'

import type { NodePath } from './treeOps'

/**
 * The canvas iframe (src/app/(frontend)/visual-editor-canvas) renders the
 * block tree with the site's own styles.css and Header/Footer, so what you
 * see while editing is pixel-exact with the live page - loading that CSS into
 * the same document as the the original engine admin UI would corrupt it instead (the
 * stylesheet resets `body`, `h1`, buttons, etc. with bare selectors, no
 * scoping). An iframe is the only boundary that keeps the two safely apart.
 *
 * That puts the editable canvas in a different document than the editor
 * chrome (topbar, field panel, element library), so every interaction - a
 * click to select a block, a drag to reorder, the field panel pushing an
 * edit down - crosses the iframe boundary via postMessage. The parent
 * (VisualEditor.tsx) stays the single source of truth for the block tree
 * (it's what Save/Publish send); the frame only ever asks the parent to make
 * a change and re-renders whatever the parent sends back down.
 *
 * Every message carries `source: 've-canvas'` so the two sides can ignore
 * postMessages from anything else on the page (browser extensions included -
 * see ExtensionDomSafety for why that matters here specifically).
 */
const SOURCE = 've-canvas' as const

export type ParentToFrameMessage =
  | { source: typeof SOURCE; type: 'init'; blocks: SectionNode[]; selectedPath: NodePath | null; locks?: Record<string, { mode: 'structure' | 'full'; blocked: boolean }> }
  | { source: typeof SOURCE; type: 'selected'; selectedPath: NodePath | null }
  /** Highlights the insert slot a library-card drag is currently over (or clears it with null).
   *  The parent resolves the target itself via elementFromPoint - see VisualEditor.tsx - since
   *  native dragover/drop listeners placed inside the iframe's own document don't reliably fire
   *  for a drag that started in the parent document (a known cross-iframe HTML5 DnD limitation). */
  | { source: typeof SOURCE; type: 'dragHover'; key: string | null }
  /** Start inline edit mode for a text field in the canvas. */
  | { source: typeof SOURCE; type: 'startEdit'; blockId: string; elementType: string; field: string; value: string; device: 'desktop' | 'tablet' | 'mobile' }
  /** End inline edit mode and save/cancel. */
  | { source: typeof SOURCE; type: 'endEdit' }

export type FrameToParentMessage =
  | { source: typeof SOURCE; type: 'ready' }
  | { source: typeof SOURCE; type: 'select'; path: NodePath | null }
  | { source: typeof SOURCE; type: 'add'; containerPath: NodePath; at: number }
  | { source: typeof SOURCE; type: 'delete'; path: NodePath }
  | { source: typeof SOURCE; type: 'duplicate'; path: NodePath }
  | { source: typeof SOURCE; type: 'move'; path: NodePath; direction: -1 | 1 }
  /** Drag-handle drop: move the block at `from` into `containerPath` at slot `at` (slot numbering
   *  as before the move - see treeOps.moveNode). Works within a list, between columns and across levels. */
  | { source: typeof SOURCE; type: 'moveTo'; from: NodePath; containerPath: NodePath; at: number }
  /** A key press inside the frame (not in an editable field), forwarded so the parent's one shortcut handler sees it. */
  | { source: typeof SOURCE; type: 'key'; key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }
  /** Right-click on a block; x/y are in the frame's own viewport coordinates. */
  | { source: typeof SOURCE; type: 'contextmenu'; path: NodePath; x: number; y: number }
  /** Inline edit completed with new value. */
  | { source: typeof SOURCE; type: 'editDone'; blockId: string; field: string; value: string; device: 'desktop' | 'tablet' | 'mobile' }
  /** Navigate to next/prev editable element during inline editing. */
  | { source: typeof SOURCE; type: 'inlineNavigate'; blockId: string; direction: 'next' | 'prev'; device: 'desktop' | 'tablet' | 'mobile' }
  /** Double-click on a text element in the canvas requests edit mode. */
  | { source: typeof SOURCE; type: 'requestEdit'; blockId: string; blockType: string; elementType?: string; field: string; value: string; path: NodePath; device: 'desktop' | 'tablet' | 'mobile' }

/** True for any message this bridge sent, from either side - narrow further on `.type` after this. */
export const isBridgeMessage = (data: unknown): data is FrameToParentMessage | ParentToFrameMessage =>
  Boolean(data) && typeof data === 'object' && (data as { source?: unknown }).source === SOURCE

export const CANVAS_ORIGIN = () => (typeof window === 'undefined' ? '' : window.location.origin)

/* ------------------------------------------------------------------------- */
/* Column selection and column operations (section structure)                 */
/* ------------------------------------------------------------------------- */
// A column is selected with the ordinary 'select' message: its path has an EVEN length
// (see treeOps.ts), which is how the parent tells it from a block. The column toolbar and the
// empty-column button send the message below instead of a per-operation type each.

export type ColumnOp = 'add' | 'duplicate' | 'delete' | 'moveLeft' | 'moveRight' | 'innerSection'

export type ColumnToParentMessage = { source: typeof SOURCE; type: 'columnOp'; path: NodePath; op: ColumnOp }

/** Narrows an incoming message to a column operation (the base union above predates it). */
export const isColumnOpMessage = (data: unknown): data is ColumnToParentMessage =>
  isBridgeMessage(data) && (data as { type?: unknown }).type === 'columnOp'

/** Double-click rename of a section tab / accordion panel on the canvas. `label` is '' to clear it. */
export type RenameColumnToParentMessage = { source: typeof SOURCE; type: 'renameColumn'; path: NodePath; label: string }

/** Narrows an incoming message to a column rename (even-length path, i.e. a column - see above). */
export const isRenameColumnMessage = (data: unknown): data is RenameColumnToParentMessage => {
  if (!isBridgeMessage(data)) return false
  const msg = data as { type?: unknown; path?: unknown; label?: unknown }
  return msg.type === 'renameColumn' && Array.isArray(msg.path) && msg.path.length > 0 && msg.path.length % 2 === 0 && typeof msg.label === 'string'
}
