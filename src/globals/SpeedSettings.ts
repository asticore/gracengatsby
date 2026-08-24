import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Caching and asset-loading controls.
 *
 * Almost every toggle here defaults to OFF on purpose. Each one trades a small
 * speed gain for some risk of visual or functional breakage, and that trade is
 * site-specific - a fresh install should behave correctly first and be tuned
 * second. The handful that default to ON (lazy loading, image dimensions,
 * purge-on-publish) are the ones with no realistic downside.
 *
 * The descriptions name the symptom to look for when a setting misbehaves,
 * because the person turning these on is usually not the person who can read a
 * console error.
 */
export const SpeedSettings: GlobalConfig = {
  slug: 'speed-settings',
  label: 'Speed',
  dbName: 'ac_speed_settings',
  admin: {
    group: 'Settings',
    description:
      'Caching and asset optimisation. Turn these on one at a time and check the site after each - if something looks wrong, the last switch you flipped is the culprit.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'caching',
      label: 'Caching',
      admin: {
        description:
          'Saves a finished copy of each page so repeat visitors are served it instantly instead of it being rebuilt.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'pageCache',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', description: 'The main switch for page caching.' },
            },
            {
              name: 'cacheTtlSeconds',
              type: 'number',
              defaultValue: 3600,
              admin: {
                width: '50%',
                description: 'How long a saved copy stays fresh, in seconds. 3600 is one hour.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'cacheLoggedInUsers',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Leave off unless you know you need it. Caching signed-in visitors risks showing one person another person\'s page.',
              },
            },
            {
              name: 'purgeOnPublish',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Clear the saved copies when you publish an edit, so changes appear straight away.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'assets',
      label: 'Assets',
      admin: {
        description:
          'Shrinks and reorders the styling and script files a page needs. These are the settings most likely to change how the site looks, so check a few pages after each change.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'minifyCss', type: 'checkbox', defaultValue: false, admin: { width: '33%', description: 'Strips spacing from style files.' } },
            { name: 'minifyJs', type: 'checkbox', defaultValue: false, admin: { width: '33%', description: 'Strips spacing from script files.' } },
            { name: 'combineCss', type: 'checkbox', defaultValue: false, admin: { width: '33%', description: 'Merges style files into one request.' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'deferJs',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '33%', description: 'Loads scripts after the page is drawn.' },
            },
            {
              name: 'removeUnusedCss',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '33%',
                description:
                  'Removes styling a page does not appear to use. The biggest speed win here, and the most likely to break a menu or pop-up.',
              },
            },
            {
              name: 'preloadCriticalCss',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '33%', description: 'Loads the styling for the top of the page first.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'media',
      label: 'Media',
      admin: { description: 'How images and embedded content load as a visitor scrolls.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'lazyLoadImages',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Only load pictures as they come into view.' },
            },
            {
              name: 'lazyLoadIframes',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Same for embedded videos and maps, which are heavy.' },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'addImageDimensions',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Reserves the right space for each picture so the page stops jumping about as it loads.',
              },
            },
            {
              name: 'disableEmojiScript',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', description: 'Skips the extra emoji helper script. Safe on modern browsers.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'fonts',
      label: 'Fonts',
      admin: { description: 'How custom typefaces load. Poor font loading is a common cause of flickering text.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'preloadFonts',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', description: 'Start fetching your typefaces sooner.' },
            },
            {
              name: 'fontDisplaySwap',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'Show text in a stand-in typeface immediately rather than leaving a blank space.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'advanced',
      label: 'Advanced',
      admin: {
        description:
          'Fine-tuning for people comfortable reading a performance report. Everything here is safe to leave alone.',
      },
      fields: [
        {
          name: 'preconnectOrigins',
          type: 'array',
          labels: { singular: 'Origin', plural: 'Origins' },
          admin: {
            description:
              'Other web addresses your pages pull from - a font or video host, say. Naming them here lets the browser open the connection early.',
          },
          fields: [{ name: 'url', type: 'text' }],
        },
        {
          name: 'prefetchDns',
          type: 'array',
          labels: { singular: 'Domain', plural: 'Domains' },
          admin: {
            description: 'A lighter version of the above - looks up the address early but does not connect.',
          },
          fields: [{ name: 'domain', type: 'text' }],
        },
        {
          name: 'delayJsExecution',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Holds all scripts back until the visitor moves, taps or scrolls. It scores very well on speed tests but frequently breaks sliders, chat widgets, pop-ups and video players. Test every interactive part of the site before leaving this on.',
          },
        },
      ],
    },
  ],
}
