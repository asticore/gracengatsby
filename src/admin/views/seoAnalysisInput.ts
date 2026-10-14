import { extractForAnalysis } from '@/features/seo/analysis/extract'
import type { AnalysisInput } from '@/features/seo/analysis/types'

/** One entry per dotted field path, as the form context holds them. */
export type FormValueEntries = Record<string, { value: unknown } | undefined>

const asText = (value: unknown): string => (typeof value === 'string' ? value : '')

/** Flattens the form context's entries into a plain path -> value map. */
export function plainFormValues(entries: FormValueEntries): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [path, entry] of Object.entries(entries)) out[path] = entry?.value
  return out
}

/**
 * Builds the SEO analysis input from plain form values (keys are dotted paths,
 * e.g. `seo.metaTitle`). The meta title falls back to the document title, the
 * same way the page title falls back when no meta title is set.
 */
export function buildSeoAnalysisInput(values: Record<string, unknown>): AnalysisInput {
  const title = asText(values['title']) || asText(values['name'])
  const body = extractForAnalysis(values)
  return {
    title,
    slug: asText(values['slug']),
    metaTitle: asText(values['seo.metaTitle']) || title,
    metaDescription: asText(values['seo.metaDescription']),
    keyphrase: asText(values['seo.focusKeyphrase']),
    text: body.text,
    headings: body.headings,
    links: body.links,
    images: body.images,
  }
}
