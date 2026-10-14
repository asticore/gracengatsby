import type { Leaf } from './cssGetters'

/**
 * Writes the device and state rules for a list of declarations.
 *
 * A declaration is written for a device only when its resolved value differs
 * from the next wider device (for the same state). That keeps output compact.
 * Hover is compared against the wider device's hover value, so a narrower
 * normal value still wins on hover where it should. Rules come out in this
 * order: desktop normal, desktop hover, tablet normal, tablet hover, mobile
 * normal, mobile hover. Later rules win at equal specificity, so each
 * narrower block overrides the wider ones above it.
 */

export const MEDIA_TABLET = '(max-width:1024px)'
export const MEDIA_MOBILE = '(max-width:767px)'
export const MEDIA_DESKTOP_ONLY = '(min-width:1025px)'
export const MEDIA_TABLET_ONLY = '(min-width:768px) and (max-width:1024px)'

const decl = (prop: string, value: string): string => `${prop}:${value}`

function rule(selector: string, declarations: string[]): string {
  return declarations.length > 0 ? `${selector}{${declarations.join(';')}}` : ''
}

function media(query: string, inner: string): string {
  return inner ? `@media ${query}{${inner}}` : ''
}

export function emitCascade(leaves: Leaf[], sel: string): string {
  const hover = `${sel}:hover`
  const dNormal: string[] = []
  const dHover: string[] = []
  const tNormal: string[] = []
  const tHover: string[] = []
  const mNormal: string[] = []
  const mHover: string[] = []

  for (const l of leaves) {
    const dn = l.get('desktop', 'normal')
    const dh = l.get('desktop', 'hover')
    const tn = l.get('tablet', 'normal')
    const th = l.get('tablet', 'hover')
    const mn = l.get('mobile', 'normal')
    const mh = l.get('mobile', 'hover')
    // The hover value that applies on hover at this width, before any rule for this width is written.
    // A hover rule from a wider width wins over a normal rule (higher specificity), so it is the one to beat.
    let override: string | undefined
    if (dn !== undefined) dNormal.push(decl(l.prop, dn))
    if (dh !== undefined && dh !== dn) {
      dHover.push(decl(l.prop, dh))
      override = dh
    }
    if (tn !== undefined && tn !== dn) tNormal.push(decl(l.prop, tn))
    if (th !== undefined && th !== (override ?? tn)) {
      tHover.push(decl(l.prop, th))
      override = th
    }
    if (mn !== undefined && mn !== tn) mNormal.push(decl(l.prop, mn))
    if (mh !== undefined && mh !== (override ?? mn)) mHover.push(decl(l.prop, mh))
  }

  return (
    rule(sel, dNormal) +
    rule(hover, dHover) +
    media(MEDIA_TABLET, rule(sel, tNormal) + rule(hover, tHover)) +
    media(MEDIA_MOBILE, rule(sel, mNormal) + rule(hover, mHover))
  )
}
