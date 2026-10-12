import type { FormDoc, Inherited, PublicFormConfig, ResolvedFormSettings } from './types'

import { FEATURE_MAP } from '@/features/registry'

import { normaliseFormConfig } from './config'
import { sanitiseHtml, sanitiseLayoutHtml } from './htmlSanitize'
import { resolveLayout } from './layout'
import { computePrefill } from './prefill'

/**
 * Reads the site-wide Form Settings and folds a single form's overrides into it.
 *
 * Every consumer wants one flat answer - "is the honeypot on for THIS form" -
 * rather than the two-level inherit/on/off dance, so that resolution happens
 * once, here.
 *
 * Nothing in this feature imports `@/lib/engine`, and it must stay that way:
 * the config imports the Forms collection, the collection carries the
 * submission endpoint, and lib/engine imports the config - so a single import
 * of it anywhere in this chain makes the config depend on itself and the
 * collections come out undefined. The engine is passed in instead, which is
 * also how the Security feature reads its own settings.
 */

/**
 * The one method this feature needs from the engine. Declared as a method
 * rather than a property, and returning `unknown`, so that both the real engine
 * (whose `slug` is a generated union and whose return type is a generated
 * document) and a stub in a test satisfy it.
 */
export type EngineLike = {
  findGlobal(args: { slug: string; depth?: number }): Promise<unknown>
}

export const DEFAULT_FORM_SETTINGS: ResolvedFormSettings = {
  storeSubmissions: true,
  sendAdminNotification: true,
  notificationRecipients: '',
  honeypot: true,
  minimumFillTimeSeconds: 3,
  turnstile: false,
  turnstileSiteKey: '',
  turnstileSecretKey: '',
  captchaProvider: 'turnstile',
  recaptchaSiteKey: '',
  recaptchaSecretKey: '',
  recaptchaMinScore: 0.5,
  submitButtonLabel: 'Submit',
  successMessage: 'Thank you - we have received your message and will be in touch shortly.',
  errorMessage: 'Sorry, something went wrong and your message was not sent. Please try again.',
  retentionDays: 365,
}

type SettingsDoc = {
  submissions?: {
    storeSubmissions?: boolean
    retentionDays?: number
    sendAdminNotification?: boolean
    notificationRecipients?: string
  }
  spam?: {
    honeypot?: boolean
    minimumFillTimeSeconds?: number
    turnstile?: boolean
    turnstileSiteKey?: string
    turnstileSecretKey?: string
    captchaProvider?: string
    recaptchaSiteKey?: string
    recaptchaSecretKey?: string
    recaptchaMinScore?: number
  }
  defaults?: {
    submitButtonLabel?: string
    successMessage?: string
    errorMessage?: string
  }
}

const text = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim() ? value : fallback

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

/**
 * True when the Forms feature is switched on in Site Settings.
 *
 * Reads the flag directly rather than through `getFeatureFlags`, which imports
 * the engine - see the note above. Falls back to the registry's default, so an
 * unreadable settings global behaves like a fresh install rather than
 * switching every form on the site off.
 */
export const formsEnabled = async (engine: EngineLike): Promise<boolean> => {
  const fallback = FEATURE_MAP.forms?.defaultEnabled ?? false
  const settings = (await engine
    .findGlobal({ slug: 'site-settings', depth: 0 })
    .catch((): null => null)) as { features?: { forms?: boolean | null } } | null
  const saved = settings?.features ?? {}
  return Boolean(saved.forms ?? fallback)
}

/**
 * Site defaults. Never throws - an unreadable settings global degrades to the
 * shipped defaults rather than taking down every page that has a form on it.
 */
export const getFormSettings = async (engine: EngineLike): Promise<ResolvedFormSettings> => {
  const doc = (await engine
    .findGlobal({ slug: 'form-settings', depth: 0 })
    .catch((): null => null)) as SettingsDoc | null

  if (!doc) return { ...DEFAULT_FORM_SETTINGS }

  return {
    storeSubmissions: bool(doc.submissions?.storeSubmissions, DEFAULT_FORM_SETTINGS.storeSubmissions),
    retentionDays: num(doc.submissions?.retentionDays, DEFAULT_FORM_SETTINGS.retentionDays),
    sendAdminNotification: bool(
      doc.submissions?.sendAdminNotification,
      DEFAULT_FORM_SETTINGS.sendAdminNotification,
    ),
    notificationRecipients: text(doc.submissions?.notificationRecipients, ''),
    honeypot: bool(doc.spam?.honeypot, DEFAULT_FORM_SETTINGS.honeypot),
    minimumFillTimeSeconds: num(
      doc.spam?.minimumFillTimeSeconds,
      DEFAULT_FORM_SETTINGS.minimumFillTimeSeconds,
    ),
    turnstile: bool(doc.spam?.turnstile, DEFAULT_FORM_SETTINGS.turnstile),
    turnstileSiteKey: text(doc.spam?.turnstileSiteKey, ''),
    turnstileSecretKey: text(doc.spam?.turnstileSecretKey, ''),
    captchaProvider: doc.spam?.captchaProvider === 'recaptcha' ? 'recaptcha' : 'turnstile',
    recaptchaSiteKey: text(doc.spam?.recaptchaSiteKey, ''),
    recaptchaSecretKey: text(doc.spam?.recaptchaSecretKey, ''),
    recaptchaMinScore: num(doc.spam?.recaptchaMinScore, DEFAULT_FORM_SETTINGS.recaptchaMinScore),
    submitButtonLabel: text(doc.defaults?.submitButtonLabel, DEFAULT_FORM_SETTINGS.submitButtonLabel),
    successMessage: text(doc.defaults?.successMessage, DEFAULT_FORM_SETTINGS.successMessage),
    errorMessage: text(doc.defaults?.errorMessage, DEFAULT_FORM_SETTINGS.errorMessage),
  }
}

