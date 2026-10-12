import type { ConditionalLogic, FormConfig, FormNotificationRule, FormStylePreset, FormWebhook } from './types'

/**
 * The per-form options column, read and written defensively.
 *
 * `formConfig` is one JSON column so a new option never needs a migration, but
 * that also means it is user-supplied JSON at every boundary. Everything that
 * reads it goes through `normaliseFormConfig`, which returns a fully shaped
 * object with bounds on every list and string; everything that writes it goes
 * through the same function in the collection's beforeChange hook, so what is
 * stored is already clean.
 */

export const STYLE_PRESETS: { value: FormStylePreset; label: string; description: string }[] = [
  { value: 'theme', label: 'Match the site', description: 'Uses your site colours, fonts and corner style.' },
  { value: 'minimal', label: 'Minimal', description: 'Plain fields with thin lines.' },
  { value: 'rounded', label: 'Rounded', description: 'Soft, pill-shaped fields and button.' },
  { value: 'underline', label: 'Underline', description: 'Fields are a line, like a paper form.' },
  { value: 'card', label: 'Card', description: 'The form sits in a raised card.' },
  { value: 'dark', label: 'Dark', description: 'Light text on a dark panel.' },
]

const PRESET_VALUES = new Set<string>(STYLE_PRESETS.map((preset) => preset.value))

export const MAX_NOTIFICATION_RULES = 10
export const MAX_WEBHOOKS = 5
export const MAX_ALLOWED_ORIGINS = 50
export const MAX_CUSTOM_CSS_LENGTH = 20_000

const str = (value: unknown, max: number): string | undefined =>
  typeof value === 'string' ? value.slice(0, max) : undefined

const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}

/** `#abc`, `#aabbcc`, or `#aabbccdd`. Anything else is dropped: it ends up inside a style attribute. */
export const cleanColour = (value: unknown): string | undefined =>
  typeof value === 'string' && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.trim())
    ? value.trim()
    : undefined

/**
 * One origin as the browser sends it in `Origin`: scheme, host, optional port,
 * no path. Returns null for anything else, including `*`, so a wildcard can
 * never be typed into the list by accident. A leading `*.` on the host is
 * allowed for subdomains.
 */
export function cleanOrigin(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim().replace(/\/+$/, '')
  if (!text) return null
  const wildcard = /^(https?):\/\/\*\.([a-z0-9.-]+)(?::(\d{1,5}))?$/i.exec(text)
  if (wildcard) return `${wildcard[1].toLowerCase()}://*.${wildcard[2].toLowerCase()}${wildcard[3] ? `:${wildcard[3]}` : ''}`
  try {
    const url = new URL(text)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) return null
    return url.origin.toLowerCase()
  } catch {
    return null
  }
}

const cleanConditions = (value: unknown): ConditionalLogic | undefined => {
  const raw = record(value)
  if (raw.enabled !== true) return undefined
  const rules = (Array.isArray(raw.rules) ? raw.rules : [])
    .slice(0, 10)
    .map(record)
    .filter((rule) => typeof rule.field === 'string' && rule.field)
    .map((rule) => ({
      field: String(rule.field).slice(0, 80),
      operator: (str(rule.operator, 20) || 'equals') as never,
      value: str(rule.value, 200) ?? '',
    }))
  return { enabled: true, action: 'show', match: raw.match === 'any' ? 'any' : 'all', rules }
}

const cleanId = (value: unknown, fallback: string): string => {
  const id = typeof value === 'string' ? value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) : ''
  return id || fallback
}

export function normaliseFormConfig(input: unknown): FormConfig {
  const raw = record(input)
  const style = record(raw.style)
  const steps = record(raw.steps)
  const success = record(raw.success)
  const embed = record(raw.embed)

  const preset = typeof style.preset === 'string' && PRESET_VALUES.has(style.preset) ? (style.preset as FormStylePreset) : 'theme'

  const notifications: FormNotificationRule[] = (Array.isArray(raw.notifications) ? raw.notifications : [])
    .slice(0, MAX_NOTIFICATION_RULES)
    .map((entry, index) => {
      const rule = record(entry)
      return {
        id: cleanId(rule.id, `n${index + 1}`),
        name: str(rule.name, 80) || `Notification ${index + 1}`,
        enabled: bool(rule.enabled) !== false,
        recipients: str(rule.recipients, 500) || '',
        subject: str(rule.subject, 200) || '',
        message: str(rule.message, 5000) || '',
        conditions: cleanConditions(rule.conditions),
      }
    })

  const webhooks: FormWebhook[] = (Array.isArray(raw.webhooks) ? raw.webhooks : [])
    .slice(0, MAX_WEBHOOKS)
    .map((entry, index) => {
      const hook = record(entry)
      return {
        id: cleanId(hook.id, `w${index + 1}`),
        name: str(hook.name, 80) || `Webhook ${index + 1}`,
        enabled: bool(hook.enabled) !== false,
        url: str(hook.url, 500) || '',
        secret: str(hook.secret, 200) || '',
      }
    })

  const origins: string[] = []
  for (const entry of Array.isArray(embed.allowedOrigins) ? embed.allowedOrigins : []) {
    const origin = cleanOrigin(entry)
    if (origin && !origins.includes(origin) && origins.length < MAX_ALLOWED_ORIGINS) origins.push(origin)
  }

  const retention = typeof raw.retentionDays === 'number' && Number.isFinite(raw.retentionDays) ? Math.max(0, Math.min(3650, Math.floor(raw.retentionDays))) : undefined

  const prefillKeys = (Array.isArray(raw.prefillKeys) ? raw.prefillKeys : [])
    .map((key) => (typeof key === 'string' ? key.trim() : ''))
    .filter((key) => /^[A-Za-z0-9_.-]{1,40}$/.test(key))
    .slice(0, 30)

  return {
    style: {
      preset,
      accent: cleanColour(style.accent),
      customCss: str(style.customCss, MAX_CUSTOM_CSS_LENGTH) || '',
    },
    steps: {
      showProgress: bool(steps.showProgress) !== false,
      progressStyle: steps.progressStyle === 'steps' || steps.progressStyle === 'text' ? steps.progressStyle : 'bar',
      nextLabel: str(steps.nextLabel, 40) || 'Next',
      backLabel: str(steps.backLabel, 40) || 'Back',
    },
    success: {
      mode: success.mode === 'redirect' ? 'redirect' : 'message',
      message: str(success.message, 2000) || '',
      redirectUrl: str(success.redirectUrl, 500) || '',
    },
    embed: {
      allowedOrigins: origins,
      enabled: bool(embed.enabled) !== false,
    },
    notifications,
    webhooks,
    retentionDays: retention,
    saveForLater: bool(raw.saveForLater) === true,
    prefillKeys: Array.from(new Set(prefillKeys)),
  }
}

/** A long random key for the public embed URL, so a form id is not guessable from it. */
export function generateEmbedKey(random: (bytes: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789'
  const bytes = random(14)
  let key = ''
  for (const byte of bytes) key += alphabet[byte % alphabet.length]
  return key
}

/**
 * The config with everything that must stay on the server removed: webhook
 * URLs and secrets, notification recipients and bodies. This is the only
 * shape that may be sent to a browser.
 */
export function publicFormConfig(config: FormConfig): Pick<FormConfig, 'style' | 'steps' | 'success' | 'saveForLater' | 'prefillKeys'> {
  return {
    style: config.style,
    steps: config.steps,
    success: config.success,
    saveForLater: config.saveForLater,
    prefillKeys: config.prefillKeys,
  }
}
