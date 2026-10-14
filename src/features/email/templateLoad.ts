import { getEngine } from '@/lib/engine'

import { renderTemplate, templateFrom, type RenderedEmail, type StoredTemplates, type TemplateValues } from './renderTemplate'
import type { EmailTemplateKey } from './templateDefaults'

/**
 * Reads the site's own email wording and renders one template with it.
 *
 * Reaches for the engine, so senders import this at call time, not at module
 * load (the same dodge the Email feature and the account and member emails use).
 * Never throws: if the global cannot be read the built-in wording is used, so
 * the email still goes out.
 */
export const renderEmailTemplate = async (
  key: EmailTemplateKey,
  values: TemplateValues,
  givenEngine?: { findGlobal: (args: never) => Promise<unknown> },
): Promise<RenderedEmail> => {
  let stored: StoredTemplates = null
  try {
    const engine = givenEngine ?? (await getEngine())
    stored = (await (engine as { findGlobal: (a: unknown) => Promise<unknown> }).findGlobal({ slug: 'email-templates', depth: 0 })) as StoredTemplates
  } catch {
    stored = null
  }
  return renderTemplate(templateFrom(stored, key), values)
}
