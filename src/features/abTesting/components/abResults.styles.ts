/** Inlined as a <style> tag from ABResultsView.tsx.
 * A .css import would work fine under Next's build, but payload's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 */
export const AB_RESULTS_CSS = `
.eg-ab {
  padding: var(--base, 1rem) 0;
}

.eg-ab__title {
  margin: 0 0 0.25rem;
}

.eg-ab__subtitle {
  margin: 0 0 1.5rem;
  color: var(--theme-elevation-600);
  max-width: 44rem;
}

.eg-ab__empty {
  color: var(--theme-elevation-600);
}

.eg-ab__test {
  border: 1px solid var(--theme-elevation-150);
  border-radius: 4px;
  padding: 1rem 1.25rem 1.25rem;
  margin-bottom: 1.5rem;
}

.eg-ab__test-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.75rem;
  margin-bottom: 0.25rem;
}

.eg-ab__test-name {
  margin: 0;
  font-size: 1.1rem;
}

.eg-ab__meta {
  color: var(--theme-elevation-500);
  font-size: 0.8rem;
}

.eg-ab__status {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--theme-elevation-200);
  border-radius: 2px;
  padding: 0.1rem 0.4rem;
}

.eg-ab__goal {
  margin-top: 1.25rem;
}

.eg-ab__goal-name {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
}

.eg-ab__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.eg-ab__table th,
.eg-ab__table td {
  text-align: right;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--theme-elevation-100);
}

.eg-ab__table th:first-child,
.eg-ab__table td:first-child {
  text-align: left;
}

.eg-ab__table th {
  color: var(--theme-elevation-600);
  font-weight: 500;
}

.eg-ab__control {
  color: var(--theme-elevation-500);
  font-size: 0.75rem;
  margin-left: 0.35rem;
}

.eg-ab__dim {
  color: var(--theme-elevation-400);
}

/* The verdict line carries the honesty. It is styled to be read, not skipped. */
.eg-ab__verdict {
  margin: 0.6rem 0 0;
  padding: 0.55rem 0.7rem;
  border-left: 3px solid var(--theme-elevation-200);
  background: var(--theme-elevation-50);
  font-size: 0.82rem;
  line-height: 1.45;
}

.eg-ab__verdict--too-few,
.eg-ab__verdict--no-data {
  border-left-color: var(--theme-warning-500, #b58900);
}

.eg-ab__verdict--significant {
  border-left-color: var(--theme-success-500, #2e7d32);
}
`
