import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 44: one site-wide element, `page-effects`. It switches on whole-page effects (smooth scrolling, page fades
 * between pages, a film-grain overlay, a scroll progress bar) for the page it sits on. It renders nothing visible
 * in the flow: a small wrapper with a <style> tag of clamped, static CSS. Renderer lives in
 * src/components/blocks/elements/Wave44Elements.tsx and its motion and overlay styles in wave44.css.
 *
 * The category is siteMeta, like the wave 38 site elements. The editor canvas shows a placeholder card for it
 * (CanvasBlockPreview), because the live effect cannot be seen in the editor.
 *
 * Icons are String.fromCodePoint escapes so this file stays ASCII.
 */

const check = (name: string, label: string, helpText: string): EditorField => ({ name, label, type: 'checkbox', helpText })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step: number, helpText: string): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step, helpText })
const color = (name: string, label: string, helpText: string): EditorField => ({ name, label, type: 'color', width: 'half', helpText })

const WHOLE_PAGE = 'Applies to the whole page. Put this element anywhere on the page, once.'

export const WAVE44_ELEMENTS: ElementDef[] = [
  {
    type: 'page-effects', label: 'Page effects', icon: String.fromCodePoint(0x2728), category: 'siteMeta',
    description: 'Whole-page effects: smooth scrolling, fades between pages, a grain overlay, a scroll progress bar and a custom cursor ring. Each one is off until you turn it on. Nothing shows in the editor, only on the live page.',
    fields: [
      check('smoothScroll', 'Smooth scrolling', `${WHOLE_PAGE} Clicking an in-page link scrolls smoothly. Off for visitors who ask for reduced motion.`),
      check('pageTransition', 'Fade between pages', `${WHOLE_PAGE} Pages fade when a visitor moves between them. Browsers without view transitions change pages as usual.`),
      slider('transitionMs', 'Fade length (ms)', 100, 600, 10, 'How long the page fade takes, from 100 to 600 milliseconds. Used only when fades are on.'),
      check('grain', 'Grain overlay', `${WHOLE_PAGE} A fine film-grain texture over the page. Clicks pass through it.`),
      slider('grainOpacity', 'Grain strength (%)', 1, 30, 1, 'How strong the grain is, from 1% (faint) to 30% (heavy). Used only when the grain is on.'),
      check('scrollProgress', 'Scroll progress bar', `${WHOLE_PAGE} A thin bar across the top fills as the visitor scrolls. Browsers without scroll-linked animation show no bar.`),
      {
        name: 'cursor', label: 'Custom cursor', type: 'select', width: 'half',
        options: [
          { label: 'Off (normal cursor)', value: 'none' },
          { label: 'Ring', value: 'ring' },
          { label: 'Dot and ring', value: 'dot-ring' },
        ],
        helpText: `${WHOLE_PAGE} Live page only. A ring follows the pointer and grows over links and buttons. Not shown on touch screens or for visitors who ask for reduced motion.`,
      },
      slider('cursorSize', 'Cursor size (px)', 16, 80, 2, 'Width of the cursor ring, from 16 to 80 pixels. Used only when a custom cursor is on.'),
      color('cursorColor', 'Cursor colour', 'The colour of the ring and dot. Used only when a custom cursor is on.'),
      check('cursorHideNative', 'Hide the normal cursor', 'Hides the normal arrow while the custom cursor is active. Leave off to keep both. Never applies on touch screens or with reduced motion.'),
      color('progressColor', 'Progress bar colour', 'The colour of the scroll progress bar. Used only when the bar is on.'),
      slider('progressHeight', 'Progress bar height (px)', 1, 8, 1, 'How thick the scroll progress bar is, from 1 to 8 pixels. Used only when the bar is on.'),
    ],
    defaultProps: () => ({
      smoothScroll: false, pageTransition: false, transitionMs: 250,
      grain: false, grainOpacity: 8,
      scrollProgress: false, progressColor: '#2e3192', progressHeight: 4,
      cursor: 'none', cursorSize: 32, cursorColor: '#2e3192', cursorHideNative: false,
    }),
  },
]
