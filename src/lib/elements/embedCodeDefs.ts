import type { ElementDef } from './registry'

/**
 * Embed code (third-party script). Server rendered (SITE_ELEMENT_TYPES) because it reads the page path from the
 * block context. Renderer: src/components/blocks/elements/EmbedCodeServer.tsx; design notes: src/lib/embedCode.ts.
 */
export const EMBED_CODE_ELEMENTS: ElementDef[] = [
  {
    type: 'embed-code', label: 'Embed code (third-party script)', icon: '</>', category: 'media',
    description: 'Paste a widget snippet (reviews, booking, calendar, social wall, form). It runs in an isolated frame after the visitor consents.',
    fields: [
      {
        name: 'snippet', label: 'Embed code', type: 'textarea',
        helpText: 'WARNING: scripts in this code run third-party code on your site (inside a sandboxed frame that cannot read your cookies). Only paste code from a provider you trust. Save and publish the page: the code is only served from published pages.',
      },
      { name: 'title', label: 'Title (for screen readers)', type: 'text', helpText: 'Describes the embedded content, e.g. "Booking calendar".' },
      { name: 'height', label: 'Height in px', type: 'number', width: 'half', helpText: 'Leave empty or 0 to resize automatically.' },
      {
        name: 'consentCategory', label: 'Consent needed', type: 'select', width: 'half',
        options: [{ label: 'Marketing cookies', value: 'marketing' }, { label: 'Analytics cookies', value: 'analytics' }, { label: 'Preferences cookies', value: 'preferences' }],
      },
    ],
    defaultProps: () => ({ snippet: '', title: '', height: 0, consentCategory: 'marketing' }),
  },
]
