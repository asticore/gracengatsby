/** Inlined as a <style> tag from Dashboard.tsx.
 * A .css import works fine under Next's build, but payload's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 */
export const DASHBOARD_CSS = `
@layer payload {
  .eg-dashboard {
    display: flex;
    flex-direction: column;
    gap: calc(var(--base) * 1.75);
    padding: calc(var(--base) * 1.5) var(--gutter-h) calc(var(--base) * 3);
    max-width: 1600px;
  }

  /* Header ---------------------------------------------------------------- */

  .eg-dashboard__header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--base);
    padding-bottom: calc(var(--base) * 0.75);
    border-bottom: 1px solid var(--theme-elevation-150);
  }

  .eg-dashboard__greeting {
    margin: 0;
    font-size: calc(var(--base) * 1.5);
    line-height: 1.2;
    font-weight: 600;
  }

  .eg-dashboard__subtitle {
    margin: calc(var(--base) * 0.25) 0 0;
    color: var(--theme-elevation-600);
    font-size: calc(var(--base) * 0.8);
  }

  .eg-dashboard__view-site {
    color: var(--theme-elevation-700);
    font-size: calc(var(--base) * 0.8);
    text-decoration: none;
    padding: calc(var(--base) * 0.4) calc(var(--base) * 0.8);
    border: 1px solid var(--theme-elevation-200);
    border-radius: 4px;
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .eg-dashboard__view-site:hover {
    border-color: var(--ac-gold);
    color: var(--ac-gold);
  }

  /* Sections -------------------------------------------------------------- */

  .eg-dashboard__section-title {
    margin: 0 0 calc(var(--base) * 0.6);
    font-size: calc(var(--base) * 0.7);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-elevation-500);
  }

  /* Quick create ---------------------------------------------------------- */

  .eg-dashboard__quick-actions {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--base) * 0.5);
  }

  .eg-dashboard__quick-action {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--base) * 0.35);
    padding: calc(var(--base) * 0.5) calc(var(--base) * 0.9);
    border: 1px solid var(--ac-gold);
    border-radius: 4px;
    color: var(--ac-gold);
    font-size: calc(var(--base) * 0.82);
    font-weight: 500;
    text-decoration: none;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .eg-dashboard__quick-action:hover {
    background-color: var(--ac-gold);
    color: var(--theme-elevation-0);
  }

  .eg-dashboard__plus {
    width: calc(var(--base) * 0.85);
    height: calc(var(--base) * 0.85);
    flex-shrink: 0;
  }

  /* At a glance ----------------------------------------------------------- */

  .eg-dashboard__stats {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: calc(var(--base) * 0.5);
  }

  .eg-dashboard__stat {
    display: flex;
    flex-direction: column;
    gap: calc(var(--base) * 0.15);
    padding: calc(var(--base) * 0.75) calc(var(--base) * 0.9);
    background-color: var(--ac-surface);
    border: 1px solid var(--theme-elevation-150);
    border-radius: 4px;
    text-decoration: none;
    transition: border-color 0.15s ease;
  }

  .eg-dashboard__stat:hover {
    border-color: var(--ac-gold);
  }

  .eg-dashboard__stat-count {
    font-size: calc(var(--base) * 1.4);
    font-weight: 600;
    line-height: 1.1;
    color: var(--theme-elevation-900);
  }

  .eg-dashboard__stat-label {
    font-size: calc(var(--base) * 0.72);
    color: var(--theme-elevation-600);
  }

  /* Recently edited ------------------------------------------------------- */

  .eg-dashboard__table-wrap {
    /* Narrow viewports scroll the table itself rather than the page. */
    overflow-x: auto;
    border: 1px solid var(--theme-elevation-150);
    border-radius: 4px;
    background-color: var(--ac-surface);
  }

  .eg-dashboard__table {
    width: 100%;
    border-collapse: collapse;
    font-size: calc(var(--base) * 0.8);
  }

  .eg-dashboard__table th {
    text-align: left;
    font-weight: 600;
    font-size: calc(var(--base) * 0.68);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-elevation-500);
    padding: calc(var(--base) * 0.55) calc(var(--base) * 0.8);
    border-bottom: 1px solid var(--theme-elevation-150);
    white-space: nowrap;
  }

  .eg-dashboard__table td {
    padding: calc(var(--base) * 0.55) calc(var(--base) * 0.8);
    border-bottom: 1px solid var(--theme-elevation-100);
    vertical-align: middle;
  }

  .eg-dashboard__table tbody tr:last-child td {
    border-bottom: none;
  }

  .eg-dashboard__table tbody tr:hover {
    background-color: var(--ac-ground);
  }

  .eg-dashboard__row-link {
    color: var(--theme-elevation-900);
    text-decoration: none;
    font-weight: 500;
  }

  .eg-dashboard__row-link:hover {
    color: var(--ac-gold);
  }

  .eg-dashboard__muted {
    color: var(--theme-elevation-600);
    white-space: nowrap;
  }

  .eg-dashboard__status {
    display: inline-block;
    padding: calc(var(--base) * 0.15) calc(var(--base) * 0.45);
    border-radius: 3px;
    font-size: calc(var(--base) * 0.68);
    font-weight: 500;
    white-space: nowrap;
  }

  .eg-dashboard__status--published {
    color: var(--ac-gold);
    background-color: color-mix(in srgb, var(--ac-gold) 14%, transparent);
  }

  .eg-dashboard__status--draft {
    color: var(--theme-elevation-600);
    background-color: var(--theme-elevation-100);
  }

  .eg-dashboard__empty {
    margin: 0;
    padding: calc(var(--base) * 1.25);
    border: 1px dashed var(--theme-elevation-200);
    border-radius: 4px;
    color: var(--theme-elevation-600);
    font-size: calc(var(--base) * 0.82);
  }

  /* Grouped index --------------------------------------------------------- */

  .eg-dashboard__index {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
    gap: calc(var(--base) * 0.3);
  }

  .eg-dashboard__index-item {
    display: flex;
    align-items: stretch;
    border: 1px solid var(--theme-elevation-150);
    border-radius: 4px;
    background-color: var(--ac-surface);
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .eg-dashboard__index-item:hover {
    border-color: var(--theme-elevation-300);
  }

  .eg-dashboard__index-link {
    flex: 1;
    padding: calc(var(--base) * 0.5) calc(var(--base) * 0.75);
    color: var(--theme-elevation-800);
    font-size: calc(var(--base) * 0.8);
    text-decoration: none;
  }

  .eg-dashboard__index-link:hover {
    color: var(--ac-gold);
  }

  .eg-dashboard__index-add {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--base) * 2);
    color: var(--theme-elevation-500);
    border-left: 1px solid var(--theme-elevation-150);
    text-decoration: none;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  .eg-dashboard__index-add:hover {
    background-color: var(--ac-gold);
    color: var(--theme-elevation-0);
  }

  @media (max-width: 768px) {
    .eg-dashboard__greeting {
      font-size: calc(var(--base) * 1.25);
    }

    .eg-dashboard__stats {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    }
  }
}
`
