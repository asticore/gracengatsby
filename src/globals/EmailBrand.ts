import type { GlobalConfig } from '@/engine'

import { DEFAULT_EMAIL_BRAND, EMAIL_FONT_OPTIONS } from '@/features/email/design/brand'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * The brand every designed email is wrapped in: logo, colours, font and footer.
 * Used only by emails that have a design (see Email design) or when the layout is switched on here.
 * Defaults match the built-in look, so a fresh install changes no email.
 */
export const EmailBrand: GlobalConfig = {
  slug: 'email-brand',
  label: 'Email design',
  dbName: 'eg_email_brand',
  admin: {
    group: 'Settings',
    description: 'The logo, colours, font and footer used by designed emails.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      label: 'Use this layout for emails without a design',
      defaultValue: DEFAULT_EMAIL_BRAND.enabled,
      admin: { description: 'Off keeps the plain look for emails you have not designed. Designed emails always use their design.' },
    },
    {
      name: 'logo',
      type: 'relationship',
      relationTo: 'media',
      label: 'Logo',
      admin: { description: 'Shown at the top of designed emails. Leave blank for no logo.' },
    },
    {
      name: 'logoWidth',
      type: 'number',
      label: 'Logo width (pixels)',
      defaultValue: DEFAULT_EMAIL_BRAND.logoWidth,
      admin: { description: 'How wide the logo is shown, from 40 to 400 pixels.' },
    },
    {
      name: 'accent',
      type: 'text',
      label: 'Button and link colour',
      defaultValue: DEFAULT_EMAIL_BRAND.accent,
      admin: { description: 'A hex colour such as #1a5c4f.' },
    },
    {
      name: 'textColor',
      type: 'text',
      label: 'Text colour',
      defaultValue: DEFAULT_EMAIL_BRAND.textColor,
      admin: { description: 'A hex colour such as #222222.' },
    },
    {
      name: 'background',
      type: 'text',
      label: 'Background colour',
      defaultValue: DEFAULT_EMAIL_BRAND.background,
      admin: { description: 'The colour behind the email. A hex colour such as #f4f4f4.' },
    },
    {
      name: 'contentBackground',
      type: 'text',
      label: 'Email panel colour',
      defaultValue: DEFAULT_EMAIL_BRAND.contentBackground,
      admin: { description: 'The colour of the main panel. A hex colour such as #ffffff.' },
    },
    {
      name: 'fontStack',
      type: 'select',
      label: 'Font',
      defaultValue: DEFAULT_EMAIL_BRAND.fontStack,
      options: EMAIL_FONT_OPTIONS.map((option) => ({ label: option.label, value: option.value })),
      admin: { description: 'Only fonts that every mail app has are offered.' },
    },
    {
      name: 'buttonRadius',
      type: 'number',
      label: 'Button corner (pixels)',
      defaultValue: DEFAULT_EMAIL_BRAND.buttonRadius,
      admin: { description: 'How rounded buttons are, from 0 (square) to 30.' },
    },
    {
      name: 'footerText',
      type: 'textarea',
      label: 'Footer text',
      admin: { description: 'Shown at the foot of designed emails, such as why the reader got it and how to stop getting it.' },
    },
    {
      name: 'address',
      type: 'textarea',
      label: 'Postal address',
      admin: { description: 'Your business address, shown in the footer. Marketing email should include one.' },
    },
  ],
}
