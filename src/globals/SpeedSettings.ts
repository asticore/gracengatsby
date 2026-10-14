import type { GlobalConfig } from '@/engine'

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
  dbName: 'eg_speed_settings',
  admin: {
    group: 'Settings',
    description:
      'Caching and asset optimisation. Turn these on one at a time and check the site after each - if something looks wrong, the last switch you flipped is the culprit.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  hooks: {
    afterChange: [
      async () => {
        // Any Speed save starts a new cache version, so a changed rule never serves an old copy.
        const { bumpCacheEpoch } = await import('@/features/speed/epoch')
        await bumpCacheEpoch()
      },
    ],
  },
  fields: [
    {
      // Not shown to editors. The Worker builds its cache keys from this number; see src/features/speed/epoch.ts.
      name: 'cacheEpoch',
      type: 'number',
      defaultValue: 1,
      admin: { hidden: true, description: 'Internal cache version number.' },
    },
    {
      type: 'group',
      name: 'caching',
      label: 'Caching',
      admin: {
        description:
          'Saved copies of your pages, so repeat visitors are served quickly. Page caching is off until you switch it on below. Cache tools (clear now, development mode) are on the Cache tools page.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'pageCache',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Keeps a saved copy of public pages in Cloudflare\'s network so repeat visits are quicker. Only visitors with no cookies except the cookie-consent one get a saved copy. Admin, cart, checkout, account and login pages are never saved. Every publish starts a new version, so an edit shows within about 10 seconds.',
              },
            },
            {
              name: 'cacheTtlSeconds',
              type: 'number',
              defaultValue: 3600,
              admin: {
                width: '50%',
                description:
                  'How long a saved copy may be kept, in seconds. 3600 is one hour. Edits do not wait for this: each publish starts a new version. Minimum 30.',
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
                  'Leave off unless you know you need it. Visitors signed in to the admin or as an editor never get saved copies, and this setting never changes that. When on, visitors with other cookies (for example customer logins) may get saved copies, so check that no page shows personal details.',
              },
            },
            {
              name: 'purgeOnPublish',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description: 'After you publish, the saved copies of that page are cleared where possible so the change shows up quickly. Copies already stored in visitors\' own browsers are not cleared.',
              },
            },
          ],
        },
        {
          name: 'neverCachePaths',
          type: 'textarea',
          admin: {
            description:
              'Pages that must never get a saved copy, one per line. Use /path for one page or /path/* for everything under it. Lines starting with # are ignored.',
          },
        },
        {
          name: 'neverCacheCookies',
          type: 'textarea',
          admin: {
            description:
              'Cookie names that stop a visitor getting saved copies, one per line, for example wordpress_logged_in. Add a * at the end to match a prefix.',
          },
        },
        {
          name: 'neverCacheQueryStrings',
          type: 'textarea',
          admin: {
            description:
              'Address parameters that stop a page getting a saved copy, one per line, for example s or q (search). Any parameter other than utm_, fbclid and gclid already stops it.',
          },
        },
        {
          name: 'cacheMobileSeparately',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Keeps separate saved copies for phones and tablets, for sites whose mobile page differs from the desktop one. Costs a little more storage.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'assets',
      label: 'Assets',
      admin: {
        description:
          'How script files load. Check a few pages after changing anything here.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            // No effect, kept for stored data.
            { name: 'minifyCss', type: 'checkbox', defaultValue: false, admin: { width: '33%', hidden: true, description: 'Strips spacing from style files.' } },
            // No effect, kept for stored data.
            { name: 'minifyJs', type: 'checkbox', defaultValue: false, admin: { width: '33%', hidden: true, description: 'Strips spacing from script files.' } },
            // No effect, kept for stored data.
            { name: 'combineCss', type: 'checkbox', defaultValue: false, admin: { width: '33%', hidden: true, description: 'Merges style files into one request.' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'deferJs',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Holds back third-party scripts that other scripts add, such as analytics, chat widgets and embeds, until the page has finished loading.',
              },
            },
            {
              // No effect, kept for stored data.
              name: 'removeUnusedCss',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '33%',
                hidden: true,
                description:
                  'Removes styling a page does not appear to use. The biggest speed win here, and the most likely to break a menu or pop-up.',
              },
            },
            {
              // No effect, kept for stored data.
              name: 'preloadCriticalCss',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '33%', hidden: true, description: 'Loads the styling for the top of the page first.' },
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
              admin: { width: '50%', description: 'Pictures further down the page wait until you scroll near them. Pictures at the top of the page load straight away.' },
            },
            {
              name: 'lazyLoadIframes',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Embedded videos and maps further down the page wait until you scroll near them, as they are heavy.' },
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
                description: 'Once each picture has loaded, records its size so the space is kept when the page redraws. This cannot stop the page jumping on a first visit.',
              },
            },
            {
              // No effect, kept for stored data.
              name: 'disableEmojiScript',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', hidden: true, description: 'Skips the extra emoji helper script. Safe on modern browsers.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'fonts',
      label: 'Fonts',
      // No effect, kept for stored data. The framework already handles both settings.
      admin: { hidden: true, description: 'How custom typefaces load.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              // No effect, kept for stored data.
              name: 'preloadFonts',
              type: 'checkbox',
              defaultValue: false,
              admin: { width: '50%', hidden: true, description: 'Start fetching your typefaces sooner.' },
            },
            {
              // No effect, kept for stored data.
              name: 'fontDisplaySwap',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                hidden: true,
                description: 'Show text in a stand-in typeface immediately rather than leaving a blank space.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'pagespeed',
      label: 'PageSpeed tests',
      admin: {
        description:
          'Scores from Google PageSpeed Insights are measured on the live page from the edit screen (PageSpeed card). Results vary a little from run to run, and Google limits how many tests can run.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'testAfterPublish',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Run a mobile test about 5 minutes after a page, post, product or event is published, so the score in the list stays current. Off by default. Uses part of your Google allowance.',
              },
            },
            {
              name: 'dailyCap',
              type: 'number',
              defaultValue: 20,
              min: 1,
              max: 200,
              admin: {
                width: '50%',
                description: 'Most automatic tests per day (UTC). Tests you start yourself are not counted. Without a Google API key keep this low.',
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
              'Holds back third-party scripts (chat widgets, analytics, video players) until the visitor moves, taps or scrolls. It scores well on speed tests but can break sliders, chat widgets, pop-ups and video players. Test every interactive part of the site before leaving this on.',
          },
        },
        {
          name: 'preloadOnHover',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description:
              'When a visitor rests the mouse on a link to another page of this site, starts loading that page in the background so it opens faster. Skipped when the visitor has data-saver turned on.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'cleanup',
      label: 'Data clean-up',
      admin: {
        description:
          'An hourly job that removes old data you no longer need. Off by default. Live pages, posts, products and events are never removed.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Turn on the hourly clean-up. Nothing is removed while this is off.' },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'keepVersionsPerDoc',
              type: 'number',
              defaultValue: 20,
              min: 1,
              max: 1000,
              admin: {
                width: '50%',
                description:
                  'How many saved versions to keep for each page, post, product and event. The newest are kept and older ones are removed.',
              },
            },
            {
              name: 'deleteTrashedAfterDays',
              type: 'number',
              defaultValue: 30,
              min: 0,
              admin: {
                width: '50%',
                description: 'Items in the trash are deleted for good after this many days. 0 means never.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'deleteFormSubmissionsAfterDays',
              type: 'number',
              defaultValue: 0,
              min: 0,
              admin: {
                width: '50%',
                description:
                  'Form entries older than this many days are deleted, along with any uploaded files. 0 means never. A form\'s own retention setting also applies.',
              },
            },
            {
              name: 'deleteAuditLogAfterDays',
              type: 'number',
              defaultValue: 180,
              min: 0,
              admin: {
                width: '50%',
                description: 'Activity log entries older than this are deleted. 0 means never.',
              },
            },
          ],
        },
        {
          name: 'deleteEmailLogAfterDays',
          type: 'number',
          defaultValue: 90,
          min: 1,
          admin: {
            description:
              'Email log entries older than this are deleted. When clean-up is on, this replaces the built-in 90 day rule.',
          },
        },
      ],
    },
  ],
}
