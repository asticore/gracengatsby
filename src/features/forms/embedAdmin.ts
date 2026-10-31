/**
 * External embeds, the admin side: pure helpers shared by the screen and its tests.
 *
 * An embed is a form that may be shown on other websites. The mechanism already exists per form (the public
 * embed key, the hosted /embed/forms/<key> page, the loader script, and `formConfig.embed` for the switch and
 * the website allow-list). This module only turns that into what the admin shows: the hosted address, the two
 * snippets, and a reading of the allow-list typed into a box.
 */

import { cleanOrigin } from './config'
import { embedUrl, iframeSnippet, scriptSnippet } from './embedScript'
import type { FormConfig } from './types'

export type EmbedRow = {
  id: number | string
  title: string
  published: boolean
  embedKey: string | null
  enabled: boolean
  allowedOrigins: string[]
}

/** Reads the allow-list box. One website per line; a bare host such as example.com is taken as https. */
export function parseAllowedOrigins(text: string): { origins: string[]; invalid: string[] } {
  const origins: string[] = []
  const invalid: string[] = []
  for (const raw of (text || '').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const candidate = /^https?:\/\//i.test(line) ? line : `https://${line}`
    const clean = cleanOrigin(candidate)
    if (clean && !origins.includes(clean)) origins.push(clean)
    else if (!clean) invalid.push(line)
  }
  return { origins, invalid }
}

/** The embed state of a form, from its stored config. Never carries webhook data. */
export function embedRowFrom(form: { id: number | string; title?: unknown; formStatus?: unknown; embedKey?: unknown; formConfig?: FormConfig | null }): EmbedRow {
  const embed = form.formConfig?.embed ?? {}
  return {
    id: form.id,
    title: typeof form.title === 'string' && form.title ? form.title : `Form #${form.id}`,
    published: form.formStatus !== 'draft',
    embedKey: typeof form.embedKey === 'string' && form.embedKey ? form.embedKey : null,
    enabled: embed.enabled !== false,
    allowedOrigins: embed.allowedOrigins ?? [],
  }
}

/** Hosted address and the two snippets for one embed, for the given site origin. */
export function embedOutputs(key: string, origin: string): { hostedUrl: string; scriptSnippet: string; iframeSnippet: string } {
  return { hostedUrl: embedUrl(origin, key), scriptSnippet: scriptSnippet(origin, key), iframeSnippet: iframeSnippet(origin, key) }
}
