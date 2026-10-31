'use client'

import React, { useState } from 'react'

import { NewTemplate, templateButtonClass } from '@/features/siteTemplates/admin/NewTemplate'
import { TemplateImport } from '@/features/siteTemplates/admin/TemplateImport'
import { KIND_LABELS, type SiteTemplateKind } from '@/features/siteTemplates/kinds'

export type SuggestionWarning = {
  code: 'missing' | 'partial' | 'overlap'
  kind: SiteTemplateKind
  message: string
}

const panel = 'rounded-[6px] border border-[var(--theme-elevation-150,#cac7d1)] p-[12px]'

/**
 * "Suggested missing" under the hub table. Missing kinds get a Create button that opens the
 * New template flow (starter or Blank) with the type preselected. Partial and overlap notes are
 * listed as text only: they need a judgement about which template to change.
 */
export const SuggestedTemplates: React.FC<{ warnings: SuggestionWarning[]; showCoverageOk: boolean }> = ({ warnings, showCoverageOk }) => {
  const [creating, setCreating] = useState<SiteTemplateKind | null>(null)
  const missing = warnings.filter((w) => w.code === 'missing')
  const notes = warnings.filter((w) => w.code !== 'missing')

  return (
    <section aria-label="Suggested missing" className={panel} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <strong>Suggested missing</strong>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <button type="button" className={templateButtonClass} onClick={() => setCreating(creating ?? 'header')}>
            New site template
          </button>
          <TemplateImport />
        </div>
      </div>

      {creating ? <NewTemplate key={creating} initialKind={creating} onClose={() => setCreating(null)} /> : null}

      {missing.length === 0 && notes.length === 0 && showCoverageOk ? (
        <p style={{ margin: 0, fontSize: 13 }}>Every site template type has a template in use, and none overlap.</p>
      ) : null}

      {missing.length > 0 ? (
        <ul aria-label="Missing site templates" style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          {missing.map((w) => (
            <li key={w.kind} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <span>{w.message}</span>
              <button type="button" className={templateButtonClass} onClick={() => setCreating(w.kind)} aria-label={`Create ${KIND_LABELS[w.kind]} template`}>
                Create
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {notes.length > 0 ? (
        <ul aria-label="Other coverage notes" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
          {notes.map((w, i) => (
            <li key={`${w.code}-${w.kind}-${i}`}>{w.message}</li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export default SuggestedTemplates
