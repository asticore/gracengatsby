import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 67: social feed. Server rendered (registered in SITE_ELEMENT_TYPES) from an account connected under
 * Integrations > Social accounts. The renderer is src/components/blocks/elements/Wave67Server.tsx.
 */

const check = (name: string, label: string): EditorField => ({ name, label, type: 'checkbox' })
const choices = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))

export const SOCIAL_FEED_LIMIT = 24

export const WAVE67_ELEMENTS: ElementDef[] = [
  {
    type: 'social-feed', label: 'Social feed', icon: String.fromCodePoint(0x1f4f7), category: 'media',
    description: 'Recent posts from an Instagram, Facebook, Pinterest, TikTok, YouTube or RSS account connected under Integrations. Cards link to the original post.',
    fields: [
      {
        name: 'account', label: 'Account', type: 'select', optionsUrl: '/api/admin-social-accounts', options: [],
        helpText: 'Connect accounts under Settings > Integrations > Social accounts.',
      },
      { name: 'layout', label: 'Layout', type: 'select', width: 'half', options: choices([['grid', 'Grid'], ['list', 'List'], ['carousel', 'Carousel']]) },
      { name: 'columns', label: 'Columns', type: 'range', width: 'half', min: 1, max: 6, step: 1, showIf: { field: 'layout', in: ['grid', 'carousel'] } },
      { name: 'limit', label: 'Number of posts', type: 'range', width: 'half', min: 1, max: SOCIAL_FEED_LIMIT, step: 1 },
      { name: 'aspect', label: 'Image shape', type: 'select', width: 'half', options: choices([['square', 'Square'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]) },
      check('showCaption', 'Show the caption'),
      check('showDate', 'Show the date'),
      check('showLikes', 'Show likes (where the provider shares them)'),
      check('newTab', 'Open posts in a new tab'),
    ],
    defaultProps: () => ({ account: '', layout: 'grid', columns: 3, limit: 9, aspect: 'square', showCaption: true, showDate: false, showLikes: false, newTab: true }),
  },
]
