import { scopeCustomCss } from './customCss'
import { emitCascade, MEDIA_DESKTOP_ONLY, MEDIA_MOBILE, MEDIA_TABLET_ONLY } from './cssEmit'
import { designLeaves } from './cssLeaves'
import { safeScopeId } from './sanitize'
import type { DesignV2 } from './types'

/**
 * Emits the scoped CSS for one element as a string, ready for a <style> tag.
 *
 * Every rule targets [data-eid="scopeId"] on the element, so nothing leaks to
 * other elements. Output order: cascade rules (normal, hover, tablet, mobile),
 * then per-device hiding, then custom CSS last. Returns '' when the scope id
 * is not safe or the design sets nothing.
 */
export function designToCss(design: DesignV2, scopeId: string): string {
  const id = safeScopeId(scopeId)
  if (!id || !design || typeof design !== 'object') return ''
  const sel = `[data-eid="${id}"]`
  const visibility = design.visibility
  let css = emitCascade(designLeaves(design), sel)
  if (visibility?.hideTablet === true) css += `@media ${MEDIA_TABLET_ONLY}{${sel}{display:none}}`
  if (visibility?.hideDesktop === true) css += `@media ${MEDIA_DESKTOP_ONLY}{${sel}{display:none}}`
  if (visibility?.hideMobile === true) css += `@media ${MEDIA_MOBILE}{${sel}{display:none}}`
  css += scopeCustomCss(design.customCss, sel)
  return css
}
