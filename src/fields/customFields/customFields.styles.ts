/** Inlined as a <style> tag from CustomFieldsPanel.tsx.
 * A .css import works fine under Next's build, but payload's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 */
export const CUSTOM_FIELDS_CSS = `
.cf-panel {
  display: flex;
  flex-direction: column;
  gap: 24px;
  margin-bottom: 24px;
}

.cf-group {
  border: 1px solid var(--theme-elevation-150, #e2ded4);
  border-radius: 6px;
  padding: 16px 18px 18px;
  background: var(--theme-elevation-0, #fff);
}

.cf-group__title {
  margin: 0 0 4px;
  font-size: 15px;
}

.cf-group__description {
  margin: 0 0 14px;
  font-size: 12px;
  opacity: 0.7;
}

.cf-group__fields {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.cf-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  flex: 1 1 260px;
  min-width: 0;
}

.cf-field--inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
  flex-basis: 100%;
}

.cf-field__label {
  font-size: 12px;
  font-weight: 600;
}

.cf-field__required {
  color: #b3453a;
}

.cf-field__help {
  margin: 0;
  font-size: 11px;
  opacity: 0.65;
}

.cf-field__control {
  width: 100%;
  font-size: 13px;
  padding: 7px 9px;
  border: 1px solid var(--theme-elevation-150, #d8d3c8);
  border-radius: 5px;
  font-family: inherit;
  background: var(--theme-input-bg, #fff);
  color: inherit;
}

.cf-field__color {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cf-field__color input[type='color'] {
  width: 38px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--theme-elevation-150, #d8d3c8);
  border-radius: 5px;
  background: none;
  cursor: pointer;
}

.cf-field__image {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cf-field__thumb {
  width: 56px;
  height: 56px;
  object-fit: cover;
  border-radius: 5px;
  border: 1px solid var(--theme-elevation-150, #e2ded4);
}

.cf-field__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border-style: dashed;
  font-size: 10px;
  opacity: 0.6;
  text-align: center;
}

.cf-field__image-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cf-btn {
  border: 1px solid var(--theme-elevation-150, #d8d3c8);
  background: transparent;
  color: inherit;
  padding: 5px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12px;
}

.cf-btn:hover {
  border-color: #c9a15a;
}
`
