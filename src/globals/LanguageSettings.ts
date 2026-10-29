import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'
import { DEFAULT_LOCALE, LOCALE_OPTIONS } from '../features/multilingual/locales'

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
 * The locale list is shared between the default and the active list, so the
 * two can never drift apart. It lives in the feature folder rather than here
 * because the switcher, the URL parser and the translation table all need the
 * same codes and the same native names, and a second copy of a locale list is
 * a second copy that goes stale.
 */

export const LanguageSettings: GlobalConfig = {
  slug: 'language-settings',
  label: 'Languages',
  dbName: 'eg_language_settings',
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
              defaultValue: DEFAULT_LOCALE,
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
                  'Every language your site is offered in, including the primary one. Each one gets a column on the Translations screen at /admin/translations, where the writing is actually done. Add languages sparingly - each is a full copy of your content that somebody has to write and keep current.',
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
        {
          type: 'row',
          fields: [
            {
              name: 'requireReview',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Only approved translations appear on the public site. A translation someone edits, or whose source text has changed, waits for a reviewer. Off: every translation with text in it is shown.',
              },
            },
            {
              name: 'adminsBypassReview',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Admins can approve any translation without being named as a reviewer.',
                condition: (_, s) => Boolean(s?.requireReview),
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'machineEnabled',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Let a machine translation provider write draft translations. Drafts are marked as machine drafts and follow the review setting above. Keys are on Integrations.',
              },
            },
            {
              name: 'machineDefaultProvider',
              type: 'select',
              admin: {
                width: '50%',
                description: 'The provider used for every language unless an override below names another.',
                condition: (_, s) => Boolean(s?.machineEnabled),
              },
              options: [
                { label: 'Google Cloud Translation', value: 'google' },
                { label: 'DeepL', value: 'deepl' },
                { label: 'AI: Claude', value: 'claude' },
                { label: 'AI: OpenAI', value: 'openai' },
              ],
            },
          ],
        },
        {
          name: 'machineOverrides',
          type: 'textarea',
          defaultValue: '{}',
          admin: {
            description:
              'Optional per-language provider, as JSON: {"de": "deepl", "ja": "google"}. Languages not listed use the default provider.',
            condition: (_, s) => Boolean(s?.machineEnabled),
          },
        },
        {
          name: 'machineMonthlyCharLimit',
          type: 'number',
          defaultValue: 0,
          min: 0,
          admin: {
            description:
              'Characters machine translation may send each calendar month, across all providers. 0 means no limit. Shown with the current month\'s usage below.',
            condition: (_, s) => Boolean(s?.machineEnabled),
          },
        },
        {
          name: 'machineAutoDraft',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Draft machine translations for the changed fields when a page, post, product, event or FAQ is saved. Off by default: each save then uses the monthly limit, so turn it on knowingly. Existing human work is never replaced.',
            condition: (_, s) => Boolean(s?.machineEnabled),
          },
        },
        {
          name: 'machineStatus',
          type: 'ui',
          admin: {
            components: {
              Field: '@/features/multilingual/components/MachineTranslationField#MachineTranslationField',
            },
          },
        },
        {
          name: 'translationRules',
          type: 'textarea',
          defaultValue: '{}',
          admin: {
            description:
              'Who translates and who reviews each language. Items are assigned from these rules unless one is assigned directly on the Translations screen.',
            components: {
              Field: '@/features/multilingual/components/TranslationRulesField#TranslationRulesField',
            },
          },
        },
      ],
    },
    {
      name: 'interfaceOverrides',
      type: 'json',
      admin: {
        components: { Field: '@/admin/components/InterfaceOverridesField#InterfaceOverridesField' },
        description:
          'Your own wording for storefront interface text (buttons, cart, checkout). Entries are {key, locale, value}; they win over the built-in translations. Leave empty to use the built-in text.',
      },
    },
  ],
}
