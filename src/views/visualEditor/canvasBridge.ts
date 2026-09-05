import type { SectionNode } from '@/lib/sectionTree'

import type { NodePath } from './treeOps'

/**
 * The canvas iframe (src/app/(frontend)/visual-editor-canvas) renders the
 * block tree with the site's own styles.css and Header/Footer, so what you
 * see while editing is pixel-exact with the live page - loading that CSS into
 * the same document as the Payload admin UI would corrupt it instead (the
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
  | { source: typeof SOURCE; type: 'init'; blocks: SectionNode[]; selectedPath: NodePath | null }
  | { source: typeof SOURCE; type: 'selected'; selectedPath: NodePath | null }
  /** Highlights the insert slot a library-card drag is currently over (or clears it with null).
   *  The parent resolves the target itself via elementFromPoint - see VisualEditor.tsx - since
   *  native dragover/drop listeners placed inside the iframe's own document don't reliably fire
   *  for a drag that started in the parent document (a known cross-iframe HTML5 DnD limitation). */
  | { source: typeof SOURCE; type: 'dragHover'; key: string | null }

export type FrameToParentMessage =
  | { source: typeof SOURCE; type: 'ready' }
  | { source: typeof SOURCE; type: 'select'; path: NodePath | null }
  | { source: typeof SOURCE; type: 'add'; containerPath: NodePath; at: number }
  | { source: typeof SOURCE; type: 'delete'; path: NodePath }
  | { source: typeof SOURCE; type: 'duplicate'; path: NodePath }
  | { source: typeof SOURCE; type: 'move'; path: NodePath; direction: -1 | 1 }
  | { source: typeof SOURCE; type: 'reorder'; containerPath: NodePath; from: number; to: number }

/** True for any message this bridge sent, from either side - narrow further on `.type` after this. */
export const isBridgeMessage = (data: unknown): data is FrameToParentMessage | ParentToFrameMessage =>
  Boolean(data) && typeof data === 'object' && (data as { source?: unknown }).source === SOURCE

export const CANVAS_ORIGIN = () => (typeof window === 'undefined' ? '' : window.location.origin)
