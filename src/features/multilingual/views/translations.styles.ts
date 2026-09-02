/** Inlined as a <style> tag from TranslationsView.tsx.
 * A .css import works fine under Next's build, but payload's
 * generate:importmap / generate:types CLI steps import admin components
 * directly under plain Node/tsx, which has no loader for .css files and
 * crashes with ERR_UNKNOWN_FILE_EXTENSION. A plain JS string sidesteps
 * that entirely while keeping the same scoped styles.
 */
export const TRANSLATIONS_CSS = `
@layer payload {
  .eg-translations {
    display: flex;
    flex-direction: column;
    gap: calc(var(--base) * 1.25);
    padding: calc(var(--base) * 1.5) var(--gutter-h) calc(var(--base) * 3);
  }

  .eg-translations__head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--base);
    align-items: flex-start;
    justify-content: space-between;
  }

  .eg-translations__sub {
    margin: calc(var(--base) * 0.25) 0 0;
    color: var(--theme-elevation-600);
  }

  .eg-translations__actions {
    display: flex;
    align-items: center;
    gap: var(--base);
  }

  .eg-translations__toggle {
    display: inline-flex;
    align-items: center;
    gap: calc(var(--base) * 0.4);
    white-space: nowrap;
  }

  .eg-translations__save {
    padding: calc(var(--base) * 0.5) var(--base);
    border: 1px solid var(--theme-elevation-150);
    border-radius: var(--style-radius-s);
    background: var(--theme-success-500);
    color: var(--theme-base-0);
    cursor: pointer;
  }

  .eg-translations__save:disabled {
    background: var(--theme-elevation-100);
    color: var(--theme-elevation-500);
    cursor: default;
  }

  .eg-translations__message {
    margin: 0;
    padding: calc(var(--base) * 0.5) var(--base);
    border-radius: var(--style-radius-s);
    background: var(--theme-elevation-50);
  }

  .eg-translations__message--error {
    background: color-mix(in srgb, var(--theme-error-500) 12%, transparent);
    color: var(--theme-error-600);
  }

  .eg-translations__progress {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: var(--base);
  }

  .eg-translations__meter {
    display: flex;
    flex-direction: column;
    gap: calc(var(--base) * 0.25);
    padding: calc(var(--base) * 0.6);
    border: 1px solid var(--theme-elevation-100);
    border-radius: var(--style-radius-m);
  }

  .eg-translations__meter-label {
    display: flex;
    justify-content: space-between;
    font-weight: 600;
  }

  .eg-translations__meter-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-elevation-100);
    overflow: hidden;
  }

  .eg-translations__meter-fill {
    height: 100%;
    background: var(--theme-success-500);
  }

  .eg-translations__meter-count {
    color: var(--theme-elevation-500);
    font-size: 0.85em;
  }

  .eg-translations__filters {
    display: flex;
    flex-wrap: wrap;
    gap: var(--base);
  }

  .eg-translations__filters label {
    display: flex;
    flex-direction: column;
    gap: calc(var(--base) * 0.25);
  }

  .eg-translations__scroll {
    overflow-x: auto;
    border: 1px solid var(--theme-elevation-100);
    border-radius: var(--style-radius-m);
  }

  .eg-translations__table {
    width: 100%;
    border-collapse: collapse;
  }

  .eg-translations__table th,
  .eg-translations__table td {
    padding: calc(var(--base) * 0.5);
    border-bottom: 1px solid var(--theme-elevation-100);
    text-align: left;
    vertical-align: top;
  }

  .eg-translations__table thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--theme-elevation-50);
  }

  .eg-translations__table thead th small {
    display: block;
    font-weight: 400;
    color: var(--theme-elevation-500);
  }

  .eg-translations__table tbody th,
  .eg-translations__source {
    min-width: 200px;
    max-width: 280px;
  }

  .eg-translations__label {
    display: block;
    font-family: var(--font-mono, monospace);
    font-size: 0.85em;
  }

  .eg-translations__hint,
  .eg-translations__stale {
    display: block;
    color: var(--theme-elevation-500);
    font-weight: 400;
    font-size: 0.8em;
  }

  .eg-translations__source {
    color: var(--theme-elevation-700);
    white-space: pre-wrap;
  }

  .eg-translations__table input[type='text'],
  .eg-translations__table textarea {
    width: 100%;
    min-width: 180px;
    padding: calc(var(--base) * 0.35);
    border: 1px solid var(--theme-elevation-150);
    border-radius: var(--style-radius-s);
    background: var(--theme-input-bg, var(--theme-base-0));
    color: inherit;
    font: inherit;
  }

  /* Amber edge rather than a badge: it has to be noticeable while scanning a
     wide table and must not steal the space the translation needs. */
  .eg-translations__table td.is-stale input[type='text'],
  .eg-translations__table td.is-stale textarea {
    border-left: 3px solid var(--theme-warning-500);
  }

  .eg-translations__empty {
    padding: calc(var(--base) * 2);
    border: 1px dashed var(--theme-elevation-150);
    border-radius: var(--style-radius-m);
    color: var(--theme-elevation-600);
    text-align: center;
  }

  .eg-translations--notice p {
    max-width: 60ch;
    color: var(--theme-elevation-600);
  }
}
`
