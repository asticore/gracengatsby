/**
 * The SEO audit: one row per published page, post, product or event with its
 * SEO and readability scores, the problems found and the noindex flag. Pure:
 * no I/O. The loader that reads the documents is in ./auditLoader.ts.
 */

import { analyze } from './analysis/analyze'
import { extractForAnalysis } from './analysis/extract'
import type { AnalysisInput, Status } from './analysis/types'

export const AUDIT_COLLECTIONS = ['pages', 'posts', 'products', 'events'] as const
export type AuditCollection = (typeof AUDIT_COLLECTIONS)[number]

export type AuditRow = {
  collection: AuditCollection
  id: number | string
  title: string
  slug: string
  editHref: string
  seoScore: Status
  readabilityScore: Status
  hasKeyphrase: boolean
  hasMetaDescription: boolean
  /** Messages of every check that scored 'bad', SEO first, then readability. */
  problems: string[]
  noIndex: boolean
}

export type AuditSummary = {
  total: number
  good: number
  ok: number
  bad: number
  missingKeyphrase: number
  missingMetaDescription: number
  noIndex: number
}

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Builds one audit row from a document as the database returns it (nested `seo` group). Pure. */
export function buildAuditRow(doc: Record<string, unknown>, collection: AuditCollection): AuditRow {
  const seo: Record<string, unknown> = doc.seo && typeof doc.seo === 'object' ? (doc.seo as Record<string, unknown>) : {}
  const title = asText(doc.title) || asText(doc.name)
  const slug = asText(doc.slug)
  const metaDescription = asText(seo.metaDescription)
  const keyphrase = asText(seo.focusKeyphrase)
  const body = extractForAnalysis(doc)
  const input: AnalysisInput = {
    title,
    slug,
    metaTitle: asText(seo.metaTitle) || title,
    metaDescription,
    keyphrase,
    text: body.text,
    headings: body.headings,
    links: body.links,
    images: body.images,
  }
  const result = analyze(input)
  const problems = [...result.seo, ...result.readability].filter((check) => check.status === 'bad').map((check) => check.message)

  return {
    collection,
    id: doc.id as number | string,
    title,
    slug,
    editHref: `/admin/collections/${collection}/${String(doc.id)}`,
    seoScore: result.seoScore,
    readabilityScore: result.readabilityScore,
    hasKeyphrase: keyphrase.trim().length > 0,
    hasMetaDescription: metaDescription.trim().length > 0,
    problems,
    noIndex: seo.noIndex === true,
  }
}

/** Counts for the summary cards at the top of the audit. Pure. */
export function summariseAuditRows(rows: AuditRow[]): AuditSummary {
  const summary: AuditSummary = { total: rows.length, good: 0, ok: 0, bad: 0, missingKeyphrase: 0, missingMetaDescription: 0, noIndex: 0 }
  for (const row of rows) {
    if (row.seoScore === 'good') summary.good += 1
    else if (row.seoScore === 'ok') summary.ok += 1
    else if (row.seoScore === 'bad') summary.bad += 1
    if (!row.hasKeyphrase) summary.missingKeyphrase += 1
    if (!row.hasMetaDescription) summary.missingMetaDescription += 1
    if (row.noIndex) summary.noIndex += 1
  }
  return summary
}
