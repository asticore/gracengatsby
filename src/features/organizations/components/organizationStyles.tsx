import React from 'react'

/**
 * The few rules the organisation screens need beyond the account styles
 * (AccountStyles, ../../accounts/components/styles.tsx). Its own file, rendered
 * only on organisation screens, so switching organisations off leaves no
 * trace in what other pages download. Buttons, cards and tables reuse the
 * site's existing classes.
 */
export const OrganizationStyles: React.FC = () => (
  <style>{`
    .org-switcher { display: flex; flex-wrap: wrap; gap: .5rem; align-items: end; margin: 0 0 1.25rem; }
    .org-switcher label { display: grid; gap: .25rem; font-size: .9rem; }
    .org-switcher select { padding: .5rem .7rem; border: 1px solid rgba(0,0,0,.25); border-radius: 6px; font: inherit; min-width: 12rem; }
    .org-head { display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; margin: 0 0 1rem; }
    .org-logo { width: 3.5rem; height: 3.5rem; border-radius: 8px; object-fit: cover; border: 1px solid rgba(0,0,0,.12); }
    .org-badge { display: inline-block; padding: .1rem .5rem; border-radius: 999px; background: rgba(0,0,0,.07); font-size: .8rem; }
    .org-section { margin: 2rem 0 0; }
    .org-section h2 { font-size: 1.15rem; margin: 0 0 .75rem; }
    .org-list { list-style: none; margin: 0; padding: 0; display: grid; gap: .75rem; }
    .org-row { display: flex; flex-wrap: wrap; gap: .75rem; align-items: center; justify-content: space-between; border: 1px solid rgba(0,0,0,.12); border-radius: 8px; padding: .75rem 1rem; }
    .org-row__main { min-width: 0; overflow-wrap: anywhere; }
    .org-row__actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
    .org-inline-form { display: inline-flex; flex-wrap: wrap; gap: .4rem; align-items: center; }
    .org-inline-form select, .org-inline-form input { padding: .4rem .55rem; border: 1px solid rgba(0,0,0,.25); border-radius: 6px; font: inherit; }
    .org-muted { color: rgba(0,0,0,.6); font-size: .9rem; }
    .org-perms { display: grid; gap: .25rem; grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr)); border: 0; padding: 0; margin: 0; }
    .org-perms label { display: flex; gap: .4rem; align-items: center; font-size: .9rem; }
    .org-danger { border-top: 1px solid rgba(0,0,0,.12); margin-top: 2rem; padding-top: 1rem; }
    @media (max-width: 520px) { .org-row { align-items: flex-start; } .org-switcher select { min-width: 0; width: 100%; } }
  `}</style>
)
