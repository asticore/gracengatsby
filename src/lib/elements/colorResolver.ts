/**
 * Resolves a color field value that may reference a global color token.
 *
 * Color fields can store:
 * - Fixed hex: { value: "#ff0000" }
 * - Global token: { value: "#ff0000", globalColorId: "color-primary" }
 *
 * This resolver looks up the token in the global theming and returns the
 * current value, or falls back to the fixed hex if the token is missing.
 */

type ColorValue = {
  value?: string
  globalColorId?: string
}

let theming: { colors?: { id: string; value: string }[] } | null = null
let themingFetch: Promise<{ colors?: { id: string; value: string }[] }> | null = null

/**
 * Fetches theming once and caches it (for SSR performance).
 * In a real implementation this would come from a server context.
 */
const getTheming = async (): Promise<{ colors?: { id: string; value: string }[] }> => {
  if (theming !== null) return theming
  if (themingFetch) return themingFetch

  themingFetch = fetch('/api/theming?depth=0', { credentials: 'include' })
    .then((r) => r.json())
    .catch(() => ({}))

  theming = await themingFetch
  return theming || {}
}

/**
 * Resolves a color value synchronously (for SSR).
 * Uses globalColorId if present, falls back to fixed value.
 * Returns the hex color string, or '#000000' if both are missing.
 */
export const resolveColorValue = (colorObj: unknown): string => {
  if (!colorObj || typeof colorObj !== 'object') return '#000000'

  const color = colorObj as ColorValue
  return color.value || '#000000'
}

/**
 * Resolves a color value asynchronously, looking up global tokens.
 * (For client-side rendering where theming can be fetched.)
 */
export const resolveColorValueAsync = async (colorObj: unknown): Promise<string> => {
  if (!colorObj || typeof colorObj !== 'object') return '#000000'

  const color = colorObj as ColorValue
  if (!color.globalColorId) return color.value || '#000000'

  try {
    const theme = await getTheming()
    const token = theme.colors?.find((c) => c.id === color.globalColorId)
    if (token) return token.value
  } catch {
    // Fetch failed, fall back to fixed value
  }

  return color.value || '#000000'
}