const override = (choice: Inherited | undefined, inherited: boolean): boolean =>
  choice === 'on' ? true : choice === 'off' ? false : inherited

/** Site settings with one form's own choices applied on top. */
export const resolveForForm = (form: FormDoc, settings: ResolvedFormSettings): ResolvedFormSettings => {
  const config = normaliseFormConfig(form?.formConfig)
  return {
    ...settings,
    honeypot: override(form?.spam?.honeypot, settings.honeypot),
    turnstile: override(form?.spam?.turnstile, settings.turnstile),
    // Off means no wait at all, so this cannot go through `override` - it is a
    // number gated by a three-state choice, not a boolean.
    minimumFillTimeSeconds:
      form?.spam?.minimumFillTime === 'off' ? 0 : settings.minimumFillTimeSeconds,
    submitButtonLabel: text(form?.settings?.submitButtonLabel, settings.submitButtonLabel),
    successMessage: text(config.success?.message, text(form?.settings?.successMessage, settings.successMessage)),
    errorMessage: text(form?.settings?.errorMessage, settings.errorMessage),
    retentionDays: config.retentionDays !== undefined ? config.retentionDays : settings.retentionDays,
  }
}

export type PublicConfigOptions = {
  /** The page's query string, for pre-filling whitelisted fields. */
  query?: Record<string, string | string[] | undefined>
  /** Draw the working copy rather than the published one (editor preview only). */
  draft?: boolean
  /** Layout with media ids already resolved to documents by the caller. */
  layout?: unknown[]
  /** Absolute origin for posts when drawn on another website. */
  apiBase?: string
}

/**
 * The form as the browser is allowed to see it.
 *
 * Built explicitly rather than by deleting keys from the stored document: the
 * captcha secrets, the notification recipients, the webhook secrets and the
 * confirmation wording all live on the same document, and an allow-list cannot
 * leak a field somebody adds later.
 */
export const toPublicConfig = (
  form: FormDoc,
  resolved: ResolvedFormSettings,
  options: PublicConfigOptions = {},
): PublicFormConfig => {
  const config = normaliseFormConfig(form?.formConfig)
  const layout = resolveLayout(form, { draft: options.draft })
  const fields = layout.fields

  const captcha: PublicFormConfig['captcha'] = resolved.turnstile
    ? resolved.captchaProvider === 'recaptcha'
      ? resolved.recaptchaSiteKey
        ? { provider: 'recaptcha', siteKey: resolved.recaptchaSiteKey }
        : undefined
      : resolved.turnstileSiteKey
        ? { provider: 'turnstile', siteKey: resolved.turnstileSiteKey }
        : undefined
    : undefined

  const redirect =
    config.success?.mode === 'redirect' && config.success.redirectUrl
      ? config.success.redirectUrl
      : form.settings?.redirectUrl || undefined

  return {
    id: form.id,
    key: form.embedKey || undefined,
    title: form.title || '',
    // The flat list the rules engine (visibility, calculations, pricing) works from.
    fields: fields.map((field) => ({
      id: field.id,
      type: field.type,
      label: field.label,
      name: field.name,
      required: field.required,
      placeholder: field.placeholder,
      helpText: field.helpText,
      defaultValue: field.defaultValue,
      options: (field.options || []).map((option) => ({
        label: option.label,
        value: option.value,
        price: option.price,
      })),
      rows: field.rows,
      width: field.width,
      html: field.html ? sanitiseHtml(field.html) : field.html,
      min: field.min,
      max: field.max,
      accept: field.accept,
      maxFileMb: field.maxFileMb,
      scaleMax: field.scaleMax,
      appointment: field.appointment,
      addressLookup: field.addressLookup,
      consentLink: field.consentLink,
      validation: field.validation,
      conditional: field.conditional,
      calculation: field.calculation,
      pricing: field.pricing,
    })),
    layout: sanitiseLayoutHtml((options.layout as unknown[]) || (layout.legacy ? undefined : layout.layout)),
    stylePreset: config.style?.preset || 'theme',
    accent: config.style?.accent,
    customCss: config.style?.customCss || undefined,
    steps: {
      showProgress: config.steps?.showProgress !== false,
      progressStyle: config.steps?.progressStyle || 'bar',
      nextLabel: config.steps?.nextLabel || 'Next',
      backLabel: config.steps?.backLabel || 'Back',
      titles: layout.stepTitles,
    },
    prefill: computePrefill(fields, config.prefillKeys, options.query),
    captcha,
    saveForLater: config.saveForLater === true,
    apiBase: options.apiBase,
    submitButtonLabel: resolved.submitButtonLabel,
    successMessage: resolved.successMessage,
    errorMessage: resolved.errorMessage,
    redirectUrl: redirect,
    honeypot: resolved.honeypot,
    minimumFillTimeSeconds: resolved.minimumFillTimeSeconds,
    turnstileSiteKey: captcha?.provider === 'turnstile' ? captcha.siteKey : undefined,
    purchasable: Boolean(form.payment?.purchasable),
    currency: form.payment?.currency || 'AUD',
  }
}
