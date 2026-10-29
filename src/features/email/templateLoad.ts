import { getEngine } from '@/lib/engine'

import { type EmailBrand, brandFrom } from './design/brand'
import { brandFromStored, designedBlocks, renderWithDesign } from './designRender'
import { type RenderedEmail, type StoredTemplates, type TemplateValues, templateFrom } from './renderTemplate'
import { builtInEmailTemplates } from './builtInTemplates'
import type { EmailTemplateKey } from './templateDefaults'

type Reader = { findGlobal: (args: never) => Promise<unknown> }

/** The brand from the `email-brand` global. A failed read gives the defaults, so the email still goes out. */
const readBrand = async (reader: Reader): Promise<EmailBrand> => {
  try {
    const doc = await reader.findGlobal({ slug: 'email-brand', depth: 1 } as never)
    return brandFromStored(doc)
  } catch {
    return brandFrom(null)
  }
}

/**
 * Reads the site's own email wording and design and renders one template with them.
 *
 * Reaches for the engine, so senders import this at call time, not at module
 * load (the same dodge the Email feature and the account and member emails use).
 * Never throws: if a global cannot be read the built-in wording is used, so
 * the email still goes out.
 */
export const renderEmailTemplate = async (
  key: EmailTemplateKey,
  values: TemplateValues,
  givenEngine?: Reader,
  locale?: string | null,
): Promise<RenderedEmail> => {
  let stored: StoredTemplates = null
  let brand: EmailBrand = brandFrom(null)
  try {
    const engine = givenEngine ?? (await getEngine())
    const reader = engine as unknown as Reader
    stored = (await reader.findGlobal({ slug: 'email-templates', depth: 0 } as never)) as StoredTemplates
    brand = await readBrand(reader)
  } catch {
    stored = null
  }
  const design = designedBlocks((stored as Record<string, unknown> | null | undefined)?.[`${key}Design`])
  const builtIn = await builtInEmailTemplates(locale)
  return renderWithDesign(templateFrom(stored, key, builtIn), values, design, brand)
}
