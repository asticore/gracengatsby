import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { featureToggleField } from '../features/featureToggleField'

/**
 * The sidebar and dashboard are server-rendered from these feature flags, so a
 * save has to drop whatever Next has cached for the admin route or the old menu
 * survives until the next hard navigation. Imported lazily and swallowed on
 * failure because the same hook runs from seeds and the CLI, where there is no
 * request scope for `revalidatePath` to act on.
 */
const revalidateAdmin = async (adminRoute: string): Promise<void> => {
  try {
    const { revalidatePath } = await import('next/cache')
    revalidatePath(adminRoute || '/admin', 'layout')
  } catch {
    // Not inside a request - nothing is cached to drop.
  }
}

export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  dbName: 'eg_site_settings',
  label: 'General',
  hooks: {
    afterChange: [
      async ({ req }) => {
        await revalidateAdmin(req?.payload?.config?.routes?.admin ?? '/admin')
      },
    ],
  },
  admin: {
    group: 'Settings',
    description:
      'Site identity, theme, SEO defaults, and feature toggles. Header/menu and footer are their own sections below.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'siteName',
      type: 'text',
      defaultValue: 'Grace & Gatsby',
    },
    {
      name: 'tagline',
      type: 'text',
      defaultValue: 'A curated boutique for the modern romantic.',
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Used in the header and footer (each can be toggled off independently).' },
    },
    {
      name: 'favicon',
      type: 'upload',
      relationTo: 'media',
    },
    {
      type: 'group',
      name: 'theme',
      label: 'Theme',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'primaryColor', type: 'text', defaultValue: '#14110f', admin: { width: '33%', description: 'Ink / text color.' } },
            { name: 'accentColor', type: 'text', defaultValue: '#b9924b', admin: { width: '33%', description: 'Buttons, links, highlights.' } },
            { name: 'backgroundColor', type: 'text', defaultValue: '#f6f1e7', admin: { width: '33%', description: 'Page background.' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'headingFont',
              type: 'select',
              defaultValue: 'cormorant',
              admin: { width: '50%' },
              options: [
                { label: 'Cormorant Garamond (elegant serif)', value: 'cormorant' },
                { label: 'Playfair Display (bold serif)', value: 'playfair' },
                { label: 'Cinzel (Art Deco display)', value: 'cinzel' },
              ],
            },
            {
              name: 'bodyFont',
              type: 'select',
              defaultValue: 'jost',
              admin: { width: '50%' },
              options: [
                { label: 'Jost (geometric sans)', value: 'jost' },
                { label: 'Montserrat', value: 'montserrat' },
                { label: 'Inter', value: 'inter' },
              ],
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'buttonStyle',
              type: 'select',
              defaultValue: 'solid',
              admin: { width: '33%' },
              options: [
                { label: 'Solid', value: 'solid' },
                { label: 'Outline', value: 'outline' },
                { label: 'Pill', value: 'pill' },
              ],
            },
            {
              name: 'cornerStyle',
              type: 'select',
              defaultValue: 'soft',
              admin: { width: '33%' },
              options: [
                { label: 'Sharp corners', value: 'sharp' },
                { label: 'Soft corners', value: 'soft' },
                { label: 'Rounded', value: 'round' },
              ],
            },
            {
              name: 'hoverEffect',
              type: 'select',
              defaultValue: 'fade',
              admin: { width: '33%' },
              options: [
                { label: 'None', value: 'none' },
                { label: 'Fade', value: 'fade' },
                { label: 'Underline', value: 'underline' },
                { label: 'Color shift', value: 'color-shift' },
                { label: 'Lift', value: 'lift' },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'seo',
      label: 'SEO Defaults',
      admin: { description: 'Fallbacks used when a page/post/product does not set its own SEO fields.' },
      fields: [
        {
          name: 'titleTemplate',
          type: 'text',
          defaultValue: '%s | Grace & Gatsby',
          admin: { description: 'Use %s where the page title should go.' },
        },
        { name: 'defaultDescription', type: 'textarea' },
        { name: 'defaultOgImage', type: 'upload', relationTo: 'media' },
        { name: 'twitterHandle', type: 'text' },
        { name: 'siteIndexable', type: 'checkbox', defaultValue: true, admin: { description: 'Turn off to ask search engines not to index the whole site (useful pre-launch).' } },
      ],
    },
    featureToggleField,
  ],
}
