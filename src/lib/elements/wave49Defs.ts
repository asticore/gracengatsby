import { RATIO_OPTIONS } from '@/components/blocks/elements/elementUtil'

import type { EditorField, ShowIf } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 49: one Gallery element. It replaces the three picture widgets (image gallery, image carousel, logo strip)
 * for new pages: those are now layouts of one gallery. The old three stay in wave26Defs.ts with `hidden: true`, so
 * saved pages keep rendering and the library no longer offers them.
 *
 * Renderer lives in src/components/blocks/elements/Wave49Elements.tsx, its interactive parts (carousel autoplay,
 * lightbox) in Wave49Client.tsx, and its styles in wave49.css. Icons are String.fromCodePoint escapes so this file
 * stays ASCII.
 */

const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1, helpText?: string): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step, helpText })

const WHEN_CAROUSEL: ShowIf = { field: 'layout', equals: 'carousel' }

export const WAVE49_ELEMENTS: ElementDef[] = [
  {
    type: 'gallery', label: 'Gallery', icon: String.fromCodePoint(0x1f5bc), category: 'media',
    description: 'Pictures as a grid, a masonry wall, a carousel or a row of logos. Pictures can open in a larger view.',
    fields: [
      select('layout', 'Layout', labelled([['grid', 'Grid'], ['masonry', 'Masonry'], ['carousel', 'Carousel'], ['logos', 'Logo strip']])),
      { name: 'images', label: 'Pictures', type: 'mediaMulti' },
      area('urls', 'Or picture addresses', 'One per line: "https://... | alt text". Added after the pictures chosen above.'),
      slider('columns', 'Columns (1-6)', 1, 6, 1, 'Grid and masonry: columns. Carousel: pictures visible at once. Not used by the logo strip.'),
      slider('gap', 'Space between pictures (px)', 0, 48),
      select('ratio', 'Shape', RATIO_OPTIONS, { helpText: 'Not used by masonry or the logo strip.' }),
      select('fit', 'Fit', labelled([['cover', 'Fill the shape (crop)'], ['contain', 'Fit inside (no crop)']])),
      select('grayscale', 'Greyscale', labelled([['auto', 'Automatic (logo strip only)'], ['on', 'On until hovered'], ['off', 'Off']]), { helpText: 'Greyscale pictures show their colour on hover or focus.' }),
      { name: 'lightbox', label: 'Open pictures in a larger view', type: 'checkbox', helpText: 'Not used by the logo strip. Escape closes the view.' },
      { name: 'captions', label: 'Show alt text as captions', type: 'checkbox' },
      { ...text('label', 'Accessible name (carousel)'), showIf: WHEN_CAROUSEL },
      { name: 'autoplay', label: 'Autoplay (carousel)', type: 'checkbox', showIf: WHEN_CAROUSEL, helpText: 'Off when the visitor asks for reduced motion. Visitors can pause it.' },
    ],
    defaultProps: () => ({
      layout: 'grid', images: [], urls: '', columns: 3, gap: 12, ratio: '1:1', fit: 'cover', grayscale: 'auto',
      lightbox: true, captions: false, label: 'Image gallery', autoplay: false,
    }),
  },
]
