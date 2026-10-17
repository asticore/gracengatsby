/** Inlined as a <style> tag from VisualEditor.tsx.
 * A .css import works fine under Next's build, but engine's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 *
 * Colors are CSS custom properties on .ve-root, not hardcoded hex, for two
 * reasons: the original engine's own dark mode (it sets data-theme="dark" on <html>,
 * checked directly in node_modules/the vendor package) was leaking through
 * unstyled before, and a couple of buttons (.ve-btn--ghost, specifically)
 * hardcoded dark text that went invisible against the always-dark topbar -
 * every color below is one of these tokens so that bug class can't recur.
 * Filled buttons always pair --ve-*-contrast against its own --ve-* fill, so
 * a button's text is deliberately the opposite lightness of its background;
 * outline/ghost buttons never set their own color and just inherit --ve-text
 * from whatever surface they sit on, which is themed to contrast that
 * surface already.
 */
import { sectionLayoutCss } from '@/lib/sectionLayout'

/** Canvas twin of the public site's section rules (same generator, so the editor floats columns the way the page will). */
export const CANVAS_SECTION_LAYOUT_CSS = sectionLayoutCss({
  section: '.ve-section',
  column: '.ve-column',
  defaultGap: 12,
  columnExtra: 'max-width:none;',
})

export const VISUAL_EDITOR_CSS = `
/* Tokens are declared on :root AS WELL AS .ve-root - this stylesheet gets injected into two
   separate documents (VisualEditor.tsx's own page, and the canvas iframe's document via
   CanvasFrame.tsx, which has no .ve-root element at all, only .ve-frame-root). A selector of
   ".ve-root" alone left every var() reference inside the iframe (node outlines, the insert
   "+", drag-over states) resolving to nothing - CSS silently falls back to that property's
   initial value instead of erroring, which is why the outline/button looked colorless rather
   than obviously broken. :root matches the <html> element in both documents, so this covers
   both without changing anything for the parent page (.ve-root is still there too, redundant
   but harmless). */
:root,
.ve-root {
  /* Light theme (default) - blues/greys, matches the site's own brand. */
  --ve-bg: #f5f3f5;
  --ve-surface: #ffffff;
  --ve-surface-alt: #eeedf2;
  --ve-surface-hover: #f8f7fa;
  --ve-border: #dedce3;
  --ve-border-strong: #cac7d1;
  --ve-text: #201f26;
  --ve-text-muted: #857c8d;
  --ve-text-faint: #a39da8;
  --ve-accent: #2e3192;
  --ve-accent-hover: #3d40a8;
  --ve-accent-contrast: #ffffff;
  --ve-danger: #b3453a;
  --ve-danger-contrast: #ffffff;
  /* Green is reserved for "selection" and "add" affordances specifically -
     never used for anything else - so it reads as its own signal distinct
     from --ve-accent (which still means "primary brand action"). Same value
     in both themes on purpose: a fixed color identity, not something dark
     mode should reinterpret. */
  --ve-select: #22a35e;
  --ve-select-contrast: #ffffff;
  --ve-select-hover: #1c8a4d;
  --ve-checker-a: #eeedf2;
  --ve-checker-b: #e7e5ec;
  --ve-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 12px 30px rgba(0, 0, 0, 0.06);
  --ve-shadow-pop: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 12px 30px rgba(0, 0, 0, 0.14);
  /* The topbar and node/toolbar chrome stay dark in both themes on purpose -
     it's editor chrome, not page surface, same as Elementor's always-dark
     toolbar - so these two are fixed rather than swapped per theme. */
  --ve-chrome-bg: #1b1d29;
  --ve-chrome-text: #ffffff;

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--ve-bg);
  color: var(--ve-text);
}

/* Dark mode: a deliberately distinct navy palette, not an auto-inversion of
   the light theme, so it reads as designed rather than "light theme with the
   lights off". */
html[data-theme='dark'] .ve-root {
  --ve-bg: #0a1120;
  --ve-surface: #111b2f;
  --ve-surface-alt: #172441;
  --ve-surface-hover: #1c2b4c;
  --ve-border: #24334f;
  --ve-border-strong: #2f4368;
  --ve-text: #e7edf9;
  --ve-text-muted: #93a4c7;
  --ve-text-faint: #6b7ba0;
  --ve-accent: #4e8dff;
  --ve-accent-hover: #72a2ff;
  --ve-accent-contrast: #06101f;
  --ve-danger: #e8695c;
  --ve-danger-contrast: #200a07;
  --ve-checker-a: #111b2f;
  --ve-checker-b: #172441;
  --ve-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35), 0 12px 30px rgba(0, 0, 0, 0.45);
  --ve-shadow-pop: 0 0 0 1px rgba(0, 0, 0, 0.4), 0 12px 30px rgba(0, 0, 0, 0.55);
  --ve-chrome-bg: #050a15;
  --ve-chrome-text: #e7edf9;
}

.ve-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* Right padding leaves room for the fixed theme toggler (top right of the
     admin, see custom.css .theme-toggler) now that the editor is full-bleed. */
  padding: 12px 64px 12px 20px;
  background: var(--ve-chrome-bg);
  color: var(--ve-chrome-text);
  gap: 16px;
  flex-shrink: 0;
}

.ve-topbar__left {
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
}

.ve-topbar__title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ve-topbar__status {
  font-size: 12px;
  opacity: 0.7;
}

.ve-topbar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ve-btn {
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: transparent;
  color: inherit;
  padding: 8px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
}

.ve-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.ve-btn--primary {
  background: var(--ve-accent);
  border-color: var(--ve-accent);
  color: var(--ve-accent-contrast);
}

.ve-btn--primary:hover {
  background: var(--ve-accent-hover);
  border-color: var(--ve-accent-hover);
}

.ve-btn--danger {
  border-color: var(--ve-danger);
  color: var(--ve-danger);
}

/* Ghost buttons deliberately set no color of their own - they show up on the
   dark topbar AND inside light/dark panels, and inheriting --ve-text (or the
   topbar's own white) is what keeps them readable in both instead of a
   color baked in for one context going invisible in the other. */
.ve-btn--ghost {
  border-color: var(--ve-border-strong);
}

.ve-btn--icon {
  padding: 8px 10px;
  font-size: 15px;
  line-height: 1;
}

.ve-body {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

.ve-canvas-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  min-width: 0;
}

.ve-canvas {
  max-width: 100%;
  /* The wrap already scrolls; the canvas fills its height so the iframe -
     which scrolls its own document, not this one - gets a real height to
     size against instead of collapsing to 0. */
  height: calc(100% - 1px);
  margin: 0 auto;
  background: #fff;
  box-shadow: var(--ve-shadow);
  transition: max-width 0.15s ease;
  position: relative;
}

/* Desktop is full width - the canvas fills the available space, same as the
   real page does. Tablet and mobile clamp to real device widths so the
   site's actual media queries kick in at the right breakpoints. */
.ve-canvas--tablet {
  max-width: 820px;
}

.ve-canvas--mobile {
  max-width: 390px;
}

.ve-canvas__frame {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  background: #fff;
}

.ve-canvas__loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 14px;
  color: var(--ve-text-muted);
}

.ve-device-toggle {
  display: flex;
  gap: 2px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 2px;
  margin-right: 8px;
}

.ve-device-btn {
  border: none;
  background: transparent;
  color: inherit;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  opacity: 0.6;
}

.ve-device-btn:hover {
  opacity: 0.9;
}

.ve-device-btn--active {
  background: rgba(255, 255, 255, 0.16);
  opacity: 1;
}

/* Elementor-style insert slot: a thin line that only shows on hover/drag,
   with a circular "+" riding on top of it. The hit area (via negative
   margin) is taller than the visible 1px line so both hovering and
   dropping a dragged block card are easy to land on. */
.ve-insert {
  position: relative;
  height: 1px;
  margin: -9px 0;
  padding: 9px 0;
}

.ve-insert::before {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 9px;
  height: 2px;
  background: var(--ve-select);
  opacity: 0;
  transition: opacity 0.1s;
}

.ve-insert:hover::before,
.ve-insert--drag-over::before,
.ve-insert--open::before {
  opacity: 0.6;
}

/* Placeholder look shared by the open "+" slot, a slot being dragged over, and empty
   containers: a dashed green box saying where the block lands. The open slot really takes
   the space (so the page opens up there, height animated); a drag-over slot is an overlay
   that does NOT shift layout, so the element under the pointer (elementFromPoint) and
   dnd-kit's measured rects stay put while dragging - no flicker. */
.ve-insert--open {
  box-sizing: border-box;
  height: 56px;
  margin: 8px 0;
  padding: 0;
  border: 2px dashed var(--ve-select);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ve-select) 12%, transparent);
  transition: height 0.12s ease, margin 0.12s ease, padding 0.12s ease;
}

.ve-insert--open::before,
.ve-insert--drag-over::before {
  display: none;
}

.ve-insert--open::after,
.ve-insert--drag-over::after,
.ve-insert--empty::after {
  content: 'New block goes here';
  position: absolute;
  left: calc(50% + 24px);
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 12px;
  font-weight: 600;
  color: var(--ve-select);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.ve-insert--drag-over:not(.ve-insert--open) {
  z-index: 5;
}

/* Overlay variant: a 56px dashed box centred on the slot line, taken out of flow. */
.ve-insert--drag-over:not(.ve-insert--open)::before {
  display: block;
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  top: 9px;
  height: 56px;
  transform: translateY(-50%);
  box-sizing: border-box;
  border: 2px dashed var(--ve-select);
  border-radius: 6px;
  background: color-mix(in srgb, var(--ve-select) 14%, transparent);
  opacity: 1;
  pointer-events: none;
}

/* Empty container: a visible, in-flow drop zone instead of a 1px line. */
.ve-insert--empty {
  box-sizing: border-box;
  height: 56px;
  margin: 8px 0;
  padding: 0;
  border: 2px dashed color-mix(in srgb, var(--ve-select) 55%, transparent);
  border-radius: 6px;
}

.ve-insert--empty::before {
  display: none;
}

.ve-insert--empty::after {
  content: 'Drop a block here';
  color: var(--ve-text-muted);
}

.ve-insert--empty.ve-insert--drag-over,
.ve-insert--empty.ve-insert--open {
  border-color: var(--ve-select);
  background: color-mix(in srgb, var(--ve-select) 14%, transparent);
}

.ve-insert--empty.ve-insert--drag-over::after,
.ve-insert--empty.ve-insert--open::after {
  content: 'New block goes here';
  color: var(--ve-select);
}

/* Empty slots overlay-variant must not double up: the in-flow box is already the placeholder. */
.ve-insert--empty.ve-insert--drag-over:not(.ve-insert--open)::before {
  display: none;
}

/* Plus button: white "+" on a solid green circle, always given a shadow so
   it reads against any section background (light or image), not just the
   editor's own accent color which was too close to the canvas white. */
.ve-insert__btn {
  position: absolute;
  top: 9px;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid #ffffff;
  background: var(--ve-select);
  color: var(--ve-select-contrast);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  font-size: 17px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  z-index: 6;
  opacity: 0;
  transition: opacity 0.1s, transform 0.1s, background 0.1s;
}

.ve-insert--open .ve-insert__btn,
.ve-insert--empty .ve-insert__btn {
  top: 50%;
}

.ve-insert:hover .ve-insert__btn,
.ve-insert--open .ve-insert__btn,
.ve-insert--always .ve-insert__btn,
.ve-insert--empty .ve-insert__btn {
  opacity: 1;
}

.ve-insert__btn:hover {
  background: var(--ve-select-hover);
  color: #ffffff;
  transform: translate(-50%, -50%) scale(1.15);
}

.ve-insert--drag-over .ve-insert__btn {
  opacity: 1;
  background: var(--ve-select-hover);
}

/* Rotates to a "x" while open, the same close affordance Elementor uses - a
   visual cue that clicking it again (or clicking away) dismisses the panel
   instead of adding a second element. */
.ve-insert--open .ve-insert__btn {
  transform: translate(-50%, -50%) rotate(45deg);
  background: var(--ve-select-hover);
}

.ve-insert--open .ve-insert__btn:hover {
  transform: translate(-50%, -50%) rotate(45deg) scale(1.15);
}

/* Handle-drag (dnd-kit) feedback: ghost label follows the pointer; not-allowed cursor over
   anywhere that has no valid slot. */
.ve-drag-ghost {
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--ve-select);
  color: var(--ve-select-contrast);
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
  cursor: grabbing;
  white-space: nowrap;
}

.ve-frame-root--dragging,
.ve-frame-root--dragging * {
  cursor: grabbing !important;
}

.ve-frame-root--no-drop,
.ve-frame-root--no-drop * {
  cursor: not-allowed !important;
}

.ve-empty-canvas {
  padding: 80px 24px;
  text-align: center;
  color: var(--ve-text-muted);
}

/* ---------------------------------------------------------------------------
   Left dock: persistent Elements/Settings panel (replaces the old add-element
   popup and the separate right-hand field panel - one Elementor-style dock).
   --------------------------------------------------------------------------- */

.ve-dock {
  width: 340px;
  flex-shrink: 0;
  background: var(--ve-surface);
  color: var(--ve-text);
  border-right: 1px solid var(--ve-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ve-dock__tabs {
  display: flex;
  border-bottom: 1px solid var(--ve-border);
  flex-shrink: 0;
}

.ve-dock__tab {
  flex: 1;
  border: none;
  background: none;
  color: var(--ve-text-muted);
  padding: 13px 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  border-bottom: 2px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.ve-dock__tab--active {
  color: var(--ve-text);
  border-bottom-color: var(--ve-accent);
}

.ve-dock__body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

/* Settings tab: nothing selected yet. */
.ve-dock__empty {
  padding: 40px 24px;
  text-align: center;
  color: var(--ve-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.ve-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.ve-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--ve-border);
  flex-shrink: 0;
}

.ve-panel__icon {
  margin-right: 6px;
}

.ve-panel__body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-content: flex-start;
}

.ve-panel__body--flush {
  padding: 0;
  gap: 0;
}

.ve-panel__footer {
  padding: 12px 16px;
  border-top: 1px solid var(--ve-border);
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ve-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ve-text-muted);
}

.ve-field--full {
  width: 100%;
}

.ve-field--half {
  width: calc(50% - 7px);
}

.ve-field input[type='text'],
.ve-field input[type='number'],
.ve-field textarea,
.ve-field select {
  font-weight: 400;
  font-size: 13px;
  padding: 7px 9px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 5px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-field--checkbox {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.ve-icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  color: inherit;
  opacity: 0.7;
}

.ve-icon-btn:hover {
  opacity: 1;
}

.ve-media-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ve-media-field__thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--ve-border);
}

.ve-media-field__empty {
  width: 56px;
  height: 56px;
  border-radius: 5px;
  border: 1px dashed var(--ve-border-strong);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: var(--ve-text-faint);
  text-align: center;
}

.ve-media-field__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ve-media-multi {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ve-media-multi__item {
  position: relative;
  width: 56px;
  height: 56px;
}

.ve-media-multi__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--ve-border);
}

.ve-media-multi__item button {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: var(--ve-danger);
  color: var(--ve-danger-contrast);
  font-size: 10px;
  cursor: pointer;
}

.ve-media-multi__add {
  width: 56px;
  height: 56px;
  border-radius: 5px;
  border: 1px dashed var(--ve-border-strong);
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--ve-text-muted);
}

/* Still a real modal - used by the media picker, which is a one-off image
   chooser, not the "adding elements" flow that moved into the dock. */
.ve-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ve-modal {
  background: var(--ve-surface);
  color: var(--ve-text);
  width: min(720px, 92vw);
  max-height: 80vh;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ve-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--ve-border);
}

.ve-modal__body {
  padding: 18px;
  overflow-y: auto;
}

.ve-media-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}

.ve-media-grid__item {
  aspect-ratio: 1;
  border: 1px solid var(--ve-border);
  border-radius: 5px;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  background: var(--ve-surface-alt);
}

.ve-media-grid__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ve-media-grid__item:hover {
  border-color: var(--ve-accent);
}

.ve-dynamic-placeholder {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 40px 24px;
  background: repeating-linear-gradient(45deg, var(--ve-checker-a), var(--ve-checker-a) 10px, var(--ve-checker-b) 10px, var(--ve-checker-b) 20px);
  border-top: 1px dashed var(--ve-border-strong);
  border-bottom: 1px dashed var(--ve-border-strong);
}

.ve-dynamic-placeholder__icon {
  font-size: 28px;
}

.ve-dynamic-placeholder p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ve-text-muted);
}

.ve-unknown-block {
  padding: 20px;
  color: var(--ve-danger);
}

.ve-error {
  color: var(--ve-danger);
}

.ve-loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-size: 14px;
  color: var(--ve-text-muted);
}

/* ---------------------------------------------------------------------------
   Nested canvas: nodes, sections, columns, insertion points
   --------------------------------------------------------------------------- */

.ve-frame-root {
  min-height: 100%;
  padding-bottom: 120px;
}

.ve-node {
  position: relative;
  overflow: visible;
  cursor: pointer;
  outline: 1px solid transparent;
  outline-offset: -1px;
  transition: outline-color 0.1s;
}

.ve-node:hover {
  outline-color: color-mix(in srgb, var(--ve-accent) 55%, transparent);
}

.ve-node--selected {
  outline: 2px solid var(--ve-select);
  outline-offset: -2px;
}
.ve-node--locked { box-shadow: inset 0 0 0 1px rgba(180, 120, 0, 0.55); }
.ve-node__lock { margin-right: 2px; }
/* display:contents drops the fieldset's own box (it was a shrink-to-fit flex item inside
   .ve-panel__body, which made accordions as narrow as their content) while a disabled
   fieldset still disables every control inside it. */
.ve-lockset { display: contents; border: 0; padding: 0; margin: 0; min-width: 0; }
.ve-lockset legend { font-size: 12px; font-weight: 600; padding: 0; }
.ve-lock { padding: 8px 12px; border-bottom: 1px solid rgba(0,0,0,0.1); font-size: 12px; }
.ve-lock__status { margin: 0 0 6px; }
.ve-lock__form { display: grid; gap: 6px; }
.ve-lock__check { display: inline-flex; gap: 4px; margin-right: 10px; }

.ve-node__toolbar {
  position: absolute;
  top: 0;
  left: 0;
  right: auto;
  width: auto;
  max-width: 100%;
  transform: translateY(-100%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--ve-chrome-bg);
  color: var(--ve-chrome-text);
  border-radius: 5px 5px 0 0;
  padding: 1px 4px;
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.1s;
  pointer-events: none;
}

/* First top-level node: no room above, so the pill sits just inside the top edge. */
.ve-node--first > .ve-node__toolbar {
  transform: none;
  border-radius: 0 0 5px 0;
}
.ve-node--depth-1 > .ve-node__toolbar { z-index: 11; left: 12px; }
.ve-node--depth-2 > .ve-node__toolbar { z-index: 12; left: 24px; }
.ve-node--depth-3 > .ve-node__toolbar { z-index: 13; left: 36px; }
.ve-node:hover > .ve-node__toolbar,
.ve-node--selected > .ve-node__toolbar {
  opacity: 1;
  pointer-events: auto;
}

.ve-node__label {
  white-space: nowrap;
  font-weight: 600;
}

.ve-node__spacer {
  flex: 0 0 4px;
}

.ve-node__act {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 2px 4px;
  border-radius: 4px;
  opacity: 0.75;
}

.ve-node__act:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.16);
  opacity: 1;
}

.ve-node__act:disabled {
  opacity: 0.25;
  cursor: default;
}

.ve-node__act--danger:hover:not(:disabled) {
  background: var(--ve-danger);
}

/* Block previews shouldn't swallow clicks meant for selection, but a nested
   section's own children must stay clickable. */
.ve-node__preview {
  pointer-events: none;
}

.ve-node--depth-1 {
  outline-style: dashed;
}

/* Sections and columns on the canvas - mirrors the real .be-section/.be-column
   flex-wrap layout (see styles.css) so the editor floats columns exactly the
   way the live page will: each carries the same --be-col-d/-t/-m custom
   properties, columns sit side by side until a row runs out of room, and the
   next one wraps down to start a new row with no limit on how many you add. */
.ve-section {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 22px 10px 10px;
}

.ve-column {
  position: relative;
  min-width: 0;
  min-height: 70px;
  flex: 1 1 var(--be-col-d, 100%);
  max-width: var(--be-col-d, 100%);
  border: 1px dashed var(--ve-border-strong);
  border-radius: 4px;
  padding: 18px 6px 6px;
}

/* This CSS is injected into the canvas iframe's own document (CanvasFrame.tsx),
   which has its own viewport - shrinking it via .ve-canvas--tablet/--mobile
   on the PARENT document's wrapper div is what makes these media queries
   fire in here, exactly the same way styles.css's matching 900px/600px
   queries fire for the real site. Ancestor-class selectors would never match
   across that document boundary, so these have to be real media queries. */
@media (max-width: 900px) {
  .ve-column {
    flex-basis: var(--be-col-t, var(--be-col-d, 100%));
    max-width: var(--be-col-t, var(--be-col-d, 100%));
  }
}

@media (max-width: 600px) {
  .ve-column {
    flex-basis: var(--be-col-m, var(--be-col-t, var(--be-col-d, 100%)));
    max-width: var(--be-col-m, var(--be-col-t, var(--be-col-d, 100%)));
  }
}

.ve-column__tag {
  position: absolute;
  top: 3px;
  left: 6px;
  font-size: 10px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: var(--ve-text-faint);
  pointer-events: none;
}

.ve-section-empty {
  padding: 30px 20px;
  text-align: center;
  font-size: 13px;
  color: var(--ve-text-muted);
}

/* ---------------------------------------------------------------------------
   Elements tab (blocks + templates) - lives in the dock now, not a popup.
   --------------------------------------------------------------------------- */

.ve-library {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ve-library__controls {
  padding: 12px 16px;
  border-bottom: 1px solid var(--ve-border);
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.ve-library__search {
  width: 100%;
  font-size: 14px;
  padding: 9px 12px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-library__tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ve-library__tab {
  border: 1px solid var(--ve-border-strong);
  background: var(--ve-surface);
  color: var(--ve-text);
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
}

.ve-library__tab--active {
  background: var(--ve-chrome-bg);
  border-color: var(--ve-chrome-bg);
  color: var(--ve-chrome-text);
}

.ve-library__source-tabs {
  display: flex;
  gap: 4px;
  background: var(--ve-surface-alt);
  border-radius: 7px;
  padding: 3px;
}

.ve-library__source-tab {
  flex: 1;
  border: none;
  background: none;
  color: var(--ve-text-muted);
  padding: 7px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.ve-library__source-tab--active {
  background: var(--ve-surface);
  color: var(--ve-text);
  box-shadow: 0 0 0 1px var(--ve-border);
}

.ve-library__body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 24px;
}

.ve-library__group {
  margin-bottom: 22px;
}

.ve-library__group-title {
  margin: 0 0 10px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ve-text-muted);
}

.ve-library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.ve-library__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid var(--ve-border);
  background: var(--ve-surface);
  color: var(--ve-text);
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
}

.ve-library__card:hover {
  border-color: var(--ve-accent);
  background: var(--ve-surface-hover);
}

.ve-library__card-icon {
  font-size: 20px;
}

.ve-library__card-label {
  font-weight: 600;
  font-size: 13px;
}

.ve-library__empty {
  color: var(--ve-text-muted);
  font-size: 13px;
}

.ve-library__hint {
  margin: 0 0 14px;
  font-size: 12px;
  color: var(--ve-text-muted);
  line-height: 1.5;
}

/* Template cards get a bit more room (they represent a whole page/section, a
   preset name is more useful than an icon here). */
.ve-template-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.ve-template-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  text-align: left;
  width: 100%;
  border: 1px solid var(--ve-border);
  background: var(--ve-surface);
  color: var(--ve-text);
  border-radius: 8px;
  padding: 12px 14px;
  cursor: pointer;
}

.ve-template-card:hover {
  border-color: var(--ve-accent);
  background: var(--ve-surface-hover);
}

.ve-template-card__name {
  font-weight: 600;
  font-size: 13px;
}

.ve-template-card__desc {
  font-size: 11px;
  color: var(--ve-text-muted);
}

/* Panel tabs (Settings tab: Content/Design sub-tabs) */
.ve-panel__tabs {
  display: flex;
  border-bottom: 1px solid var(--ve-border);
  flex-shrink: 0;
}

.ve-panel__tab {
  flex: 1;
  border: none;
  background: none;
  padding: 10px 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: var(--ve-text-muted);
  border-bottom: 2px solid transparent;
}

.ve-panel__tab--active {
  color: var(--ve-text);
  border-bottom-color: var(--ve-accent);
}

.ve-panel__empty,
.ve-panel__hint {
  font-size: 12px;
  color: var(--ve-text-muted);
  margin: 0 0 10px;
  width: 100%;
  line-height: 1.45;
}

/* Design tab */
.ve-design {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ve-acc {
  width: 100%;
  min-width: 0;
  border-bottom: 1px solid var(--ve-border);
}

.ve-acc__head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  color: var(--ve-text-muted);
  padding: 12px 16px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.ve-acc__chev {
  color: var(--ve-text-faint);
}

.ve-acc__body {
  padding: 2px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ve-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ve-text-muted);
}

.ve-row--check {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.ve-row__label {
  font-size: 11px;
}

.ve-row__help {
  font-weight: 400;
  font-size: 10px;
  color: var(--ve-text-faint);
}

.ve-row input[type='text'],
.ve-row input[type='number'],
.ve-row select {
  font-weight: 400;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 5px;
  font-family: inherit;
  width: 100%;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-color {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ve-color input[type='color'] {
  width: 34px;
  height: 30px;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--ve-border-strong);
  border-radius: 5px;
  background: none;
  cursor: pointer;
}

.ve-color__clear {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--ve-text-faint);
  padding: 2px 4px;
}

.ve-divider-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 4px;
  border-bottom: 1px dashed var(--ve-border);
}

/* Section layout tab */
.ve-section-fields {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ve-col-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ve-col-row__num {
  width: 20px;
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--ve-text-faint);
}

.ve-col-row select {
  flex: 1;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 5px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-col-row__custom {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ve-col-row__custom input {
  width: 56px;
  font-size: 12px;
  padding: 6px 6px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 5px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-col-row__custom select {
  flex: none;
  width: 48px;
  font-size: 12px;
  padding: 6px 4px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 5px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

/* Same pill toggle as the topbar's device switcher, recolored to sit inside
   a light/dark panel instead of the always-dark topbar. */
.ve-device-toggle--panel {
  background: var(--ve-surface-alt);
  margin: 0 0 4px;
}

.ve-device-toggle--panel .ve-device-btn {
  color: var(--ve-text-muted);
}

.ve-device-toggle--panel .ve-device-btn--active {
  background: var(--ve-surface);
  color: var(--ve-text);
  box-shadow: var(--ve-shadow);
}

/* Merge tag picker */
.ve-field__labelrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.ve-field__help {
  font-weight: 400;
  font-size: 10px;
  color: var(--ve-text-faint);
}

.ve-tagpicker {
  position: relative;
}

.ve-tagpicker__btn {
  border: 1px solid var(--ve-border-strong);
  background: var(--ve-surface);
  color: var(--ve-text-muted);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: monospace;
  cursor: pointer;
}

.ve-tagpicker__btn:hover {
  border-color: var(--ve-accent);
  color: var(--ve-text);
}

.ve-tagpicker__scrim {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.ve-tagpicker__menu {
  position: absolute;
  top: 100%;
  right: 0;
  z-index: 41;
  margin-top: 4px;
  width: 260px;
  max-height: 320px;
  overflow-y: auto;
  background: var(--ve-surface);
  color: var(--ve-text);
  border-radius: 8px;
  box-shadow: var(--ve-shadow-pop);
  padding: 8px;
}

.ve-tagpicker__hint {
  margin: 0 0 8px;
  font-size: 10px;
  font-weight: 400;
  color: var(--ve-text-muted);
  line-height: 1.4;
}

.ve-tagpicker__group h5 {
  margin: 8px 0 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ve-text-faint);
}

.ve-tagpicker__item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  color: inherit;
  padding: 5px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.ve-tagpicker__item:hover {
  background: var(--ve-surface-alt);
}

.ve-tagpicker__item code {
  font-size: 11px;
  color: var(--ve-text);
}

.ve-tagpicker__item span {
  font-size: 10px;
  font-weight: 400;
  color: var(--ve-text-muted);
}

/* Loop preview */
.ve-loop-preview {
  padding: 26px 24px;
  background: repeating-linear-gradient(45deg, var(--ve-checker-a), var(--ve-checker-a) 10px, var(--ve-checker-b) 10px, var(--ve-checker-b) 20px);
  border-top: 1px dashed var(--ve-border-strong);
  border-bottom: 1px dashed var(--ve-border-strong);
}

.ve-loop-preview__head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
}

.ve-loop-preview__icon {
  font-size: 26px;
}

.ve-loop-preview__head p {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--ve-text-muted);
}

.ve-loop-preview__grid {
  display: grid;
  grid-template-columns: repeat(var(--loop-columns, 3), minmax(0, 1fr));
  gap: 10px;
}

.ve-loop-preview__card {
  height: 64px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid var(--ve-border);
}

/* Template browser (TemplateBrowser.tsx) and the Save as template dialog */
.ve-tpl {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ve-tpl__filters {
  display: flex;
  gap: 4px;
  background: var(--ve-surface-alt);
  border-radius: 7px;
  padding: 3px;
}

.ve-tpl__filter {
  flex: 1;
  border: none;
  background: none;
  color: var(--ve-text-muted);
  padding: 6px 4px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.ve-tpl__filter--active {
  background: var(--ve-surface);
  color: var(--ve-text);
  box-shadow: 0 0 0 1px var(--ve-border);
}

.ve-tpl__select {
  width: 100%;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-tpl__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.ve-tpl__card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: stretch;
  text-align: left;
  min-width: 0;
  border: 1px solid var(--ve-border);
  background: var(--ve-surface);
  color: var(--ve-text);
  border-radius: 8px;
  padding: 6px;
  cursor: pointer;
}

.ve-tpl__card:hover:not([aria-disabled="true"]),
.ve-tpl__card:focus-visible {
  border-color: var(--ve-accent);
  background: var(--ve-surface-hover);
}

.ve-tpl__card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ve-tpl__thumb {
  position: relative;
  display: block;
  aspect-ratio: 4 / 3;
  border-radius: 5px;
  overflow: hidden;
  background: var(--ve-surface-alt);
}

.ve-tpl__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ve-tpl__thumb-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--ve-text-muted);
}

.ve-tpl__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.7);
  color: #1b1f24;
}

.ve-tpl__name {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
  padding: 0 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ve-tpl__chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  padding: 0 2px 2px;
}

.ve-tpl__chip {
  font-size: 10px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  background: var(--ve-surface-alt);
  color: var(--ve-text-muted);
  border: 1px solid var(--ve-border);
}

.ve-tpl__chip--repo {
  color: var(--ve-accent);
  border-color: var(--ve-accent);
}

.ve-tpl__toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  z-index: 1100;
  max-width: min(480px, 90vw);
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  background: var(--ve-chrome-bg);
  color: var(--ve-chrome-text);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.3);
}

.ve-tpl__toast--error {
  background: var(--ve-danger);
  color: #fff;
}

.ve-tpl-dialog {
  width: min(420px, 92vw);
}

.ve-tpl-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ve-tpl-dialog__form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
}

.ve-tpl-dialog__form input,
.ve-tpl-dialog__form select {
  font-size: 14px;
  font-weight: 400;
  padding: 8px 10px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  font-family: inherit;
  background: var(--ve-surface);
  color: var(--ve-text);
}

.ve-tpl-dialog__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

/* A library card is being dragged: let the parent wrapper (not the iframe document) get the
   dragover/drop events, and keep library cards looking draggable. */
.ve-canvas--lib-drag .ve-canvas__frame {
  pointer-events: none;
}

.ve-library__card[draggable='true'] {
  cursor: grab;
  user-select: none;
}

.ve-form-empty {
  font-size: 13px;
  line-height: 1.5;
  color: var(--ve-text-muted, #666);
}

.ve-form-empty a {
  color: var(--ve-accent, #2563eb);
  font-weight: 600;
}
/* History buttons, shortcuts popover and the block context menu. */
.ve-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ve-history {
  display: flex;
  gap: 2px;
  margin-right: 8px;
}

.ve-shortcuts {
  position: relative;
}

.ve-shortcuts__panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 1200;
  width: min(440px, 92vw);
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--ve-surface);
  color: var(--ve-text);
  border: 1px solid var(--ve-border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  font-size: 13px;
}

.ve-shortcuts__title {
  margin: 0 0 8px;
  font-weight: 700;
}

.ve-shortcuts__list {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 14px;
  margin: 0;
}

.ve-shortcuts__list dt {
  font-weight: 600;
  white-space: nowrap;
}

.ve-shortcuts__list dd {
  margin: 0;
  color: var(--ve-text-muted);
}

.ve-shortcuts__note {
  margin: 10px 0 0;
  font-size: 12px;
  color: var(--ve-text-muted);
}

.ve-ctxmenu {
  position: fixed;
  z-index: 1300;
  min-width: 200px;
  padding: 4px;
  border-radius: 8px;
  background: var(--ve-surface);
  color: var(--ve-text);
  border: 1px solid var(--ve-border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
  outline: none;
}

.ve-ctxmenu__item {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  width: 100%;
  padding: 7px 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.ve-ctxmenu__item--active {
  background: var(--ve-surface-alt);
}

.ve-ctxmenu__item--danger {
  color: var(--ve-danger);
}

.ve-ctxmenu__item:disabled {
  opacity: 0.4;
  cursor: default;
}

.ve-ctxmenu__hint {
  color: var(--ve-text-muted);
  font-size: 12px;
}

.ve-ctxmenu__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--ve-border);
}

/* ---------------------------------------------------------------------------
   Column selection, structure picker, device badges (responsive editing)
   --------------------------------------------------------------------------- */
:root { --ve-column: #0284c7; --ve-column-soft: rgba(2, 132, 199, 0.08); }

/* Columns get a blue DASHED outline - blocks keep their own solid indigo / green one. */
.ve-column { cursor: pointer; }
.ve-column:hover:not(:has(.ve-node:hover)) {
  border: 1px dashed var(--ve-column);
  background: var(--ve-column-soft);
}
.ve-column--selected,
.ve-column--selected:hover {
  border: 2px dashed var(--ve-column);
  background: var(--ve-column-soft);
}
.ve-column--selected > .ve-column__tag { color: var(--ve-column); font-weight: 700; }

/* Drag-resize handle between two side-by-side columns (Canvas.tsx ColumnResizeHandle). Shown while
   the section or its selection is hovered; not drawn at all where the section stacks on this device. */
.ve-section:has(> .ve-col-resize) { position: relative; }
.ve-col-resize {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  transform: translateX(-50%);
  cursor: col-resize;
  z-index: 5;
  touch-action: none;
  opacity: 0;
  transition: opacity 0.12s ease;
}
.ve-col-resize::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: 3px;
  width: 2px;
  border-radius: 2px;
  background: var(--ve-accent);
}
.ve-section:hover > .ve-col-resize,
.ve-node--selected > .ve-node__body > .ve-section > .ve-col-resize,
.ve-col-resize:hover,
.ve-col-resize--active { opacity: 1; }
.ve-col-resize[aria-disabled='true'] { display: none; }
.ve-col-resize__tip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--ve-accent);
  color: #fff;
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}
.ve-column__toolbar {
  position: absolute;
  top: -13px;
  right: 8px;
  z-index: 7;
  display: flex;
  gap: 2px;
  background: var(--ve-column);
  color: #fff;
  border-radius: 5px;
  padding: 2px 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}
.ve-column__act {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 4px;
}
.ve-column__act:hover:not(:disabled) { background: rgba(255, 255, 255, 0.22); }
.ve-column__act:disabled { opacity: 0.35; cursor: default; }
.ve-column__act--danger:hover:not(:disabled) { background: var(--ve-danger); }
.ve-column__inner {
  display: block;
  margin: 6px auto 2px;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--ve-column);
  background: transparent;
  border: 1px dashed var(--ve-column);
  border-radius: 4px;
  cursor: pointer;
}
.ve-column__inner:hover { background: var(--ve-column-soft); }

/* A section with a minimum height lets its columns sit top / middle / bottom inside it. */
.ve-node--minh:has(> .ve-node__body > .ve-section) { display: flex; flex-direction: column; }
.ve-node--minh > .ve-node__body { flex: 1 1 auto; display: flex; flex-direction: column; }
.ve-node--minh > .ve-node__body > .ve-section { flex: 1 1 auto; }

/* Device badge next to a responsive control's label, and its reset button. */
.ve-row__label { display: flex; align-items: center; gap: 5px; }
.ve-dev { display: inline-flex; align-items: center; color: var(--ve-text-faint); }
.ve-dev--on { color: var(--ve-column); }
.ve-dev__reset {
  margin-left: auto;
  background: none;
  border: none;
  padding: 0 2px;
  font-size: 10px;
  color: var(--ve-column);
  cursor: pointer;
  text-decoration: underline;
}
.ve-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ve-panel__sub { font-size: 11px; color: var(--ve-text-muted); }
.ve-panel__footer--wrap { flex-wrap: wrap; }
.ve-col-custom { flex-direction: row; gap: 6px; }

/* "Select your structure" */
.ve-structure__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(15, 16, 24, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.ve-structure {
  background: var(--ve-surface);
  color: var(--ve-text);
  border-radius: 10px;
  box-shadow: var(--ve-shadow-pop);
  width: min(560px, 100%);
  max-height: 90vh;
  overflow: auto;
  padding: 20px;
}
.ve-structure__title { margin: 0 0 4px; font-size: 18px; }
.ve-structure__help { margin: 0 0 14px; font-size: 12px; color: var(--ve-text-muted); }
.ve-structure__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(112px, 1fr)); gap: 10px; }
.ve-structure__option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 6px;
  background: var(--ve-surface-alt);
  color: var(--ve-text-muted);
  border: 1px solid var(--ve-border);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}
.ve-structure__option:hover,
.ve-structure__option:focus-visible { color: var(--ve-column); border-color: var(--ve-column); background: var(--ve-column-soft); outline: none; }
.ve-structure__label { font-size: 11px; color: var(--ve-text); text-align: center; }
.ve-structure__icon { display: block; }
.ve-structure__footer { display: flex; justify-content: flex-end; margin-top: 14px; }
.ve-structure__mini { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ve-structure__mini-btn {
  padding: 4px;
  background: var(--ve-surface-alt);
  color: var(--ve-text-muted);
  border: 1px solid var(--ve-border);
  border-radius: 6px;
  cursor: pointer;
}
.ve-structure__mini-btn .ve-structure__icon { width: 36px; height: 22px; }
.ve-structure__mini-btn:hover:not(:disabled) { color: var(--ve-column); border-color: var(--ve-column); }

/* Navigator panel */
.ve-nav { display: flex; flex-direction: column; gap: 0; }
.ve-nav__group { border-bottom: 1px solid var(--ve-border); }
.ve-nav__group:last-child { border-bottom: none; }
.ve-nav__group-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: var(--ve-surface-alt);
  border: none;
  color: var(--ve-text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.ve-nav__group-header:hover { background: var(--ve-surface-hover); }
.ve-nav__group-toggle { display: inline-flex; width: 16px; justify-content: center; font-size: 10px; color: var(--ve-text-muted); }
.ve-nav__group-label { flex: 1; min-width: 0; }
.ve-nav__group-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--ve-border);
  color: var(--ve-text-muted);
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
}
.ve-nav__group-items { display: flex; flex-direction: column; gap: 0; }
.ve-nav__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 8px 32px;
  background: var(--ve-surface);
  border: none;
  color: var(--ve-text);
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  border-left: 3px solid transparent;
}
.ve-nav__item:hover { background: var(--ve-surface-hover); }
.ve-nav__item--selected {
  background: color-mix(in srgb, var(--ve-accent) 8%, transparent);
  border-left-color: var(--ve-accent);
  color: var(--ve-text);
  font-weight: 500;
}
.ve-nav__item-icon { display: inline-flex; width: 16px; justify-content: center; font-size: 12px; flex-shrink: 0; }
.ve-nav__item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; user-select: none; }
.ve-nav__item-label:hover { text-decoration: underline; }
.ve-nav__item-input {
  flex: 1;
  min-width: 0;
  padding: 2px 4px;
  background: var(--ve-surface-hover);
  border: 1px solid var(--ve-border);
  border-radius: 4px;
  color: var(--ve-text);
  font-size: 12px;
  font-family: inherit;
}
.ve-nav__item-input:focus { outline: none; border-color: var(--ve-accent); }

/* Range slider field */
.ve-range-slider {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ve-range-slider__label {
  font-weight: 500;
  font-size: 13px;
  color: var(--ve-text);
}

.ve-range-slider__container {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ve-range-slider__slider {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--ve-surface-alt);
  outline: none;
  -webkit-appearance: none;
  appearance: none;
  cursor: pointer;
}

.ve-range-slider__slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ve-accent);
  cursor: pointer;
  border: 2px solid var(--ve-surface);
  box-shadow: 0 0 0 1px var(--ve-border);
}

.ve-range-slider__slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--ve-accent);
  cursor: pointer;
  border: 2px solid var(--ve-surface);
  box-shadow: 0 0 0 1px var(--ve-border);
}

.ve-range-slider__input {
  width: 60px;
  padding: 4px 6px;
  border: 1px solid var(--ve-border);
  border-radius: 3px;
  background: var(--ve-surface);
  color: var(--ve-text);
  font-size: 13px;
  font-family: monospace;
}

.ve-range-slider__input:focus {
  outline: none;
  border-color: var(--ve-accent);
}

/* Dimensions field */
.ve-dimensions-field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ve-dimensions-field__label {
  font-weight: 500;
  font-size: 13px;
  color: var(--ve-text);
}

.ve-dimensions-field__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.ve-dimensions-field__link-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 12px;
  color: var(--ve-text-muted);
  user-select: none;
}

.ve-dimensions-field__link-toggle input {
  cursor: pointer;
  margin: 0;
}

.ve-dimensions-field__link-toggle:hover {
  color: var(--ve-text);
}

.ve-dimensions-field__unit {
  padding: 4px 6px;
  border: 1px solid var(--ve-border);
  border-radius: 3px;
  background: var(--ve-surface);
  color: var(--ve-text);
  font-size: 12px;
  cursor: pointer;
}

.ve-dimensions-field__unit:focus {
  outline: none;
  border-color: var(--ve-accent);
}

.ve-dimensions-field__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.ve-dimensions-field__input-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ve-dimensions-field__side-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  color: var(--ve-text-faint);
  letter-spacing: 0.05em;
}

.ve-dimensions-field__input {
  padding: 4px 6px;
  border: 1px solid var(--ve-border);
  border-radius: 3px;
  background: var(--ve-surface);
  color: var(--ve-text);
  font-size: 13px;
  font-family: monospace;
}

.ve-dimensions-field__input:focus {
  outline: none;
  border-color: var(--ve-accent);
}

.ve-repeater__label { display: block; margin-bottom: 6px; }
.ve-repeater__empty { margin: 0 0 6px; color: var(--ve-text-muted); font-size: 12px; }
.ve-repeater__card {
  border: 1px solid var(--ve-border);
  border-radius: 6px;
  background: var(--ve-surface);
  margin-bottom: 8px;
}
.ve-repeater__head {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  cursor: pointer;
  list-style: none;
  color: var(--ve-text);
  background: var(--ve-surface-alt);
  border-radius: 6px;
  user-select: none;
}
.ve-repeater__head::-webkit-details-marker { display: none; }
.ve-repeater__card[open] > .ve-repeater__head {
  border-bottom: 1px solid var(--ve-border);
  border-radius: 6px 6px 0 0;
}
.ve-repeater__num {
  flex: none;
  min-width: 20px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ve-text-muted);
}
.ve-repeater__preview {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.ve-repeater__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}
.ve-repeater__btn {
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--ve-text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.ve-repeater__btn:hover:not(:disabled) {
  background: var(--ve-surface-hover);
  border-color: var(--ve-border-strong);
  color: var(--ve-text);
}
.ve-repeater__btn:disabled { opacity: 0.35; cursor: not-allowed; }
.ve-repeater__btn--danger:hover:not(:disabled) { color: var(--ve-danger); }
.ve-repeater__add {
  width: 100%;
  padding: 7px 10px;
  border: 1px dashed var(--ve-border-strong);
  border-radius: 6px;
  background: transparent;
  color: var(--ve-text);
  font-size: 13px;
  cursor: pointer;
}
.ve-repeater__add:hover { background: var(--ve-surface-hover); border-color: var(--ve-accent); }

` + CANVAS_SECTION_LAYOUT_CSS
