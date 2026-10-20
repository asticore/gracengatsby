/** Build with AI styles: the Elements-tab button, the dialog around the panel, and the panel itself. Inlined as a <style> tag from VisualEditor.tsx, next to VISUAL_EDITOR_CSS. Colors are --ve-* tokens. */
export const AI_BUILDER_CSS = `
.ve-ai {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px;
  box-sizing: border-box;
  font-size: 13px;
  color: var(--ve-text);
}
.ve-ai__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.ve-ai__hint,
.ve-ai__note {
  margin: 0;
  font-size: 12px;
  color: var(--ve-text-muted);
}
.ve-ai__fieldset {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ve-ai__fieldset:disabled {
  opacity: 0.7;
}
.ve-ai__label,
.ve-ai__legend {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-weight: 600;
  font-size: 13px;
  padding: 0;
  margin: 0;
}
.ve-ai__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ve-ai__select,
.ve-ai__input,
.ve-ai__textarea {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 13px;
  font-weight: 400;
  padding: 7px 8px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  background: var(--ve-surface);
  color: var(--ve-text);
}
.ve-ai__textarea {
  min-height: 84px;
  resize: vertical;
}
.ve-ai__counter {
  font-size: 11px;
  font-weight: 400;
  color: var(--ve-text-muted);
  white-space: nowrap;
}
.ve-ai__segments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  border: 0;
  margin: 0;
  padding: 0;
}
.ve-ai__segment {
  flex: 1 1 auto;
  position: relative;
}
.ve-ai__segment input {
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  margin: 0;
}
.ve-ai__segment span {
  display: block;
  text-align: center;
  padding: 7px 8px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  background: var(--ve-surface);
  color: var(--ve-text);
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
}
.ve-ai__segment input:checked + span {
  border-color: var(--ve-accent);
  color: var(--ve-accent);
  box-shadow: inset 0 0 0 1px var(--ve-accent);
}
.ve-ai__segment input:focus-visible + span {
  outline: 2px solid var(--ve-accent);
  outline-offset: 2px;
}
.ve-ai__segment input:disabled + span {
  opacity: 0.5;
  cursor: not-allowed;
}
.ve-ai__tip-wrap {
  position: relative;
  display: inline-flex;
}
.ve-ai__info {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--ve-border-strong);
  background: var(--ve-surface);
  color: var(--ve-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.ve-ai__info:focus-visible {
  outline: 2px solid var(--ve-accent);
  outline-offset: 2px;
}
.ve-ai__tip {
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ve-border-strong);
  background: var(--ve-surface);
  box-shadow: var(--ve-shadow-pop);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--ve-text);
}
.ve-ai__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ve-ai__chip {
  border: 1px solid var(--ve-border-strong);
  border-radius: 999px;
  background: var(--ve-surface-alt);
  color: var(--ve-text);
  font: inherit;
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
  text-align: left;
}
.ve-ai__chip:focus-visible,
.ve-ai__link:focus-visible,
.ve-ai__btn:focus-visible,
.ve-ai__input:focus-visible,
.ve-ai__textarea:focus-visible,
.ve-ai__select:focus-visible {
  outline: 2px solid var(--ve-accent);
  outline-offset: 2px;
}
.ve-ai__examples {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ve-ai__example {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border: 1px solid var(--ve-border);
  border-radius: 8px;
  background: var(--ve-surface-alt);
}
.ve-ai__btn {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 12px;
  border-radius: 6px;
  border: 1px solid var(--ve-border-strong);
  background: var(--ve-surface);
  color: var(--ve-text);
  cursor: pointer;
  text-align: center;
}
.ve-ai__btn--primary {
  background: var(--ve-accent);
  border-color: var(--ve-accent);
  color: var(--ve-accent-contrast);
}
.ve-ai__btn--small {
  padding: 3px 8px;
  font-size: 12px;
  font-weight: 500;
}
.ve-ai__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ve-ai__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.ve-ai__link {
  background: none;
  border: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  color: var(--ve-accent);
  text-decoration: underline;
  cursor: pointer;
}
.ve-ai__link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ve-ai__steps {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  margin: 0;
  padding: 0;
  font-size: 11px;
  color: var(--ve-text-muted);
}
.ve-ai__step--current {
  color: var(--ve-accent);
  font-weight: 700;
}
.ve-ai__status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--ve-text-muted);
}
.ve-ai__spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--ve-border-strong);
  border-top-color: var(--ve-accent);
  animation: ve-ai-spin 0.8s linear infinite;
  flex-shrink: 0;
}
@keyframes ve-ai-spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .ve-ai__spinner {
    animation-duration: 3s;
  }
}
.ve-ai__empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px dashed var(--ve-border-strong);
  border-radius: 8px;
  background: var(--ve-surface-alt);
}
.ve-ai__empty p {
  margin: 0;
}
.ve-ai__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.ve-ai__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--ve-border);
  border-radius: 8px;
  background: var(--ve-surface);
}
.ve-ai__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ve-text-muted);
}
.ve-ai__warnings {
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
}
.ve-ai__warnings ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.ve-ai__error {
  margin: 0;
  font-size: 12px;
  color: var(--ve-danger);
}
.ve-ai__success {
  margin: 0;
  font-size: 13px;
  color: var(--ve-text);
  font-weight: 600;
}
.ve-ai__group {
  border: 0;
  margin: 0;
  padding: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ve-dock__ai {
  padding: 12px 12px 0;
  box-sizing: border-box;
}
.ve-dock__ai-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  background: var(--ve-surface-alt);
  color: var(--ve-text);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.ve-dock__ai-btn:hover {
  border-color: var(--ve-accent);
}
.ve-dock__ai-btn:focus-visible {
  outline: 2px solid var(--ve-accent);
  outline-offset: 2px;
}
.ve-dock__ai-glyph {
  color: var(--ve-accent);
  line-height: 1;
}
.ve-ai__save {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.ve-ai__saved {
  list-style: none;
  margin: 6px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ve-ai__saved-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}
.ve-ai__refine,
.ve-ai__media {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.ve-ai__media ul {
  margin: 0;
  padding-left: 18px;
}
.ve-ai-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  box-sizing: border-box;
  background: rgba(0, 0, 0, 0.5);
}
.ve-ai-modal[hidden] {
  display: none;
}
.ve-ai-modal__dialog {
  width: min(640px, 90vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  background: var(--ve-surface);
  color: var(--ve-text);
  border-radius: 8px;
  overflow: hidden;
  outline: none;
}
.ve-ai-modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  padding: 14px 18px;
  border-bottom: 1px solid var(--ve-border);
}
.ve-ai-modal__title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.ve-ai-modal__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
`