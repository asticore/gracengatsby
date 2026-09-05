import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Image compression and delivery, aimed at Cloudflare.
 *
 * Two Cloudflare products do similar-looking jobs and are easy to confuse, so
 * they are separate options rather than one "Cloudflare" choice:
 *   - Cloudflare Images stores the original for you and serves variants from
 *     an account-specific delivery address.
 *   - Image Resizing leaves the original where it is and transforms it on the
 *     way out.
 * The account hash and delivery prefix below only apply to the first.
 *
 * These settings describe what SHOULD happen to images. Anything already in the
 * library keeps whatever treatment it got when it was uploaded - see the Bulk
 * group for why re-processing lives on the Media collection instead.
 */
export const MediaSettings: GlobalConfig = {
  slug: 'media-settings',
  label: 'Media',
  dbName: 'eg_media_settings',
  admin: {
    group: 'Settings',
    description:
      'How pictures are compressed, resized and delivered. Sensible defaults are already set - the main reason to come here is to switch on a Cloudflare image plan.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'optimisation',
      label: 'Optimisation',
      admin: {
        description:
          'Makes picture files smaller so pages load faster. The aim is the smallest file a visitor cannot tell apart from the original.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'provider',
              type: 'select',
              defaultValue: 'none',
              admin: {
                width: '50%',
                description:
                  'Which service does the work. Both Cloudflare options need to be enabled on your Cloudflare account first.',
              },
              options: [
                { label: 'Cloudflare Images (stored and served by Cloudflare)', value: 'cloudflare-images' },
                { label: 'Cloudflare Image Resizing (transformed on delivery)', value: 'cloudflare-resizing' },
                { label: 'None - use pictures exactly as uploaded', value: 'none' },
              ],
            },
            {
              name: 'quality',
              type: 'number',
              defaultValue: 82,
              min: 1,
              max: 100,
              admin: {
                width: '50%',
                description:
                  'How much detail to keep, from 1 to 100. Around 82 is the usual sweet spot. Above 90 the files grow quickly for very little visible gain.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'convertToWebp',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'A smaller modern format every current browser understands.' },
            },
            {
              name: 'convertToAvif',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '33%',
                description: 'Smaller again, but slower to produce and not supported by older browsers.',
              },
            },
            {
              name: 'stripMetadata',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '33%',
                description:
                  'Removes camera and location details hidden inside photos. Worth leaving on for privacy as well as size.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'resizing',
      label: 'Resizing',
      admin: {
        description:
          'Caps how large a picture can be and prepares smaller copies so phones do not download a full desktop-sized image.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'maxWidth',
              type: 'number',
              defaultValue: 2560,
              admin: { width: '50%', description: 'Widest a stored picture may be, in pixels. Anything larger is scaled down.' },
            },
            {
              name: 'maxHeight',
              type: 'number',
              defaultValue: 2560,
              admin: { width: '50%', description: 'Tallest a stored picture may be, in pixels.' },
            },
          ],
        },
        {
          name: 'generateResponsiveSizes',
          type: 'checkbox',
          defaultValue: true,
          admin: {
            description: 'Make several sizes of each picture so each visitor gets the one that fits their screen.',
          },
        },
        {
          name: 'responsiveWidths',
          type: 'array',
          labels: { singular: 'Width', plural: 'Widths' },
          admin: {
            description: 'The widths to prepare, in pixels. The defaults cover phones, tablets and desktops.',
            condition: (_, s) => Boolean(s?.generateResponsiveSizes),
          },
          fields: [{ name: 'width', type: 'number' }],
        },
      ],
    },
    {
      type: 'group',
      name: 'delivery',
      label: 'Delivery',
      admin: {
        description:
          'Where finished pictures are served from. Only needed when using Cloudflare Images - you will find both values in the Images section of your Cloudflare dashboard.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'cloudflareAccountHash',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'The account hash shown on your Cloudflare Images page. It is a public identifier that appears in image addresses, not a password.',
              },
            },
            {
              name: 'deliveryUrlPrefix',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'The start of every image address, for example https://imagedelivery.net/your-hash. Leave blank to use the standard one.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'bulk',
      label: 'Bulk',
      admin: {
        description:
          'Changes on this screen apply to pictures uploaded from now on. To re-process pictures already in your library, open Media and use the bulk action there - it runs in batches so a large library does not time out.',
      },
      fields: [
        {
          name: 'batchSize',
          type: 'number',
          defaultValue: 25,
          admin: {
            description:
              'How many pictures the Media bulk action works through at a time. Lower this if a run does not finish.',
          },
        },
      ],
    },
  ],
}
