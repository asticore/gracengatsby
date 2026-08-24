import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Multilingual content settings.
 *
 * This is the one settings screen with a genuine point of no return. Turning
 * multilingual on changes how every piece of content is stored - each
 * translatable field gains a per-language value - and removing a language
 * later means the content written in it no longer has anywhere to live. On a
 * site with a large library that is a migration, not a toggle.
 *
 * Hence the warning on the group rather than buried on a field: the decision
 * costs nothing on day one and a great deal on day four hundred.
 *
 * The locale list is intentionally short and shared between the default and
 * the active list, so the two can never drift apart.
 */

const LOCALE_OPTIONS = [
  { label: 'English (Australia)', value: 'en-AU' },
  { label: 'English (United Kingdom)', value: 'en-GB' },
  { label: 'English (United States)', value: 'en-US' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Spanish', value: 'es' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Arabic', value: 'ar' },
]

export const LanguageSettings: GlobalConfig = {
  slug: 'language-settings',
  label: 'Languages',
  dbName: 'ac_language_settings',
  admin: {
    group: 'Settings',
    description:
      'Offer your site in more than one language. Worth deciding early - see the note below before switching this on.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'multilingual',
      label: 'Multilingual',
      admin: {
        description:
          'Please read before turning this on. Enabling multiple languages changes the way all your content is stored - every page, post and product gains a separate version per language. It is straightforward on a new site and a substantial piece of work on an established one, and removing a language afterwards means anything written in it has nowhere left to go. If you think you will ever want a second language, it is far cheaper to switch this on now than later.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'The main switch. Everything below only applies once this is on.' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'defaultLocale',
              type: 'select',
              defaultValue: 'en-AU',
              admin: {
                width: '50%',
                description: 'Your primary language. This is what visitors get when nothing else fits, and what you write in first.',
              },
              options: LOCALE_OPTIONS,
            },
            {
              name: 'activeLocales',
              type: 'select',
              hasMany: true,
              admin: {
                width: '50%',
                description:
                  'Every language your site is offered in, including the primary one. Add languages sparingly - each is a full copy of your content that somebody has to write and keep current.',
              },
              options: LOCALE_OPTIONS,
            },
          ],
        },
        {
          name: 'fallbackToDefault',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'When a page has not been translated yet, show the primary language version rather than an empty page. Recommended.',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'showLanguageSwitcher',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Give visitors a control for choosing their language.' },
            },
            {
              name: 'switcherPosition',
              type: 'select',
              defaultValue: 'header',
              admin: {
                width: '50%',
                description: 'Where that control appears.',
                condition: (_, s) => Boolean(s?.showLanguageSwitcher),
              },
              options: [
                { label: 'Header', value: 'header' },
                { label: 'Footer', value: 'footer' },
                { label: 'Both', value: 'both' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
