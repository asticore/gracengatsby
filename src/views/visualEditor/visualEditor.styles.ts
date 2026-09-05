/** Inlined as a <style> tag from VisualEditor.tsx.
 * A .css import works fine under Next's build, but payload's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 *
 * Colors are CSS custom properties on .ve-root, not hardcoded hex, for two
 * reasons: Payload's own dark mode (it sets data-theme="dark" on <html>,
 * checked directly in node_modules/@payloadcms/ui) was leaking through
 * unstyled before, and a couple of buttons (.ve-btn--ghost, specifically)
 * hardcoded dark text that went invisible against the always-dark topbar -
 * every color below is one of these tokens so that bug class can't recur.
 * Filled buttons always pair --ve-*-contrast against its own --ve-* fill, so
 * a button's text is deliberately the opposite lightness of its background;
 * outline/ghost buttons never set their own color and just inherit --ve-text
 * from whatever surface they sit on, which is themed to contrast that
 * surface already.
 */
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
  /* Light theme (default) - warm/gold, matches the site's own boutique brand. */
  --ve-bg: #f2f0ec;
  --ve-surface: #ffffff;
  --ve-surface-alt: #f7f5f1;
  --ve-surface-hover: #fdfbf7;
  --ve-border: #e2ded4;
  --ve-border-strong: #d8d3c8;
  --ve-text: #1d1b19;
  --ve-text-muted: #8a8378;
  --ve-text-faint: #a39d90;
  --ve-accent: #c9a15a;
  --ve-accent-hover: #d9b06a;
  --ve-accent-contrast: #1d1b19;
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
  --ve-checker-a: #f7f5f1;
  --ve-checker-b: #f0ede6;
  --ve-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 12px 30px rgba(0, 0, 0, 0.06);
  --ve-shadow-pop: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 12px 30px rgba(0, 0, 0, 0.14);
  /* The topbar and node/toolbar chrome stay dark in both themes on purpose -
     it's editor chrome, not page surface, same as Elementor's always-dark
     toolbar - so these two are fixed rather than swapped per theme. */
  --ve-chrome-bg: #1d1b19;
  --ve-chrome-text: #ffffff;

  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--ve-bg);
  color: var(--ve-text);
}

/* Dark mode: blue, not the inverse of the gold light theme - a deliberate
   navy palette, picked (not auto-inverted) so it reads as designed rather
   than "light theme with the lights off". */
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
  padding: 12px 20px;
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

/* Elementor's "+" opens and stays open - a tinted band across the whole slot,
   not just the hover line, so it reads as "adding here" rather than a
   passing hover state, and it stays lit until the click-away below closes it
   (see CanvasFrame.tsx's openInsertKey - cleared on picking a block, picking
   a different node to edit, or clicking empty canvas). */
.ve-insert--open {
  background: color-mix(in srgb, var(--ve-select) 12%, transparent);
}

.ve-insert--open::before {
  opacity: 0.9;
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

.ve-insert:hover .ve-insert__btn,
.ve-insert--open .ve-insert__btn,
.ve-insert--always .ve-insert__btn {
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
  transform: translate(-50%, -50%) scale(1.3);
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

.ve-node__toolbar {
  position: absolute;
  top: 4px;
  left: 4px;
  right: 4px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--ve-chrome-bg);
  color: var(--ve-chrome-text);
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.1s;
  pointer-events: none;
}

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
  flex: 1;
}

.ve-node__act {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1;
  padding: 3px 5px;
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

.ve-library__card-desc {
  font-size: 11px;
  color: var(--ve-text-muted);
  line-height: 1.35;
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
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ve-acc {
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
  padding: 10px 2px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}

.ve-acc__chev {
  color: var(--ve-text-faint);
}

.ve-acc__body {
  padding: 2px 2px 12px;
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
`
