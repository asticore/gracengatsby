import type { BlockStyle, HoverTransformPreset } from '@/lib/blockStyle'

/** State tabs of the "Hover & focus" accordion. */
export type DesignState = 'normal' | 'hover' | 'focus'

export const DESIGN_STATES: { value: DesignState; label: string }[] = [
  { value: 'normal', label: 'Normal' },
  { value: 'hover', label: 'Hover' },
  { value: 'focus', label: 'Focus' },
]

export const HOVER_TRANSFORM_OPTIONS: { label: string; value: HoverTransformPreset }[] = [
  { label: 'None', value: 'none' },
  { label: 'Lift', value: 'lift' },
  { label: 'Scale', value: 'scale' },
]

/** Keys edited on each non-normal tab. */
export const STATE_KEYS: Record<Exclude<DesignState, 'normal'>, readonly (keyof BlockStyle)[]> = {
  hover: [
    'hoverBgColor', 'hoverTextColor', 'hoverBorderColor', 'hoverBoxShadow', 'hoverBorderRadius', 'hoverTransitionMs',
    'hoverOpacity', 'hoverTransform',
  ],
  focus: ['focusRing'],
}

/** Whether any key of the given state tab is set (drives the dot on the tab). */
export function stateModified(style: BlockStyle, state: DesignState): boolean {
  if (state === 'normal') return false
  return STATE_KEYS[state].some((k) => style[k] !== undefined)
}
