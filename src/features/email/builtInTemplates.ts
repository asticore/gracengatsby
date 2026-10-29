import { fallbackChain, loadStrings, translateWith, UI_STRING_SOURCE, type UiStringKey } from '@/features/uiStrings'

import { EMAIL_TEMPLATE_DEFAULTS, type EmailTemplate, type EmailTemplateKey } from './templateDefaults'

/** Key text writes placeholders as {name}; the email renderer reads {{name}}. */
export const toRenderTokens = (text: string): string => text.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, '{{$1}}')

const isUiKey = (key: string): key is UiStringKey => Object.prototype.hasOwnProperty.call(UI_STRING_SOURCE, key)

/**
 * The built-in wording of every automatic email, in the reader's language.
 *
 * English, or no locale at all, returns the original constants untouched, so a
 * site that never turns on languages sends exactly the same emails as before.
 * A template with no translation yet keeps its English wording. Wording the
 * owner has typed into Email templates still wins over all of this.
 */
export async function builtInEmailTemplates(locale?: string | null): Promise<Record<EmailTemplateKey, EmailTemplate>> {
  const [primary] = fallbackChain(locale)
  if (!locale || primary === 'en') return EMAIL_TEMPLATE_DEFAULTS

  const dict = await loadStrings(locale)
  const out = { ...EMAIL_TEMPLATE_DEFAULTS }
  for (const name of Object.keys(EMAIL_TEMPLATE_DEFAULTS) as EmailTemplateKey[]) {
    const subject = `email.${name}.subject`
    const body = `email.${name}.body`
    if (!isUiKey(subject) || !isUiKey(body)) continue
    out[name] = { subject: toRenderTokens(translateWith(dict, subject)), body: toRenderTokens(translateWith(dict, body)) }
  }
  return out
}
