/** Inlined as a <style> tag from VisualEditor.tsx.
 * A .css import works fine under Next's build, but payload's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 */
export const VISUAL_EDITOR_CSS = `
.ve-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f2f0ec;
}

.ve-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  background: #1d1b19;
  color: #fff;
  gap: 16px;
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
  background: #c9a15a;
  border-color: #c9a15a;
  color: #1d1b19;
}

.ve-btn--primary:hover {
  background: #d9b06a;
}

.ve-btn--danger {
  border-color: #b3453a;
  color: #b3453a;
}

.ve-btn--ghost {
  border-color: #d8d3c8;
  color: #1d1b19;
}

.ve-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.ve-canvas-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.ve-canvas {
  max-width: 1100px;
  margin: 0 auto;
  background: #fff;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06), 0 12px 30px rgba(0, 0, 0, 0.06);
  transition: max-width 0.15s ease;
}

.ve-canvas--mobile {
  max-width: 390px;
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

.ve-insert {
  position: relative;
  height: 1px;
}

.ve-insert__btn {
  position: absolute;
  top: -11px;
  left: 50%;
  transform: translateX(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: #c9a15a;
  color: #1d1b19;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  z-index: 6;
  opacity: 0;
  transition: opacity 0.1s, transform 0.1s;
}

.ve-insert:hover .ve-insert__btn,
.ve-insert--open .ve-insert__btn {
  opacity: 1;
}

.ve-insert__btn:hover {
  transform: translateX(-50%) scale(1.15);
}

.ve-insert__menu {
  position: absolute;
  top: 4px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 7;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 12px 30px rgba(0, 0, 0, 0.12);
  padding: 6px;
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 4px;
  width: max-content;
}

.ve-insert__menu-item {
  border: none;
  background: transparent;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
  text-align: left;
  white-space: nowrap;
}

.ve-insert__menu-item:hover {
  background: #f2f0ec;
}

.ve-canvas-block {
  position: relative;
  cursor: pointer;
  outline: 2px solid transparent;
  outline-offset: -2px;
}

.ve-canvas-block:hover {
  outline-color: #c9a15a88;
}

.ve-canvas-block--selected {
  outline-color: #c9a15a;
}

.ve-canvas-block__toolbar {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1d1b19;
  color: #fff;
  border-radius: 5px;
  padding: 3px 8px;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.1s;
  pointer-events: none;
}

.ve-canvas-block:hover .ve-canvas-block__toolbar,
.ve-canvas-block--selected .ve-canvas-block__toolbar {
  opacity: 1;
  pointer-events: auto;
}

.ve-drag-handle {
  cursor: grab;
  background: none;
  border: none;
  color: inherit;
  font-size: 14px;
  padding: 0 2px;
}

.ve-canvas-block__label {
  white-space: nowrap;
}

.ve-canvas-block__preview {
  pointer-events: none;
}

.ve-empty-canvas {
  padding: 80px 24px;
  text-align: center;
  color: #8a8378;
}

.ve-palette {
  padding: 16px 24px 40px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  background: #ece8e0;
  border-top: 1px dashed #d8d3c8;
}

.ve-palette__item {
  border: 1px solid #d8d3c8;
  background: #fff;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
}

.ve-palette__item:hover {
  border-color: #c9a15a;
}

.ve-panel {
  width: 340px;
  flex-shrink: 0;
  background: #fff;
  border-left: 1px solid #e2ded4;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ve-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e2ded4;
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
  border-top: 1px solid #e2ded4;
  display: flex;
  gap: 8px;
}

.ve-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  font-weight: 600;
  color: #4a463d;
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
  border: 1px solid #d8d3c8;
  border-radius: 5px;
  font-family: inherit;
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
  border: 1px solid #e2ded4;
}

.ve-media-field__empty {
  width: 56px;
  height: 56px;
  border-radius: 5px;
  border: 1px dashed #d8d3c8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #a39d90;
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
  border: 1px solid #e2ded4;
}

.ve-media-multi__item button {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: #b3453a;
  color: #fff;
  font-size: 10px;
  cursor: pointer;
}

.ve-media-multi__add {
  width: 56px;
  height: 56px;
  border-radius: 5px;
  border: 1px dashed #d8d3c8;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: #8a8378;
}

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
  background: #fff;
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
  border-bottom: 1px solid #e2ded4;
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
  border: 1px solid #e2ded4;
  border-radius: 5px;
  overflow: hidden;
  padding: 0;
  cursor: pointer;
  background: #f7f5f1;
}

.ve-media-grid__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ve-media-grid__item:hover {
  border-color: #c9a15a;
}

.ve-dynamic-placeholder {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 40px 24px;
  background: repeating-linear-gradient(45deg, #f7f5f1, #f7f5f1 10px, #f0ede6 10px, #f0ede6 20px);
  border-top: 1px dashed #d8d3c8;
  border-bottom: 1px dashed #d8d3c8;
}

.ve-dynamic-placeholder__icon {
  font-size: 28px;
}

.ve-dynamic-placeholder p {
  margin: 2px 0 0;
  font-size: 12px;
  color: #8a8378;
}

.ve-unknown-block {
  padding: 20px;
  color: #b3453a;
}

.ve-error {
  color: #b3453a;
}

.ve-loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  font-size: 14px;
  color: #8a8378;
}

/* ---------------------------------------------------------------------------
   Nested canvas: nodes, sections, columns, insertion points
   --------------------------------------------------------------------------- */

.ve-canvas-wrap {
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
  outline-color: #c9a15a66;
}

.ve-node--selected {
  outline: 2px solid #c9a15a;
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
  background: #1d1b19;
  color: #fff;
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
  background: #b3453a;
}

/* Block previews shouldn't swallow clicks meant for selection, but a nested
   section's own children must stay clickable. */
.ve-node__preview {
  pointer-events: none;
}

.ve-node--depth-1 {
  outline-style: dashed;
}

/* Sections and columns on the canvas */
.ve-section {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 12px;
  padding: 22px 10px 10px;
}

.ve-column {
  position: relative;
  min-width: 0;
  min-height: 70px;
  border: 1px dashed #d8d3c8;
  border-radius: 4px;
  padding: 18px 6px 6px;
}

.ve-column--12 { grid-column: span 12; }
.ve-column--9 { grid-column: span 9; }
.ve-column--8 { grid-column: span 8; }
.ve-column--6 { grid-column: span 6; }
.ve-column--4 { grid-column: span 4; }
.ve-column--3 { grid-column: span 3; }

.ve-column__tag {
  position: absolute;
  top: 3px;
  left: 6px;
  font-size: 10px;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #a39d90;
  pointer-events: none;
}

.ve-section-empty {
  padding: 30px 20px;
  text-align: center;
  font-size: 13px;
  color: #8a8378;
}

.ve-insert--always .ve-insert__btn {
  opacity: 1;
}

/* Element library */
.ve-library {
  width: min(780px, 94vw);
}

.ve-library__controls {
  padding: 12px 18px;
  border-bottom: 1px solid #e2ded4;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ve-library__search {
  width: 100%;
  font-size: 14px;
  padding: 9px 12px;
  border: 1px solid #d8d3c8;
  border-radius: 6px;
  font-family: inherit;
}

.ve-library__tabs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.ve-library__tab {
  border: 1px solid #d8d3c8;
  background: #fff;
  padding: 5px 12px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
}

.ve-library__tab--active {
  background: #1d1b19;
  border-color: #1d1b19;
  color: #fff;
}

.ve-library__group {
  margin-bottom: 22px;
}

.ve-library__group-title {
  margin: 0 0 10px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #8a8378;
}

.ve-library__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 10px;
}

.ve-library__card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
  text-align: left;
  border: 1px solid #e2ded4;
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  cursor: pointer;
}

.ve-library__card:hover {
  border-color: #c9a15a;
  background: #fdfbf7;
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
  color: #8a8378;
  line-height: 1.35;
}

.ve-library__empty {
  color: #8a8378;
  font-size: 13px;
}

/* Panel tabs */
.ve-panel__tabs {
  display: flex;
  border-bottom: 1px solid #e2ded4;
}

.ve-panel__tab {
  flex: 1;
  border: none;
  background: none;
  padding: 10px 8px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #8a8378;
  border-bottom: 2px solid transparent;
}

.ve-panel__tab--active {
  color: #1d1b19;
  border-bottom-color: #c9a15a;
}

.ve-panel__empty,
.ve-panel__hint {
  font-size: 12px;
  color: #8a8378;
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
  border-bottom: 1px solid #eceae4;
}

.ve-acc__head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: none;
  border: none;
  padding: 10px 2px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  color: #4a463d;
}

.ve-acc__chev {
  color: #a39d90;
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
  color: #4a463d;
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
  color: #a39d90;
}

.ve-row input[type='text'],
.ve-row input[type='number'],
.ve-row select {
  font-weight: 400;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid #d8d3c8;
  border-radius: 5px;
  font-family: inherit;
  width: 100%;
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
  border: 1px solid #d8d3c8;
  border-radius: 5px;
  background: none;
  cursor: pointer;
}

.ve-color__clear {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 11px;
  color: #a39d90;
  padding: 2px 4px;
}

.ve-divider-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-bottom: 10px;
  margin-bottom: 4px;
  border-bottom: 1px dashed #eceae4;
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
  color: #a39d90;
}

.ve-col-row select {
  flex: 1;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px solid #d8d3c8;
  border-radius: 5px;
  font-family: inherit;
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
  color: #a39d90;
}

.ve-tagpicker {
  position: relative;
}

.ve-tagpicker__btn {
  border: 1px solid #d8d3c8;
  background: #fff;
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10px;
  font-family: monospace;
  cursor: pointer;
  color: #8a8378;
}

.ve-tagpicker__btn:hover {
  border-color: #c9a15a;
  color: #1d1b19;
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
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.08), 0 12px 30px rgba(0, 0, 0, 0.14);
  padding: 8px;
}

.ve-tagpicker__hint {
  margin: 0 0 8px;
  font-size: 10px;
  font-weight: 400;
  color: #8a8378;
  line-height: 1.4;
}

.ve-tagpicker__group h5 {
  margin: 8px 0 4px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #a39d90;
}

.ve-tagpicker__item {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 5px 6px;
  border-radius: 4px;
  cursor: pointer;
}

.ve-tagpicker__item:hover {
  background: #f2f0ec;
}

.ve-tagpicker__item code {
  font-size: 11px;
  color: #1d1b19;
}

.ve-tagpicker__item span {
  font-size: 10px;
  font-weight: 400;
  color: #8a8378;
}

/* Loop preview */
.ve-loop-preview {
  padding: 26px 24px;
  background: repeating-linear-gradient(45deg, #f7f5f1, #f7f5f1 10px, #f0ede6 10px, #f0ede6 20px);
  border-top: 1px dashed #d8d3c8;
  border-bottom: 1px dashed #d8d3c8;
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
  color: #8a8378;
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
  border: 1px solid #e2ded4;
}
`
