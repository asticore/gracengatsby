import React from 'react'

/**
 * The handful of rules the course screens need that the site stylesheet does
 * not already provide.
 *
 * Kept here rather than appended to the global stylesheet so the whole feature
 * - schema, logic, markup and looks - lives in one folder and leaves no trace
 * when it is switched off. The cards, buttons and page shell reuse the site's
 * existing classes, so this stays small on purpose.
 */
export const CourseStyles: React.FC = () => (
  <style>{`
    .curriculum { list-style: none; margin: 2rem 0 0; padding: 0; border-top: 1px solid rgba(0,0,0,.1); }
    .curriculum__item { border-bottom: 1px solid rgba(0,0,0,.1); }
    .curriculum__link, .curriculum__locked { display: flex; align-items: baseline; gap: .75rem; padding: .85rem .25rem; text-decoration: none; color: inherit; }
    .curriculum__locked { opacity: .55; cursor: default; }
    .curriculum__index { font-variant-numeric: tabular-nums; opacity: .5; min-width: 2ch; }
    .curriculum__title { flex: 1; }
    .curriculum__meta { font-size: .8rem; opacity: .6; }
    .curriculum__tick { color: #2e7d32; }
    .course-progress { margin: 1.5rem 0; }
    .course-progress__track { height: 8px; border-radius: 4px; background: rgba(0,0,0,.1); overflow: hidden; }
    .course-progress__fill { height: 100%; background: currentColor; transition: width .3s ease; }
    .course-progress__label { font-size: .85rem; opacity: .7; margin-top: .5rem; }
    .course-gate { margin: 2rem 0; padding: 1.25rem 1.5rem; border: 1px solid rgba(0,0,0,.15); border-radius: 8px; }
    .course-gate h2 { margin: 0 0 .5rem; font-size: 1.1rem; }
    .course-gate p { margin: 0 0 1rem; }
    .lesson-nav { display: flex; justify-content: space-between; gap: 1rem; margin-top: 3rem; }
    .lesson-complete { margin-top: 2rem; }
    .lesson-complete__error { color: #b3261e; font-size: .85rem; margin-top: .5rem; }
    .lesson-video { margin: 1.5rem 0; }
    .lesson-resources { list-style: none; padding: 0; margin: 2rem 0 0; }
    .lesson-resources li { padding: .4rem 0; }
  `}</style>
)
