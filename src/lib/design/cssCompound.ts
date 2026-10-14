import { resolveValue } from './cascade'
import { cssNumber, lengthToCss, safeColor, safeLength, safeNumber, safeUrl } from './sanitize'
import type { Getter, Leaf } from './cssGetters'
import type { Breakpoint, DesignV2, Length, Rs, Shadow, StateName, Transform } from './types'

/**
 * Declarations built from several fields at once (a shadow is x, y, blur,
 * spread and colour; a transform is a list of functions). Each returns the
 * whole value for one device and state, or undefined when nothing is set.
 */

const DEFAULT_SHADOW_COLOR = 'rgba(0, 0, 0, 0.2)'

const at = <T>(r: Rs<T> | undefined, bp: Breakpoint, st: StateName): T | undefined => resolveValue(r, bp, st)

function lengthAt(r: Rs<Length> | undefined, bp: Breakpoint, st: StateName): string | undefined {
  return lengthToCss(safeLength(at(r, bp, st)))
}

/** One shadow layer as "[inset] x y blur [spread] colour", or undefined when nothing is set. */
function shadowLayer(shadow: Shadow, bp: Breakpoint, st: StateName, withSpread: boolean): string | undefined {
  const x = lengthAt(shadow.x, bp, st)
  const y = lengthAt(shadow.y, bp, st)
  const blur = lengthAt(shadow.blur, bp, st)
  const spread = withSpread ? lengthAt(shadow.spread, bp, st) : undefined
  const color = safeColor(at(shadow.color, bp, st))
  if (x === undefined && y === undefined && blur === undefined && spread === undefined && color === undefined) return undefined
  const parts = [
    withSpread && shadow.inset ? 'inset' : null,
    x ?? '0px',
    y ?? '0px',
    blur ?? '0px',
    withSpread ? (spread ?? null) : null,
    color ?? DEFAULT_SHADOW_COLOR,
  ]
  return parts.filter((p): p is string => p !== null).join(' ')
}

/** The box-shadow leaf. The v2 model has one shadow, so there is one layer. */
export function boxShadowLeaf(shadow: Shadow | undefined): Leaf {
  const get: Getter = (bp, st) => (shadow ? shadowLayer(shadow, bp, st, true) : undefined)
  return { prop: 'box-shadow', get }
}

export function textShadowLeaf(shadow: Shadow | undefined): Leaf {
  const get: Getter = (bp, st) => (shadow ? shadowLayer(shadow, bp, st, false) : undefined)
  return { prop: 'text-shadow', get }
}

/** Text stroke: "width colour". Needs a width to draw anything. */
export function textStrokeLeaf(stroke: { width?: Rs<Length>; color?: Rs<string> } | undefined): Leaf {
  const get: Getter = (bp, st) => {
    if (!stroke) return undefined
    const width = lengthAt(stroke.width, bp, st)
    if (width === undefined) return undefined
    return `${width} ${safeColor(at(stroke.color, bp, st)) ?? 'currentColor'}`
  }
  return { prop: '-webkit-text-stroke', get }
}

/** Transform list: translate, rotate, skew, scale (flips folded into scale). Order is fixed. */
export function transformLeaf(t: Transform | undefined): Leaf {
  const get: Getter = (bp, st) => {
    if (!t) return undefined
    const parts: string[] = []
    const ox = lengthAt(t.offsetX, bp, st)
    const oy = lengthAt(t.offsetY, bp, st)
    if (ox !== undefined || oy !== undefined) parts.push(`translate(${ox ?? '0px'},${oy ?? '0px'})`)
    const rotate = safeNumber(at(t.rotate, bp, st), -3600, 3600)
    if (rotate !== undefined) parts.push(`rotate(${cssNumber(rotate)}deg)`)
    const skewX = safeNumber(at(t.skewX, bp, st), -180, 180)
    const skewY = safeNumber(at(t.skewY, bp, st), -180, 180)
    if (skewX !== undefined || skewY !== undefined) {
      parts.push(`skew(${cssNumber(skewX ?? 0)}deg,${cssNumber(skewY ?? 0)}deg)`)
    }
    const scaleX = safeNumber(at(t.scaleX, bp, st), -100, 100)
    const scaleY = safeNumber(at(t.scaleY, bp, st), -100, 100)
    const flipH = at(t.flipH, bp, st)
    const flipV = at(t.flipV, bp, st)
    if (scaleX !== undefined || scaleY !== undefined || flipH !== undefined || flipV !== undefined) {
      const sx = (scaleX ?? 1) * (flipH === true ? -1 : 1)
      const sy = (scaleY ?? 1) * (flipV === true ? -1 : 1)
      parts.push(`scale(${cssNumber(sx)},${cssNumber(sy)})`)
    }
    return parts.length > 0 ? parts.join(' ') : undefined
  }
  return { prop: 'transform', get }
}

/** Background image: a gradient, or an image with an optional dark overlay layer. */
export function backgroundImageLeaf(bg: NonNullable<DesignV2['background']>): Leaf {
  const get: Getter = (bp, st) => {
    if (bg.type === 'gradient') {
      const from = safeColor(at(bg.gradient?.from, bp, st)) ?? 'transparent'
      const to = safeColor(at(bg.gradient?.to, bp, st)) ?? 'transparent'
      const angle = safeNumber(at(bg.gradient?.angle, bp, st), -3600, 3600) ?? 180
      return `linear-gradient(${cssNumber(angle)}deg, ${from}, ${to})`
    }
    if (bg.type === 'image') {
      const url = safeUrl(at(bg.imageUrl, bp, st))
      if (!url) return undefined
      const layers: string[] = []
      const overlay = safeNumber(at(bg.overlay, bp, st), 0, 100)
      if (overlay !== undefined && overlay > 0) {
        const alpha = cssNumber(overlay / 100)
        layers.push(`linear-gradient(rgba(0, 0, 0, ${alpha}), rgba(0, 0, 0, ${alpha}))`)
      }
      layers.push(`url("${url}")`)
      return layers.join(', ')
    }
    return undefined
  }
  return { prop: 'background-image', get }
}

/** Flex container: "display:flex" appears when any container field is set at that device and state. */
export function containerDisplayLeaf(children: Leaf[]): Leaf {
  return {
    prop: 'display',
    get: (bp, st) => (children.some((child) => child.get(bp, st) !== undefined) ? 'flex' : undefined),
  }
}
