'use client'

import React, { useMemo } from 'react'
import { useFormFields } from '@/admin/context'
import { analyze } from '@/features/seo/analysis/analyze'
import type { AnalysisResult, Check, Status } from '@/features/seo/analysis/types'
import { buildSeoAnalysisInput, plainFormValues } from './seoAnalysisInput'
import './seo-analysis.css'

const STATUS_ORDER: Record<Status, number> = { bad: 0, ok: 1, info: 2, good: 3 }

const STATUS_LABEL: Record<Status, string> = {
  good: 'Good',
  ok: 'Could be better',
  bad: 'Needs work',
  info: 'For information',
}

/** Runs the SEO and readability checks against the open document, live as it is edited. */
export function useSeoAnalysis(): AnalysisResult {
  const fields = useFormFields(([all]) => all)
  return useMemo(() => analyze(buildSeoAnalysisInput(plainFormValues(fields))), [fields])
}

/** Traffic-light dot for a status. */
export function SeoAnalysisDot({ status }: { status: Status }) {
  return <span className={`seo-analysis-dot seo-analysis-dot--${status}`} role="img" aria-label={STATUS_LABEL[status]} />
}

function CheckList({ checks }: { checks: Check[] }) {
  const sorted = [...checks].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
  return (
    <ul className="seo-analysis__list">
      {sorted.map((check) => (
        <li key={check.id} className="seo-analysis__item">
          <SeoAnalysisDot status={check.status} />
          <span>{check.message}</span>
        </li>
      ))}
    </ul>
  )
}

function AnalysisSection({ title, checks, score }: { title: string; checks: Check[]; score: Status }) {
  return (
    <details className="seo-analysis__section">
      <summary className="seo-analysis__summary">
        <SeoAnalysisDot status={score} />
        <span>{title}</span>
      </summary>
      <CheckList checks={checks} />
    </details>
  )
}

/** The two collapsed check lists shown under the SEO card's Analysis tab. */
export function SeoAnalysisPanel({ result }: { result: AnalysisResult }) {
  return (
    <div className="seo-analysis">
      <AnalysisSection title="SEO analysis" checks={result.seo} score={result.seoScore} />
      <AnalysisSection title="Readability analysis" checks={result.readability} score={result.readabilityScore} />
    </div>
  )
}
