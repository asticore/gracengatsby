import React from 'react'

/**
 * The rules the account screens need on top of the site stylesheet.
 *
 * Kept inside the feature rather than appended to the global stylesheet, so
 * switching accounts off leaves no trace in the CSS the rest of the site
 * downloads. Buttons, shells and cards reuse the site's existing classes,
 * which is why this stays short.
 */
export const AccountStyles: React.FC = () => (
  <style>{`
    .account { display: grid; gap: 2rem; grid-template-columns: minmax(0, 14rem) minmax(0, 1fr); align-items: start; }
    @media (max-width: 720px) { .account { grid-template-columns: 1fr; } }
    .account-nav { list-style: none; margin: 0; padding: 0; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; overflow: hidden; }
    .account-nav li + li { border-top: 1px solid rgba(0,0,0,.1); }
    .account-nav a { display: block; padding: .7rem 1rem; text-decoration: none; color: inherit; }
    .account-nav a[aria-current='page'] { font-weight: 600; background: rgba(0,0,0,.04); }
    .account-panel { min-width: 0; }
    .account-form { display: grid; gap: .9rem; max-width: 30rem; }
    .account-form label { display: grid; gap: .3rem; font-size: .9rem; }
    .account-form input, .account-form select { padding: .55rem .7rem; border: 1px solid rgba(0,0,0,.25); border-radius: 6px; font: inherit; }
    .account-form .account-form__row { display: grid; gap: .9rem; grid-template-columns: 1fr 1fr; }
    @media (max-width: 520px) { .account-form .account-form__row { grid-template-columns: 1fr; } }
    .account-note { font-size: .9rem; margin: .25rem 0 0; }
    .account-note--error { color: #b3261e; }
    .account-note--success { color: #2e7d32; }
    .account-card { border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: 1rem 1.25rem; margin: 0 0 1rem; }
    .account-card h3 { margin: 0 0 .35rem; font-size: 1rem; }
    .account-card p { margin: 0 0 .25rem; }
    .account-card__actions { display: flex; flex-wrap: wrap; gap: .5rem; margin-top: .75rem; }
    .account-card__actions button, .account-card__actions a { font-size: .85rem; }
    .account-badge { font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; border: 1px solid currentColor; border-radius: 999px; padding: .1rem .5rem; opacity: .8; }
    .account-table { width: 100%; border-collapse: collapse; }
    .account-table th, .account-table td { text-align: left; padding: .6rem .5rem; border-bottom: 1px solid rgba(0,0,0,.1); font-size: .92rem; }
    .account-empty { opacity: .7; }
    .account-section { margin: 0 0 2.5rem; }
    .account-section h2 { margin: 0 0 .75rem; font-size: 1.15rem; }
    .account-link-row { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; font-size: .9rem; }
  `}</style>
)
