import type { EditorField, ShowIf } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 47: one Card element. It replaces the three marketing boxes (icon box, image box, flip box) for new
 * pages: those are now options of one card, not separate widgets. The old three stay in wave26Defs.ts with
 * `hidden: true`, so saved pages keep rendering and the library no longer offers them.
 *
 * Renderer lives in src/components/blocks/elements/Wave47Elements.tsx and its motion and layout styles in
 * wave47.css. Icons are String.fromCodePoint escapes so this file stays ASCII.
 */

const opts = (...values: string[]) => values.map((v) => ({ label: v.charAt(0).toUpperCase() + v.slice(1).replace(/-/g, ' '), value: v }))
const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))
const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const select = (name: string, label: string, options: { label: string; value: string }[], extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'select', width: 'half', options, ...extra })
/** Range slider for a numeric prop. Stores a plain number. min/max mirror the renderer's clamp. */
const slider = (name: string, label: string, min: number, max: number, step = 1, helpText?: string): EditorField => ({ name, label, type: 'range', width: 'half', min, max, step, helpText })
const color = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'color', width: 'half', helpText })

const FLIP_ONLY = 'Used only when Hover effect is Flip.'
const WHEN_ICON: ShowIf = { field: 'media', equals: 'icon' }
const WHEN_IMAGE: ShowIf = { field: 'media', equals: 'image' }
const WHEN_FLIP: ShowIf = { field: 'hoverEffect', equals: 'flip' }

export const WAVE47_ELEMENTS: ElementDef[] = [
  {
    type: 'card', label: 'Card', icon: String.fromCodePoint(0x1f0cf), category: 'marketing',
    description: 'A card with an optional icon or picture, a title, text and a link. It can lift, zoom its picture or flip over on hover or focus.',
    fields: [
      select('media', 'Media', labelled([['none', 'None'], ['icon', 'Icon'], ['image', 'Image']]), { helpText: 'Show an icon or a picture at the top (or beside the text).' }),
      { name: 'icon', label: 'Icon (when Media is Icon)', type: 'icon', iconSet: 'builtin', showIf: WHEN_ICON },
      { name: 'image', label: 'Image (when Media is Image)', type: 'media', showIf: WHEN_IMAGE },
      { ...select('imageRatio', 'Image shape', labelled([['auto', 'Original'], ['1:1', '1:1'], ['4:3', '4:3'], ['16:9', '16:9']])), showIf: WHEN_IMAGE },
      { ...select('imageFit', 'Image fit', opts('cover', 'contain')), showIf: WHEN_IMAGE },
      text('title', 'Title'),
      select('titleTag', 'Title tag', labelled([['h2', 'H2'], ['h3', 'H3'], ['h4', 'H4'], ['h5', 'H5'], ['h6', 'H6'], ['p', 'Paragraph']])),
      area('text', 'Text'),
      { name: 'link', label: 'Link (optional)', type: 'link', helpText: 'Makes the whole card a link. Put no other links inside it.' },
      text('linkLabel', 'Link label', { helpText: 'Shown at the foot of the card when a link is set. Leave empty for none.' }),
      select('layout', 'Layout', opts('top', 'left', 'right'), { helpText: 'Left and right put the media beside the text. Under 640px they stack.' }),
      select('align', 'Alignment', labelled([['left', 'Left'], ['centre', 'Centre']])),
      { ...slider('iconSize', 'Icon size (px)', 16, 120, 1, 'Used only when Media is Icon.'), showIf: WHEN_ICON },
      { ...color('iconColour', 'Icon colour'), showIf: WHEN_ICON },
      color('bgColour', 'Background colour'),
      slider('borderRadius', 'Corner radius (px)', 0, 40),
      select('shadow', 'Shadow', opts('none', 'sm', 'md', 'lg')),
      select('hoverEffect', 'Hover effect', labelled([['none', 'None'], ['lift', 'Lift'], ['zoom-image', 'Zoom image'], ['flip', 'Flip']]), { helpText: 'Hover or keyboard focus. Motion is off for visitors who ask for reduced motion.' }),
      text('backTitle', 'Back: title', { helpText: FLIP_ONLY, showIf: WHEN_FLIP }),
      { ...area('backText', 'Back: text', FLIP_ONLY), showIf: WHEN_FLIP },
      { ...color('backColour', 'Back: background colour', FLIP_ONLY), showIf: WHEN_FLIP },
    ],
    defaultProps: () => ({
      media: 'none', icon: 'star', imageRatio: '16:9', imageFit: 'cover',
      title: 'Card title', titleTag: 'h3', text: 'A short description of this card.', linkLabel: 'Read more',
      layout: 'top', align: 'left', iconSize: 40, iconColour: '#2e3192', bgColour: '#ffffff',
      borderRadius: 8, shadow: 'sm', hoverEffect: 'none',
      backTitle: 'More', backText: 'Extra detail goes here.', backColour: '#2e3192',
    }),
  },
]
