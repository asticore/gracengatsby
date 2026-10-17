/** Import / Export modal styles. Inlined as a <style> tag from VisualEditor.tsx, next to VISUAL_EDITOR_CSS. Colors are --ve-* tokens. */
export const IMPORT_EXPORT_CSS = `
.ve-ie {
  width: min(560px, 92vw);
}
.ve-ie__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.ve-ie__tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.ve-ie__tab--active {
  border-color: var(--ve-accent);
  color: var(--ve-accent);
}
.ve-ie__panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ve-ie__hint,
.ve-ie__note {
  margin: 0;
  font-size: 13px;
  color: var(--ve-text-muted);
}
.ve-ie__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}
.ve-ie__textarea {
  min-height: 120px;
  max-height: 220px;
  width: 100%;
  box-sizing: border-box;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 8px;
  border: 1px solid var(--ve-border-strong);
  border-radius: 6px;
  background: var(--ve-surface);
  color: var(--ve-text);
}
.ve-ie__summary {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 4px 14px;
  margin: 0;
  font-size: 13px;
}
.ve-ie__summary dt {
  color: var(--ve-text-muted);
}
.ve-ie__summary dd {
  margin: 0;
}
.ve-ie__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.ve-ie__warn {
  border: 1px solid var(--ve-danger);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
}
.ve-ie__warn ul {
  margin: 6px 0 0;
  padding-left: 18px;
}
.ve-ie__modes {
  border: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  font-size: 13px;
}
.ve-ie__modes legend {
  padding: 0;
  margin-bottom: 6px;
  color: var(--ve-text-muted);
}
.ve-ie__confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}
`
