import { RESPONSIVE_KEYS, resolveDeviceOverride, sanitizeDeviceOverride, type BlockStyle, type ResponsiveDevice } from '@/lib/blockStyle'

/**
 * Pure helpers for the Design panel (wave 51): side linking, per-group modified / reset,
 * label search and colour-token discovery. No React here so they can be unit tested.
 */

/** One value for a set of linked sides: the shared number, or undefined when the sides differ / are empty. */
export function linkedValue(vals: readonly unknown[]): { same: boolean; value: number | undefined } {
  const same = vals.every((v) => v === vals[0])
  return { same, value: same && typeof vals[0] === 'number' ? vals[0] : undefined }
}

/** The patch that writes one value (or a clear) to every side key. */
export function linkedPatch<K extends string>(keys: readonly K[], v: number | undefined): Record<K, number | undefined> {
  return Object.fromEntries(keys.map((k) => [k, v])) as Record<K, number | undefined>
}

export const PADDING_SIDE_KEYS = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'] as const
export const MARGIN_SIDE_KEYS = ['marginTop', 'marginBottom', 'marginLeft', 'marginRight'] as const
export const MARGIN_VERTICAL_KEYS = ['marginTop', 'marginBottom'] as const

/* ------------------------------ groups ----------------------------------- */

const tf = ['Rotate', 'Scale', 'TranslateX', 'TranslateY', 'SkewX', 'SkewY']

/** The style keys each Design accordion owns (the group's Reset clears exactly these). 'hide' = the per-device hide flag. */
export const GROUP_KEYS: Record<string, readonly string[]> = {
  background: [
    'bgType', 'bgColor', 'bgGradientFrom', 'bgGradientTo', 'bgGradientAngle', 'bgImage', 'bgImageUrl', 'bgVideoUrl',
    'bgVideoPoster', 'bgVideoLoop', 'bgOverlay', 'overlayType', 'overlayColor', 'overlayColor2', 'overlayAngle',
    'overlayOpacity', 'overlayBlend', 'bgEffect', 'bgEffectColor', 'bgEffectColor2', 'bgEffectIntensity', 'particlesCount',
    'particlesInteract', 'particlesSizeMin', 'particlesSizeMax', 'particlesSpeed', 'particlesOpacity', 'particlesLinks',
    'particlesLinkDistance', 'particlesInteractRadius', 'particlesShape', 'dotSize', 'dotSpacing', 'gridSize',
    'gridLineWidth', 'auroraBlur', 'auroraSize', 'auroraSpeed', 'gradientAngle', 'gradientSpeed', 'grainOpacity', 'grainSize',
    'bgSlides', 'bgSlideIds', 'slideInterval', 'slideTransition', 'noise',
  ],
  hover: ['hoverBgColor', 'hoverTextColor', 'hoverBorderColor', 'hoverBoxShadow', 'hoverBorderRadius', 'hoverTransitionMs'],
  spacing: [
    'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingTopMobile', 'paddingBottomMobile', 'paddingUnit',
    'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginUnit', 'minHeight', 'minHeightUnit',
  ],
  border: ['borderWidth', 'borderStyle', 'borderColor', 'borderRadius', 'boxShadow'],
  layout: ['width', 'textAlign', 'textColor'],
  typography: [
    'fontFamily', 'fontSize', 'fontSizeUnit', 'fontWeight', 'lineHeight', 'letterSpacing', 'letterSpacingUnit', 'textTransform',
    'fontStyle', 'textDecoration', 'wordSpacing', 'textShadow', 'textFx', 'textFxColor', 'textFxColor2', 'textFxAngle',
    'textFxStroke', 'textFxAnimated',
  ],
  position: ['selfAlign', 'selfWidth', 'selfWidthPercent', 'selfWidthPercentUnit'],
  dividers: [
    'dividerTop', 'dividerTopColor', 'dividerTopHeight', 'dividerTopFlip', 'dividerTopAnim', 'dividerTopSpeed',
    'dividerBottom', 'dividerBottomColor', 'dividerBottomHeight', 'dividerBottomFlip', 'dividerBottomAnim', 'dividerBottomSpeed',
  ],
  effects: [
    'parallax', 'parallaxStrength', 'parallaxDistance', 'parallaxDirection', 'reveal', 'revealDistance', 'revealDuration',
    'revealDelay', 'revealEasing', 'hover', 'hoverLift', 'hoverScale', 'glass', 'glassBlur', 'glassOpacity', 'glassBorder',
    'pointerFx', 'pointerFxStrength', 'spotlightColor', 'kenBurns', 'kenBurnsDuration', 'borderFx', 'borderFxColor',
    'borderFxColor2', 'borderFxWidth', 'borderFxSpeed',
  ],
  advanced: [
    ...tf.map((s) => `tf${s}`), ...tf.map((s) => `tfh${s}`), 'tfDuration', 'position', 'posTop', 'posRight', 'posBottom',
    'posLeft', 'zIndex', 'opacity', 'blendMode', 'filterBlur', 'filterBrightness', 'filterContrast', 'filterSaturate',
    'filterGrayscale', 'filterHue', 'maskShape', 'blobMorphSpeed', 'cssClasses', 'customCss',
  ],
  conditions: ['showFrom', 'showUntil', 'showAuth', 'showRoles', 'showUrl'],
  visibility: ['hide', 'hideOnMobile', 'hideOnDesktop', 'anchorId', 'customClass'],
}

