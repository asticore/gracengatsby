import type { EditorField } from './fieldTypes'
import type { ElementDef } from './registry'

/**
 * Wave 65: business-hours, slides (client, Wave65Elements.tsx) and author-box, post-navigation, language-switcher
 * (server, Wave65Server.tsx, registered as site elements). Styles: wave65.css. Icons are String.fromCodePoint escapes.
 */

const text = (name: string, label: string, extra: Partial<EditorField> = {}): EditorField => ({ name, label, type: 'text', ...extra })
const area = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'textarea', helpText })
const check = (name: string, label: string, helpText?: string): EditorField => ({ name, label, type: 'checkbox', helpText })
const labelled = (pairs: [string, string][]) => pairs.map(([value, label]) => ({ label, value }))
const DAYS = labelled([['mon', 'Monday'], ['tue', 'Tuesday'], ['wed', 'Wednesday'], ['thu', 'Thursday'], ['fri', 'Friday'], ['sat', 'Saturday'], ['sun', 'Sunday']])

const hoursRow = (day: string, open = '09:00', close = '17:00', closed = false) => ({ day, open, close, closed })

export const WAVE65_ELEMENTS: ElementDef[] = [
  {
    type: 'business-hours', label: 'Business hours', icon: String.fromCodePoint(0x1f552), category: 'interactive',
    description: 'Opening hours by day. Today is highlighted, and an "Open now" note shows when the time zone is set.',
    fields: [
      text('title', 'Title'),
      {
        name: 'rows', label: 'Days', type: 'repeater',
        repeater: { fields: [
          { name: 'day', label: 'Day', type: 'select', width: 'half', options: DAYS },
          text('open', 'Opens', { width: 'half', helpText: '24 hour time, like 09:00.' }),
          text('close', 'Closes', { width: 'half', helpText: '24 hour time, like 17:30.' }),
          check('closed', 'Closed all day'),
        ] },
      },
      text('timezone', 'Time zone', { helpText: 'Optional, like Australia/Sydney. Used to find today and the Open now note. Leave empty to use the visitor time.' }),
      check('showStatus', 'Show Open now / Closed note'),
    ],
    defaultProps: () => ({
      title: 'Opening hours',
      rows: [hoursRow('mon'), hoursRow('tue'), hoursRow('wed'), hoursRow('thu'), hoursRow('fri'), hoursRow('sat', '10:00', '14:00'), hoursRow('sun', '', '', true)],
      timezone: '', showStatus: true,
    }),
  },
  {
    type: 'slides', label: 'Slides', icon: String.fromCodePoint(0x1f3a0), category: 'media',
    description: 'A hero slider of 2 to 6 slides, each with a heading, text, button and background picture. Arrows, dots and keyboard keys. Autoplay is off by default and stops on hover.',
    fields: [
      {
        name: 'items', label: 'Slides (2 to 6)', type: 'repeater',
        repeater: { fields: [
          text('heading', 'Heading'),
          area('text', 'Text'),
          text('buttonLabel', 'Button label', { width: 'half' }),
          text('buttonUrl', 'Button link', { width: 'half' }),
          { name: 'image', label: 'Background picture', type: 'media' },
          text('imageUrl', 'Or picture address', { helpText: 'Used when no picture is chosen above.' }),
        ] },
      },
      check('autoplay', 'Autoplay', 'Off by default. Always stops on hover, on focus and for visitors who prefer reduced motion.'),
      { name: 'interval', label: 'Seconds per slide', type: 'number', width: 'half' },
      { name: 'height', label: 'Height (px)', type: 'number', width: 'half' },
    ],
    defaultProps: () => ({
      items: [
        { heading: 'Welcome', text: 'A short line about what you do.', buttonLabel: 'Learn more', buttonUrl: '/about' },
        { heading: 'Our work', text: 'Show off a project or an offer.', buttonLabel: 'See more', buttonUrl: '/contact' },
      ],
      autoplay: false, interval: 6, height: 420,
    }),
  },
  {
    type: 'author-box', label: 'Author box', icon: String.fromCodePoint(0x1f464), category: 'siteMeta',
    description: 'Author name, short bio and picture. On a post the name fills in from the post author; anything you type overrides it.',
    fields: [
      text('name', 'Name', { helpText: 'Leave empty to use the post author.' }),
      area('bio', 'Bio'),
      text('avatarUrl', 'Picture address'),
      text('label', 'Label', { width: 'half' }),
    ],
    defaultProps: () => ({ name: '', bio: '', avatarUrl: '', label: 'Written by' }),
  },
  {
    type: 'post-navigation', label: 'Post navigation', icon: String.fromCodePoint(0x2194), category: 'siteMeta',
    description: 'Links to the previous and next published blog post. Hidden on other pages.',
    fields: [text('prevLabel', 'Previous label', { width: 'half' }), text('nextLabel', 'Next label', { width: 'half' })],
    defaultProps: () => ({ prevLabel: 'Previous post', nextLabel: 'Next post' }),
  },
  {
    type: 'language-switcher', label: 'Language switcher', icon: String.fromCodePoint(0x1f310), category: 'siteMeta',
    description: 'Links to this page in each active language. Hidden when Multilingual is off or only one language is active.',
    fields: [text('label', 'Accessible label', { width: 'half' })],
    defaultProps: () => ({ label: 'Language' }),
  },
]

/** Types rendered on the server by SiteElement. */
export const WAVE65_SERVER_TYPES = ['author-box', 'post-navigation', 'language-switcher']
