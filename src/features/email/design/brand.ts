/**
 * The brand settings every designed email is wrapped in: logo, colours, font,
 * footer. Pure: no engine, so the renderer and the admin preview share it.
 *
 * Only web-safe fonts are offered, because an email client may not have anything else.
 */

export const EMAIL_FONT_OPTIONS = [
  { value: 'arial', label: 'Arial', css: 'Arial, Helvetica, sans-serif' },
  { value: 'georgia', label: 'Georgia', css: "Georgia, 'Times New Roman', Times, serif" },
  { value: 'verdana', label: 'Verdana', css: 'Verdana, Geneva, sans-serif' },
  { value: 'tahoma', label: 'Tahoma', css: 'Tahoma, Geneva, sans-serif' },
  { value: 'trebuchet', label: 'Trebuchet', css: "'Trebuchet MS', Helvetica, sans-serif" },
  { value: 'courier', label: 'Courier New', css: "'Courier New', Courier, monospace" },
] as const

export type EmailFontKey = (typeof EMAIL_FONT_OPTIONS)[number]['value']

export type EmailBrand = {
  /** When off, emails keep their old plain layout. Turned on in Email design. */
  enabled: boolean
  /** Absolute http or https address of the logo. Blank shows no logo. */
  logoUrl: string
  /** Logo width in pixels, 40 to 400. */
  logoWidth: number
  /** Hex colour for buttons and links, such as #1a5c4f. */
  accent: string
  /** Hex colour for body text. */
  textColor: string
  /** Hex colour behind the whole email. */
  background: string
  /** Hex colour of the central panel. */
  contentBackground: string
  fontStack: EmailFontKey
  /** Corner radius of buttons in pixels, 0 to 30. */
  buttonRadius: number
  /** Shown at the foot of every designed email. */
  footerText: string
  /** Postal address shown at the foot, useful for marketing email. */
  address: string
}

export const DEFAULT_EMAIL_BRAND: EmailBrand = {
  enabled: false,
  logoUrl: '',
  logoWidth: 160,
  accent: '#1a5c4f',
  textColor: '#222222',
  background: '#f4f4f4',
  contentBackground: '#ffffff',
  fontStack: 'arial',
  buttonRadius: 4,
  footerText: '',
  address: '',
}

export const fontCss = (key: EmailFontKey): string =>
  (EMAIL_FONT_OPTIONS.find((option) => option.value === key) ?? EMAIL_FONT_OPTIONS[0]).css

const HEX = /^#[0-9a-f]{6}$/i
const HEX_SHORT = /^#[0-9a-f]{3}$/i

/** A hex colour, with the # sign. Returns the fallback when the value is not one. */
export const cleanColor = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (HEX.test(trimmed)) return trimmed.toLowerCase()
  if (HEX_SHORT.test(trimmed)) {
    const [, r, g, b] = trimmed.toLowerCase().split('') as [string, string, string, string]
    return `#${r}${r}${g}${g}${b}${b}`
  }
  return fallback
}

export const isHexColor = (value: unknown): value is string => typeof value === 'string' && (HEX.test(value) || HEX_SHORT.test(value))

const clampInt = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

const cleanText = (value: unknown, max: number): string => (typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim().slice(0, max) : '')

/**
 * Brand settings from stored or submitted data. Anything wrong is replaced by
 * the default, so a bad value can never break an email.
 */
export const brandFrom = (raw: unknown): EmailBrand => {
  const source = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_EMAIL_BRAND
  const font = EMAIL_FONT_OPTIONS.find((option) => option.value === source.fontStack)
  const logo = cleanText(source.logoUrl, 2048)
  return {
    enabled: source.enabled === true,
    logoUrl: /^https?:\/\//i.test(logo) ? logo : '',
    logoWidth: clampInt(source.logoWidth, 40, 400, d.logoWidth),
    accent: cleanColor(source.accent, d.accent),
    textColor: cleanColor(source.textColor, d.textColor),
    background: cleanColor(source.background, d.background),
    contentBackground: cleanColor(source.contentBackground, d.contentBackground),
    fontStack: font ? font.value : d.fontStack,
    buttonRadius: clampInt(source.buttonRadius, 0, 30, d.buttonRadius),
    footerText: cleanText(source.footerText, 500),
    address: cleanText(source.address, 300),
  }
}
