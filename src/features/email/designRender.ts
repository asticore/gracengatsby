/**
 * Chooses how one automatic email is rendered: its own design when it has one,
 * the brand layout around the plain wording when the brand is switched on, or the
 * plain wording as before. Pure apart from reading process.env.SITE_URL for logo links.
 */

import { type EmailBrand, brandFrom } from './design/brand'
import { renderEmailHtml } from './design/render'
import { renderEmailText } from './design/renderText'
import type { EmailBlock } from './design/types'
import { validateEmailBlocks } from './design/validate'
import { type RenderedEmail, type TemplateValues, renderTemplate } from './renderTemplate'
import type { EmailTemplate } from './templateDefaults'
import { configuredSiteOrigin } from '@/utilities/siteOrigin'

/** The stored design for one template, checked. Null when there is none or it is not valid. */
export const designedBlocks = (raw: unknown): EmailBlock[] | null => {
  const checked = validateEmailBlocks(raw)
  return checked.ok && checked.blocks.length > 0 ? checked.blocks : null
}

/** Renders one email. `blocks` is that template's design, or null when it has none. */
export const renderWithDesign = (template: EmailTemplate, values: TemplateValues, blocks: EmailBlock[] | null, brand: EmailBrand): RenderedEmail => {
  const plain = renderTemplate(template, values)
  if (blocks) {
    return { subject: plain.subject, text: renderEmailText(blocks, brand, values), html: renderEmailHtml(blocks, brand, { vars: values }) }
  }
  if (brand.enabled) {
    // The plain wording keeps its own text; only the layout around it changes.
    const body: EmailBlock[] = [{ type: 'text', text: template.body, align: 'left' }]
    return { subject: plain.subject, text: plain.text, html: renderEmailHtml(body, brand, { vars: values }) }
  }
  return plain
}

/**
 * The logo chosen on the `email-brand` global, read at depth 1: its media id and
 * an absolute address. Null when no logo is chosen. The address is empty when the
 * media item has none, so the id can still be shown to the admin.
 */
export const storedLogo = (doc: unknown): { id: number; url: string } | null => {
  const source = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>
  const logo = source.logo
  if (!logo || typeof logo !== 'object') return null
  const { id, url: raw } = logo as { id?: unknown; url?: unknown }
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null
  const url = typeof raw === 'string' ? raw : ''
  // A root-relative logo is made absolute only when SITE_URL is set; otherwise it is left out.
  const base = configuredSiteOrigin()
  const absolute = url.startsWith('/') ? (base ? `${base}${url}` : '') : url
  return { id, url: /^https?:\/\//i.test(absolute) ? absolute : '' }
}

/** Brand settings from the `email-brand` global read at depth 1, with the logo turned into an absolute link. */
export const brandFromStored = (doc: unknown): EmailBrand => {
  const source = (doc && typeof doc === 'object' ? doc : {}) as Record<string, unknown>
  return brandFrom({ ...source, logoUrl: storedLogo(doc)?.url ?? '' })
}
