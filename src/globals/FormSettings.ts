import type { GlobalConfig } from 'payload'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { decryptSecretHook, encryptSecretHook } from '../utilities/secretField'

/**
 * Defaults shared by every form on the site - where submissions go, how spam
 * is filtered, and the wording used when a form does not set its own.
 *
 * Individual forms override anything here; this is the fallback so a new form
 * is usable the moment it is created.
 *
 * On spam: the honeypot and the minimum fill time are free, invisible to real
 * visitors, and stop the overwhelming majority of automated submissions
 * between them. Turnstile is the escalation for when they are not enough - it
 * is more effective but adds a third-party script to every page with a form,
 * so it is off by default rather than on.
 *
 * Submissions are stored in the database, so the retention setting is a
 * privacy decision as much as a housekeeping one - form submissions routinely
 * contain names, addresses and whatever else somebody typed into a message box.
 */
export const FormSettings: GlobalConfig = {
  slug: 'form-settings',
  label: 'Forms',
  dbName: 'eg_form_settings',
  admin: {
    group: 'Settings',
    description:
      'Defaults for every form on your site. Any individual form can override these on its own settings.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'submissions',
      label: 'Submissions',
      admin: { description: 'What happens to an entry once someone presses send.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'storeSubmissions',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description:
                  'Keep a copy in the admin area. Worth leaving on - if a notification email goes astray, this is the only record of the enquiry.',
              },
            },
            {
              name: 'retentionDays',
              type: 'number',
              defaultValue: 365,
              admin: {
                width: '50%',
                description:
                  'How long stored entries are kept before being deleted. Entries usually hold personal details, so keep them only as long as you genuinely need them. Set to 0 to keep them indefinitely.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'sendAdminNotification',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Email someone whenever a form is submitted.' },
            },
            {
              name: 'notificationRecipients',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'Who gets that email. Separate several addresses with commas. Delivery uses whichever provider is set in Email settings.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'spam',
      label: 'Spam',
      admin: {
        description:
          'Filters out automated submissions. The first two are invisible to real visitors and cost nothing - start with those.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'honeypot',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description:
                  'Adds a hidden field that people never see but bots tend to fill in. Anything that completes it is discarded.',
              },
            },
            {
              name: 'minimumFillTimeSeconds',
              type: 'number',
              defaultValue: 3,
              admin: {
                width: '50%',
                description:
                  'Reject submissions sent faster than a person could type. Three seconds is safe; much higher starts catching genuinely quick visitors.',
              },
            },
          ],
        },
        {
          name: 'turnstile',
          type: 'checkbox',
          defaultValue: false,
          admin: {
            description:
              'Turn on Cloudflare Turnstile, a challenge that is usually invisible to real visitors. Use it if spam is still getting through - it adds a Cloudflare script to every page that has a form.',
          },
        },
        {
          type: 'row',
          fields: [
            {
              name: 'turnstileSiteKey',
              type: 'text',
              admin: {
                width: '50%',
                description:
                  'From the Turnstile section of your Cloudflare dashboard. This one is public - it appears in the form itself.',
                condition: (_, s) => Boolean(s?.turnstile),
              },
            },
            {
              name: 'turnstileSecretKey',
              type: 'text',
              access: {
                read: adminOnlyFieldAccess,
                update: adminOnlyFieldAccess,
              },
              hooks: {
                beforeChange: [encryptSecretHook],
                afterRead: [decryptSecretHook],
              },
              admin: {
                width: '50%',
                description:
                  'The matching secret key from Cloudflare. Stored encrypted at rest, visible only to admins - rotate it in Cloudflare if it is ever exposed.',
                condition: (_, s) => Boolean(s?.turnstile),
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'defaults',
      label: 'Defaults',
      admin: { description: 'The wording a new form starts with. Every form can change its own.' },
      fields: [
        {
          name: 'submitButtonLabel',
          type: 'text',
          defaultValue: 'Submit',
          admin: {
            description:
              'The text on the send button. Something specific like "Send enquiry" reads better than "Submit".',
          },
        },
        {
          name: 'successMessage',
          type: 'textarea',
          defaultValue: 'Thank you - we have received your message and will be in touch shortly.',
          admin: { description: 'Shown after a successful submission. Say what happens next and roughly when.' },
        },
        {
          name: 'errorMessage',
          type: 'textarea',
          defaultValue: 'Sorry, something went wrong and your message was not sent. Please try again.',
          admin: {
            description:
              'Shown when a submission fails. Give people another way to reach you here - an email address or phone number - so a broken form does not cost you the enquiry.',
          },
        },
      ],
    },
  ],
}
