import { brandFrom, type EmailBrand } from './design/brand'
import { validateEmailBlocks } from './design/validate'
import type { EmailBlock } from './design/types'
import { EMAIL_TEMPLATE_DEFAULTS } from './templateDefaults'

/**
 * Checks and shapes what the Email designer screen saves. Pure: the route
 * (src/app/(engage)/api/admin-email-design/route.ts) does the reads and writes.
 * Nothing the browser sends is trusted: keys must be known templates, the
 * blocks go through validateEmailBlocks, and the brand through brandFrom.
 */

export type DesignSaveRequest =
  | { kind: 'template'; key: string; subject: string; blocks: EmailBlock[] }
  | { kind: 'reset'; key: string }
  /** `logo` is the media id chosen for the logo, or null for none. The brand's logoUrl is never stored. */
  | { kind: 'brand'; brand: EmailBrand; logo: number | null }

export type ParsedDesignSave = { ok: true; request: DesignSaveRequest } | { ok: false; error: string }

/** The keys of every template the designer can edit. */
export const DESIGNABLE_TEMPLATE_KEYS: readonly string[] = Object.keys(EMAIL_TEMPLATE_DEFAULTS)

const SUBJECT_CAP = 300

const isKnownKey = (key: unknown): key is string => typeof key === 'string' && DESIGNABLE_TEMPLATE_KEYS.includes(key)

/** The column that holds one template's design, e.g. accountReset -> accountResetDesign. */
export const designField = (key: string): string => `${key}Design`

/** A media id from a number or a digit string. Anything else means no logo. */
export const logoIdFrom = (value: unknown): number | null => {
  const id = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value.trim()) ? Number(value) : NaN
  return Number.isSafeInteger(id) && id > 0 ? id : null
}

/** Reads and checks a save request body. Returns the reason when something is wrong. */
export const parseDesignSave = (body: unknown): ParsedDesignSave => {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Send the design as a JSON object.' }
  const data = body as Record<string, unknown>

  if (data.kind === 'brand') {
    return { ok: true, request: { kind: 'brand', brand: brandFrom(data.brand), logo: logoIdFrom(data.logo) } }
  }

  if (!isKnownKey(data.key)) return { ok: false, error: 'That email template does not exist.' }

  if (data.kind === 'reset') return { ok: true, request: { kind: 'reset', key: data.key } }

  if (data.kind !== 'template') return { ok: false, error: 'Choose what to save.' }

  const subject = typeof data.subject === 'string' ? data.subject.replace(/[\r\n]+/g, ' ').trim() : ''
  if (!subject) return { ok: false, error: 'The subject line cannot be empty.' }
  if (subject.length > SUBJECT_CAP) return { ok: false, error: `The subject line is longer than ${SUBJECT_CAP} characters.` }

  const checked = validateEmailBlocks(data.blocks)
  if (!checked.ok) return { ok: false, error: checked.error }

  return { ok: true, request: { kind: 'template', key: data.key, subject, blocks: checked.blocks } }
}

/**
 * The part of the email-templates global to write for a saved design. The
 * body is passed in so the wording already there is kept as it is.
 */
export const templatePatch = (key: string, subject: string, blocks: EmailBlock[], currentBody: string | null): Record<string, unknown> => ({
  [key]: { subject, body: currentBody },
  [designField(key)]: blocks,
})

/** The part of the email-templates global to write to go back to the built-in wording and drop the design. */
export const resetPatch = (key: string): Record<string, unknown> => ({
  [key]: { subject: null, body: null },
  [designField(key)]: null,
})

/**
 * The fields to write to the email-brand global. The logo is a media relationship
 * (`logo`, an id), not a web address: the global has no logoUrl field.
 */
export const brandPatch = (brand: EmailBrand, logo: number | null): Record<string, unknown> => ({
  enabled: brand.enabled,
  logo,
  logoWidth: brand.logoWidth,
  accent: brand.accent,
  textColor: brand.textColor,
  background: brand.background,
  contentBackground: brand.contentBackground,
  fontStack: brand.fontStack,
  buttonRadius: brand.buttonRadius,
  footerText: brand.footerText,
  address: brand.address,
})
