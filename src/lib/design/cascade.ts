import type { Breakpoint, Responsive, Rs, Stated, StateName } from './types'

/**
 * Device cascade: a value set on desktop applies everywhere; a value set on
 * tablet overrides it at tablet width and below; a value set on mobile
 * overrides both at mobile width. A missing narrower value falls back to the
 * next wider one.
 */
export const DEVICE_ORDER: Breakpoint[] = ['desktop', 'tablet', 'mobile']

/** The devices that apply at a breakpoint, from the breakpoint itself out to desktop. */
export function deviceChain(breakpoint: Breakpoint): Breakpoint[] {
  if (breakpoint === 'mobile') return ['mobile', 'tablet', 'desktop']
  if (breakpoint === 'tablet') return ['tablet', 'desktop']
  return ['desktop']
}

/**
 * Resolves a plain responsive value (no state) for a breakpoint.
 * Returns undefined when no device in the chain has a value.
 */
export function resolveResponsive<T>(responsive: Responsive<T> | undefined, breakpoint: Breakpoint): T | undefined {
  if (!responsive) return undefined
  for (const device of deviceChain(breakpoint)) {
    const value = responsive[device]
    if (value !== undefined) return value
  }
  return undefined
}

/**
 * Resolves a stated, responsive value for a breakpoint and state.
 *
 * Per device, hover uses its own hover value, else its own normal value. The
 * device chain is walked narrower to wider, so a mobile normal value beats a
 * desktop hover value on mobile (touch screens have no real hover).
 */
export function resolveValue<T>(responsive: Rs<T> | undefined, breakpoint: Breakpoint, state: StateName = 'normal'): T | undefined {
  if (!responsive) return undefined
  for (const device of deviceChain(breakpoint)) {
    const stated: Stated<T> | undefined = responsive[device]
    if (!stated) continue
    if (state === 'hover' && stated.hover !== undefined) return stated.hover
    if (stated.normal !== undefined) return stated.normal
  }
  return undefined
}
