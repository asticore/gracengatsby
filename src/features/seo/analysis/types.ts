/**
 * Types for the SEO and readability analysis (Yoast style). Shared by the
 * analysis engine and the admin panel. Pure, no I/O.
 */

export type Status = 'good' | 'ok' | 'bad' | 'info'

export interface Check {
  id: string
  label: string
  status: Status
  message: string
}

export interface AnalysisInput {
  title: string
  slug: string
  metaTitle: string
  metaDescription: string
  keyphrase: string
  text: string
  headings: { level: number; text: string }[]
  links: { href: string; internal: boolean }[]
  images: { alt: string }[]
  siteName?: string
}

export interface AnalysisResult {
  seo: Check[]
  readability: Check[]
  seoScore: Status
  readabilityScore: Status
}