/** Words searched for each group (its title plus the control labels inside it). */
export const GROUP_SEARCH: Record<string, string> = {
  background: 'background type colour gradient image video poster loop dark overlay angle opacity blend mode animated effect parallax',
  hover: 'hover state background text colour border shadow corner radius transition',
  spacing: 'spacing padding margin top bottom left right link all sides unit height minimum fit screen',
  border: 'border shadow width style colour corner radius',
  layout: 'layout text width contained wide full width text alignment text colour',
  typography: 'typography font family size weight line height letter spacing transform style decoration word spacing shadow text effect',
  position: 'position in column align self width custom margin',
  dividers: 'shape dividers top bottom flip animation speed height',
  effects: 'effects scroll motion reveal hover lift scale glass pointer spotlight tilt magnetic ken burns border glow',
  advanced: 'advanced transform rotate scale move skew filter blur brightness contrast saturate opacity blend z-index position mask custom css class',
  conditions: 'visibility rules display conditions show only when date schedule from until logged in logged out member role url query path',
  visibility: 'visibility advanced hide anchor id extra css class',
}

const isSet = (v: unknown): boolean => v !== undefined && v !== null && v !== '' && v !== false

/** True when the group has any non-default value (base style, or a tablet / mobile override). */
export function groupModified(style: BlockStyle, keys: readonly string[]): boolean {
  const s = style as Record<string, unknown>
  for (const k of keys) if (isSet(s[k])) return true
  for (const dev of ['tablet', 'mobile'] as const) {
    const o = s[dev] as Record<string, unknown> | undefined
    if (o && keys.some((k) => isSet(o[k]))) return true
  }
  return false
}

/** The style with only this group's keys removed (also from the tablet / mobile overrides). One object = one undo step. */
export function resetGroup(style: BlockStyle, keys: readonly string[]): BlockStyle {
  const out: Record<string, unknown> = { ...style }
  for (const k of keys) if (k !== 'hide') delete out[k]
  for (const dev of ['tablet', 'mobile'] as const) {
    const o = out[dev] as Record<string, unknown> | undefined
    if (!o) continue
    const next = { ...o }
    for (const k of keys) delete next[k]
    if (Object.keys(next).length > 0) out[dev] = next
    else delete out[dev]
  }
  return out as BlockStyle
}

/* ------------------------- device overrides ------------------------------ */

/** The responsive keys the desktop (base) style has a value for; these are what can be copied to a device. */
export function desktopOverridableValues(style: BlockStyle): Record<string, unknown> {
  const s = style as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const k of RESPONSIVE_KEYS) if (isSet(s[k])) out[k] = s[k]
  return out
}

/** True when the device has any override of its own (including the older mobile-only padding / hide keys). */
export function hasDeviceOverrides(style: BlockStyle, device: 'desktop' | ResponsiveDevice): boolean {
  if (device === 'desktop') return false
  return Object.keys(resolveDeviceOverride(style, device)).length > 0
}

/**
 * The style with the desktop values merged into the device's override (desktop wins over what the
 * device had), sanitised so only valid override keys and values survive. Returns the same object when
 * there is nothing to copy. One object = one undo step.
 */
export function copyDesktopToDevice(style: BlockStyle, device: ResponsiveDevice): BlockStyle {
  const picked = desktopOverridableValues(style)
  if (Object.keys(picked).length === 0) return style
  const existing = (device === 'tablet' ? style.tablet : style.mobile) ?? {}
  const merged = sanitizeDeviceOverride({ ...existing, ...picked })
  const out: BlockStyle = { ...style }
  if (merged) out[device] = merged
  else delete out[device]
  return out
}

/** The style with this device's overrides removed (also the older mobile-only keys when device is mobile). */
export function clearDeviceOverrides(style: BlockStyle, device: ResponsiveDevice): BlockStyle {
  const out: BlockStyle = { ...style }
  delete out[device]
  if (device === 'mobile') {
    delete out.paddingTopMobile
    delete out.paddingBottomMobile
    delete out.hideOnMobile
  }
  return out
}

/** Case-insensitive label match; an empty query matches everything. */
export function matchesQuery(query: string, ...texts: string[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return texts.some((t) => t.toLowerCase().includes(q))
}

/* ---------------------------- colour tokens ------------------------------ */

export type ColourToken = { name: string; css: string; value: string }

const TOKEN_PREFIX = '--eg-c-'
const TOKEN_NAME = /^--eg-c-[a-z0-9-]+$/

/**
 * Theme colour tokens (--eg-c-<id>, emitted on :root by the Theming global's stylesheet) present on a
 * document. No client data path exists for the Theming global, so this reads the CSS rules the page
 * already has, then resolves each value through getComputedStyle. Cross-origin sheets are skipped.
 */
export function readColourTokens(doc: Document): ColourToken[] {
  const names = new Set<string>()
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue
    }
    for (const rule of Array.from(rules)) {
      const style = (rule as CSSStyleRule).style
      if (!style) continue
      for (let i = 0; i < style.length; i++) {
        const n = style.item(i)
        if (n.startsWith(TOKEN_PREFIX) && TOKEN_NAME.test(n)) names.add(n)
      }
    }
  }
  const computed = doc.defaultView?.getComputedStyle(doc.documentElement)
  return Array.from(names)
    .sort()
    .map((name) => ({ name, css: `var(${name})`, value: computed?.getPropertyValue(name).trim() || '' }))
}
