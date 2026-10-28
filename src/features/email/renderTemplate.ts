import { EMAIL_TEMPLATE_DEFAULTS, type EmailTemplate, type EmailTemplateKey } from './templateDefaults'

/**
 * Pure rendering for the editable email templates: no engine, no database, so
 * it can be tested on its own.
 *
 * A tag is filled from the values the sender supplies. A tag with no value is
 * removed rather than shown raw. Values are substituted in one pass, so a value
 * that happens to contain "{{...}}" is never filled a second time.
 */

export type TemplateValues = Record<string, string | number | null | undefined>

export type RenderedEmail = { subject: string; text: string; html: string }

/** One template as stored in the `email-templates` global: each group holds a subject and a body. */
export type StoredTemplates = Partial<Record<EmailTemplateKey, { subject?: unknown; body?: unknown } | null>> | null | undefined

const TAG = /\{\{\s*(\w+)\s*\}\}/g

export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string)

/** Fills the tags in a piece of text with plain (unescaped) values. */
export const fillTemplate = (text: string, values: TemplateValues): string =>
  text.replace(TAG, (_whole, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) return ''
    const value = values[key]
    return value === undefined || value === null ? '' : String(value)
  })

/** Plain text to HTML: each blank-line-separated block becomes a paragraph, single line breaks become <br />. Values are escaped. */
export const textToHtml = (text: string): string =>
  text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
    .join('\n')

/** Fills one template. The subject is kept to a single line. */
export const renderTemplate = (template: EmailTemplate, values: TemplateValues): RenderedEmail => {
  const subject = fillTemplate(template.subject, values).replace(/[\r\n]+/g, ' ')
  const text = fillTemplate(template.body, values)
  return { subject, text, html: textToHtml(text) }
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : '')

/**
 * The wording to use for one template. A blank subject or body falls back to the
 * built-in default, so filling in only one of the two still sends a full email.
 */
export const templateFrom = (
  stored: StoredTemplates,
  key: EmailTemplateKey,
  builtIn: Record<EmailTemplateKey, EmailTemplate> = EMAIL_TEMPLATE_DEFAULTS,
): EmailTemplate => {
  const defaults = builtIn[key]
  const group = stored?.[key]
  return {
    subject: clean(group?.subject) || defaults.subject,
    body: clean(group?.body) || defaults.body,
  }
}
