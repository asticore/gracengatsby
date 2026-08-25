import type { GlobalConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * Login protection, response headers, rate limiting and the audit log.
 *
 * The header defaults are the ones that are safe to switch on without knowing
 * anything about the site. Content-Security-Policy is deliberately NOT one of
 * them: a policy strict enough to be useful will block a third-party script
 * somebody added last month, and the failure is silent and total. It ships
 * blank, and the description says to test it before trusting it.
 *
 * The hardening toggles are noise reduction rather than real defence. Blocking
 * PHP-style probe paths, for instance, does nothing to protect a site that has
 * no PHP - it just keeps the logs readable. It is described that way so nobody
 * mistakes a tidy log for a secure site.
 */
export const SecuritySettings: GlobalConfig = {
  slug: 'security-settings',
  label: 'Security',
  dbName: 'eg_security_settings',
  admin: {
    group: 'Settings',
    description:
      'Protection for the admin login and the rules browsers are told to follow on your site. The defaults are safe - the headers section is the one to read carefully before changing.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    {
      type: 'group',
      name: 'loginProtection',
      label: 'Login protection',
      admin: { description: 'Slows down anyone trying to guess their way into your admin area.' },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'maxLoginAttempts',
              type: 'number',
              defaultValue: 5,
              admin: { width: '50%', description: 'Wrong passwords allowed before the account is locked for a while.' },
            },
            {
              name: 'lockoutMinutes',
              type: 'number',
              defaultValue: 15,
              admin: {
                width: '50%',
                description: 'How long that lock lasts. Long enough to be a real obstacle, short enough to forgive a bad morning.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'requireTwoFactorForAdmins',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description:
                  'Make admins confirm sign-in with a second step. Set this up on your own account before switching it on for everyone, or you can lock yourself out.',
              },
            },
            {
              name: 'sessionTimeoutMinutes',
              type: 'number',
              defaultValue: 720,
              admin: {
                width: '50%',
                description: 'How long someone stays signed in without activity. 720 is twelve hours.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'headers',
      label: 'Headers',
      admin: {
        description:
          'Instructions sent to every visitor\'s browser about what your pages are allowed to do. The defaults suit most sites.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'hsts',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '33%',
                description: 'Tells browsers to only ever use the secure version of your site.',
              },
            },
            {
              name: 'xFrameOptions',
              type: 'select',
              defaultValue: 'SAMEORIGIN',
              admin: {
                width: '33%',
                description:
                  'Whether other websites may display your pages inside a frame of their own. Deny is stricter; same-origin still lets your own pages do it.',
              },
              options: [
                { label: 'Deny - nobody may frame this site', value: 'DENY' },
                { label: 'Same origin - only this site may', value: 'SAMEORIGIN' },
              ],
            },
            {
              name: 'xContentTypeOptions',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'Stops browsers second-guessing what type a file is. Safe to leave on.' },
            },
          ],
        },
        {
          name: 'referrerPolicy',
          type: 'select',
          defaultValue: 'strict-origin-when-cross-origin',
          admin: {
            description: 'How much of the address someone came from is passed on to other sites they click through to.',
          },
          options: [
            { label: 'No referrer - pass nothing on', value: 'no-referrer' },
            { label: 'Same origin only', value: 'same-origin' },
            { label: 'Strict origin', value: 'strict-origin' },
            { label: 'Strict origin when cross-origin (recommended)', value: 'strict-origin-when-cross-origin' },
            { label: 'Origin', value: 'origin' },
            { label: 'Unsafe URL - pass the full address on', value: 'unsafe-url' },
          ],
        },
        {
          name: 'permissionsPolicy',
          type: 'textarea',
          admin: {
            description:
              'Which device features your pages may ask for, such as camera or location. Leave blank unless you have a specific reason - the browser defaults are already sensible.',
          },
        },
        {
          name: 'contentSecurityPolicy',
          type: 'textarea',
          admin: {
            description:
              'Warning: this one can break your site silently. It lists exactly which sources of scripts, styles and images are allowed, and anything you forget to include simply stops working - often a payment form or an embedded video, with no visible error. Leave it blank unless you are prepared to test every page afterwards.',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'rateLimiting',
      label: 'Rate limiting',
      admin: {
        description:
          'Caps how many requests one visitor can make in a minute, so a single source cannot flood the site.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
            {
              name: 'requestsPerMinute',
              type: 'number',
              defaultValue: 120,
              admin: {
                width: '50%',
                description:
                  'Requests allowed from one visitor each minute. Too low and ordinary browsing trips it - 120 is comfortable.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'applyToApi',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Apply the limit to API requests.' },
            },
            {
              name: 'applyToForms',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Apply the limit to form submissions, which is where spam arrives.' },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'hardening',
      label: 'Hardening',
      admin: {
        description:
          'Small measures that mostly cut down on automated noise. They make your logs easier to read; they are not a substitute for the sections above.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            {
              name: 'blockProbePaths',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '33%',
                description:
                  'Turn away bots hunting for WordPress and PHP files. This site has none, so they were never going to find anything - this just stops them filling the logs.',
              },
            },
            {
              name: 'disableDirectoryListing',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '33%', description: 'Stops folder contents being listed to anyone who guesses a path.' },
            },
            {
              name: 'hideCmsFingerprint',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '33%',
                description: 'Removes the tell-tale signs of which system runs this site. Mildly useful, easily worked around.',
              },
            },
          ],
        },
      ],
    },
    {
      type: 'group',
      name: 'auditLog',
      label: 'Audit log',
      admin: {
        description:
          'A record of who signed in and what they changed. Invaluable after something goes wrong, and impossible to reconstruct later if it was switched off.',
      },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'enabled', type: 'checkbox', defaultValue: true, admin: { width: '50%' } },
            {
              name: 'retentionDays',
              type: 'number',
              defaultValue: 90,
              admin: {
                width: '50%',
                description: 'How long entries are kept before being deleted. Longer costs storage but covers slower discoveries.',
              },
            },
          ],
        },
      ],
    },
  ],
}
