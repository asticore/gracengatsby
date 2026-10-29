import type { GlobalConfig } from '@/engine'

import { adminOnlyFieldAccess, isAdmin } from '../access/ecommerceAccess'
import { refuseSocialSwitchWithoutCredentials } from '../features/socialLogin/validate'
import { socialLoginFields } from './socialLoginFields'
import { validateAdminPathField } from '../features/security/adminPathValidate'

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
  hooks: {
    // Server-side: a social sign-in provider cannot be switched on until its credentials are saved.
    beforeChange: [refuseSocialSwitchWithoutCredentials],
    // A saved admin URL takes effect in this isolate at once, not after the 60-second settings cache.
    afterChange: [
      async () => {
        const { invalidateSecuritySettingsCache } = await import('../features/security/settings')
        invalidateSecuritySettingsCache()
      },
    ],
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    // Password rules. Flat on purpose (see socialLoginFields.ts): the schema
    // generator cannot nest a group in a group. Column names are the snake_case
    // of these names, listed in src/migrations/20261116_100000_password_policy.ts.
    // Every default is today's behaviour, so nothing changes until the owner opts in.
    {
      name: 'passwordMinLength',
      type: 'number',
      defaultValue: 8,
      label: 'Minimum password length',
      admin: {
        description:
          'Shortest password for customers when they register, reset or change one. 8 is the site default. Passwords set on the admin screens, for example an admin choosing a password for a customer, keep the existing no-minimum behaviour unless this is raised above 8. Existing passwords are never checked.',
      },
    },
    {
      name: 'passwordRequireMixedCase',
      type: 'checkbox',
      defaultValue: false,
      label: 'Require upper and lower case letters',
      admin: { description: 'New passwords must contain both an upper-case and a lower-case letter.' },
    },
    {
      name: 'passwordRequireNumber',
      type: 'checkbox',
      defaultValue: false,
      label: 'Require a number',
      admin: { description: 'New passwords must contain at least one digit.' },
    },
    {
      name: 'passwordRequireSymbol',
      type: 'checkbox',
      defaultValue: false,
      label: 'Require a symbol',
      admin: { description: 'New passwords must contain at least one character that is not a letter or a digit, such as ! or #.' },
    },
    {
      name: 'passwordBlockCommon',
      type: 'checkbox',
      defaultValue: false,
      label: 'Block common passwords',
      admin: {
        description:
          'Refuses a bundled list of the most commonly used passwords, and any password that contains the name part of the email address (before the @). Checked on the server only, offline.',
      },
    },
    {
      name: 'passwordBreachCheck',
      type: 'checkbox',
      defaultValue: false,
      label: 'Check for breached passwords',
      admin: {
        description:
          'Asks the Have I Been Pwned range service whether a password has appeared in a known data breach. Only the first five characters of a one-way hash are sent. If the service cannot be reached within two seconds the password is accepted, so a third-party outage never blocks anyone.',
      },
    },
    {
      name: 'passwordHistoryCount',
      type: 'number',
      defaultValue: 0,
      label: 'Passwords remembered (no reuse)',
      admin: {
        description:
          'How many previous passwords an account may not reuse. 0 turns this off. Up to 10. Passwords set since this version of the site are remembered; older ones are not.',
      },
    },
    {
      name: 'passwordMaxAgeDays',
      type: 'number',
      defaultValue: 0,
      label: 'Maximum password age (days)',
      admin: {
        description:
          'After this many days a customer or admin is asked to choose a new password the next time they sign in. Nobody is locked out, and a new password is required only once. 0 turns this off. The age counts from the last change, or from the account creation date if the password has never changed since this version of the site.',
      },
    },
    // Passwordless sign-in (magic link and email code). Flat, like the password rules above.
    // Column names are the snake_case of these names, listed in
    // src/migrations/20261117_100000_passwordless_login.ts. Everything is off by default.
    {
      name: 'magicLinkEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Email me a sign-in link',
      admin: {
        description:
          'Shows an "Email me a sign-in link" option on the customer sign-in screen. The link works once and expires after the lifetime set below. Only accounts whose email address can receive mail can use it. Off by default; existing sign-in is unchanged.',
      },
    },
    {
      name: 'emailCodeEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Email me a sign-in code',
      admin: {
        description:
          'Shows an "Email me a code" option with a six-digit code to type in. A code stops working after five wrong tries. Off by default; existing sign-in is unchanged.',
      },
    },
    {
      name: 'allowPasswordlessForAdmins',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow admins to sign in this way too',
      admin: {
        description:
          'Off: only customers can use the email options, and the admin login screen shows no email option. On: admins can also request a link or code on the admin login screen. Two-step sign-in still applies to any account that has it switched on.',
      },
    },
    {
      name: 'passwordlessTokenMinutes',
      type: 'number',
      defaultValue: 15,
      label: 'Link and code lifetime (minutes)',
      admin: {
        description:
          'How long an emailed sign-in link or code stays valid, from 5 to 60 minutes. A new request makes any earlier link or code for the same account stop working.',
      },
    },
    // Passkeys (WebAuthn). Flat, like the fields above. Column names are the snake_case of
    // these names, listed in src/migrations/20261118_100000_passkeys.ts. Off by default.
    {
      name: 'passkeysEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow passkeys',
      admin: {
        description:
          'Lets customers register a passkey (Face ID, Touch ID, Windows Hello or a security key) on their profile and sign in with it. A passkey is an extra way in: passwords and any other sign-in method keep working. Off by default; existing sign-in is unchanged.',
      },
    },
    {
      name: 'passkeysAllowAdmins',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow admins to use passkeys',
      admin: {
        description:
          'Off: only customers can register or use passkeys. On: admins can also register a passkey on the Security screen and sign in with one on the admin login screen.',
      },
    },
    {
      name: 'passkeysRpName',
      type: 'text',
      label: 'Passkey display name',
      admin: {
        description: 'The name shown in the device prompt when a passkey is created. Leave empty to use the site name.',
      },
    },
    {
      name: 'passkeysUserVerification',
      type: 'select',
      defaultValue: 'preferred',
      label: 'User verification',
      options: [
        { label: 'Preferred (use a device PIN or biometric when available)', value: 'preferred' },
        { label: 'Required (always ask for a PIN or biometric)', value: 'required' },
      ],
      admin: {
        description:
          'Required makes every passkey sign-in confirm the device PIN or biometric. A passkey signed in this way also skips the authenticator-app code, if the account has one.',
      },
    },
    // API keys (bearer tokens for the REST API). Flat, like the fields above. Column names are
    // the snake_case of these names, listed in src/migrations/20261119_100000_api_keys.ts.
    // Off by default; with the feature off, no key is accepted anywhere.
    {
      name: 'apiKeysEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow API keys',
      admin: {
        description:
          'Lets people create API keys (Authorization: Bearer egk_...) that call the REST API with the same permissions as their own account, narrowed to read and/or write scopes. Off by default; existing sign-in and requests are unchanged.',
      },
    },
    {
      name: 'apiKeysAllowCustomers',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow customers to create API keys',
      admin: {
        description: 'Off: only admins can create API keys. On: customers can also create keys on their profile.',
      },
    },
    {
      name: 'apiKeysMaxPerUser',
      type: 'number',
      defaultValue: 5,
      label: 'Maximum active keys per user',
      min: 1,
      max: 50,
      admin: {
        description: 'How many keys one person may hold at once. Revoked and expired keys do not count.',
      },
    },
    {
      name: 'apiKeysMaxLifetimeDays',
      type: 'number',
      defaultValue: 365,
      label: 'Maximum key lifetime (days)',
      min: 0,
      max: 3650,
      admin: {
        description:
          'The longest a new key may run before it expires, from 1 to 3650 days. Set to 0 to forbid expiry dates: new keys then never expire until revoked.',
      },
    },
    // Verified email for customer sign-in (src/features/accounts/auth.ts). Flat, like the fields above.
    // Column names are the snake_case of these names, listed in src/migrations/20261121_100000_auth_slice_2.ts.
    // Off by default; existing sites sign in exactly as before.
    {
      name: 'emailVerificationRequired',
      type: 'checkbox',
      defaultValue: false,
      label: 'Require a verified email to sign in',
      admin: {
        description:
          'Customers who have not confirmed their email address cannot sign in until they do. Administrators and editors are never held back. Existing customers must be marked verified first (Users, Email verified) or they will be asked to confirm on their next sign-in. Off by default.',
      },
    },
    {
      name: 'emailVerificationCooldownSeconds',
      type: 'number',
      defaultValue: 60,
      label: 'Gap between verification emails (seconds)',
      min: 0,
      max: 3600,
      admin: {
        description: 'The least time between two verification emails to the same account, so the resend button cannot be used to flood a mailbox. 0 turns the gap off.',
      },
    },
    // The admin URL (src/features/security/adminPath.ts). Column admin_path, see
    // src/migrations/20261130_100000_admin_path.ts. Empty means /admin.
    {
      name: 'adminPath',
      type: 'text',
      defaultValue: '/admin',
      label: 'Admin URL',
      validate: validateAdminPathField,
      admin: {
        components: { Field: '@/admin/components/AdminUrlField#AdminUrlField' },
        description:
          'The address of the admin, one segment such as /studio-7f3 (lowercase letters, digits and hyphens, 3 to 40 characters). Leave it as /admin to keep the default. The old /admin address stops working once you change this. Recovery: set the ENGAGE_ADMIN_PATH environment variable in Cloudflare to a path, and it overrides this field. Bookmark the new address as soon as you save it, because the admin cannot be found without it.',
      },
    },
    // Admin "sign in as customer" (src/features/impersonation). Flat, like the fields above. Column
    // names are the snake_case of these names, listed in src/migrations/20261120_100000_impersonation.ts.
    // Off by default; with the feature off, no impersonation starts.
    {
      name: 'impersonationEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow admins to sign in as a customer',
      admin: {
        description:
          'Lets an administrator open a customer account for a short time to see what they see. Every start, stop and refusal is recorded in the audit log and the impersonation history. Off by default.',
      },
    },
    {
      name: 'impersonationMaxMinutes',
      type: 'number',
      defaultValue: 30,
      label: 'Impersonated session length (minutes)',
      min: 5,
      max: 120,
      admin: {
        description: 'How long an impersonated session lasts before it ends by itself. Between 5 and 120 minutes.',
      },
    },
    {
      name: 'impersonationRequire2fa',
      type: 'checkbox',
      defaultValue: true,
      label: 'Require two-step sign-in or a passkey for the admin',
      admin: {
        description: 'On: an administrator without an authenticator app or a passkey cannot impersonate anyone. Recommended.',
      },
    },
    // Customer organisations (src/features/organizations). Flat, like the fields above. Column names are the
    // snake_case of these names, listed in src/migrations/20261124_100000_organizations.ts. Off by default.
    {
      name: 'organizationsEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Let customers create and join organisations',
      admin: {
        description:
          'Adds organisations, members with roles, teams and emailed invitations to the customer account area. Every change is recorded in the audit log. Off by default.',
      },
    },
    {
      name: 'organizationsMaxPerAccount',
      type: 'number',
      defaultValue: 5,
      label: 'Most organisations one account may own',
      min: 1,
      max: 100,
      admin: { description: 'Between 1 and 100. Joining someone else\'s organisation does not count.' },
    },
    {
      name: 'organizationsWhoMayCreate',
      type: 'select',
      defaultValue: 'anyone',
      label: 'Who may create an organisation',
      options: [
        { label: 'Any signed-in account', value: 'anyone' },
        { label: 'Site administrators only', value: 'admins' },
      ],
      admin: { description: 'Administrators only: customers can still be invited into organisations an administrator creates.' },
    },
    // Two-step enforcement by role, email codes and trusted devices (src/features/security/twoFactorEnforcement.ts).
    // Flat, like the fields above. Column names are the snake_case of these names, listed in
    // src/migrations/20261122_100000_auth_slice_3.ts. All off by default.
    {
      name: 'twoFactorRequiredRoles',
      type: 'text',
      label: 'Require two-step sign-in for roles',
      admin: {
        description:
          'Comma-separated role names: admin, editor, viewer, customer, or the slug of a custom role. People in these roles who have not set up two-step are sent to the setup screen and cannot use the site or API until they do. The last administrator is never locked out. Empty means nobody is required (the two checkboxes under Login protection still apply).',
      },
    },
    {
      name: 'twoFactorGraceEndsAt',
      type: 'date',
      label: 'Grace period ends',
      admin: {
        description: 'Until this date, people who must set up two-step are only reminded. Leave empty to enforce straight away.',
      },
    },
    {
      name: 'twoFactorEmailOtpEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow a code by email as the second step',
      admin: {
        description: 'Adds "Email me a code" to the two-step screens. The six-digit code lasts 10 minutes and allows five tries.',
      },
    },
    {
      name: 'trustedDevicesEnabled',
      type: 'checkbox',
      defaultValue: false,
      label: 'Allow "remember this device"',
      admin: {
        description: 'Lets a person skip the second step on a device they ticked "remember" on. Changing a password ends every remembered device.',
      },
    },
    {
      name: 'trustedDeviceDays',
      type: 'number',
      defaultValue: 30,
      label: 'Remember a device for (days)',
      min: 1,
      max: 90,
      admin: { description: 'Between 1 and 90 days.' },
    },
    // Shared password groups (src/features/visibility). Flat; column password_groups_enabled, added in
    // src/migrations/20261123_100000_password_groups.ts. On by default; off locks every document that
    // uses a group, for everyone, until it is switched back on.
    {
      name: 'passwordGroupsEnabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Allow shared password groups',
      admin: {
        description:
          'Lets one shared password protect many pages, posts, products and events. Off: every document that uses a group is locked and no group password works until you turn this back on.',
      },
    },
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
                  'Admins without two-step are taken to the setup screen after signing in (Security > Two-step sign-in). Nobody is locked out, but set it up on your own account first.',
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
        {
          name: 'requireTwoFactorForMembers',
          type: 'checkbox',
          defaultValue: false,
          label: 'Require two-step sign-in for customer accounts',
          admin: {
            description:
              'Off by default. When on, customers who have not set up two-step are taken to the Security section of their profile after signing in. They are never locked out. Only used while the Customer accounts feature is on.',
          },
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
    {
      type: 'group',
      name: 'approval',
      label: 'Content approval',
      admin: {
        description:
          'Require a second person to approve changes before they go live. Editors submit for review instead of publishing; reviewers approve or send the change back. Admins can always publish directly. For multi-step review with named roles, create an approval workflow on the Roles page: a content type with an active workflow uses it instead of the counts below. Off by default.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Turn on review for the content types set below. Nothing changes for anyone until this is on.' },
        },
        {
          type: 'row',
          fields: [
            { name: 'pagesApprovals', type: 'number', defaultValue: 0, admin: { width: '20%', description: 'Pages. 0 = no review.' } },
            { name: 'postsApprovals', type: 'number', defaultValue: 0, admin: { width: '20%', description: 'Posts. 0 = no review.' } },
            { name: 'eventsApprovals', type: 'number', defaultValue: 0, admin: { width: '20%', description: 'Events. 0 = no review.' } },
            { name: 'coursesApprovals', type: 'number', defaultValue: 0, admin: { width: '20%', description: 'Courses. 0 = no review.' } },
            { name: 'productsApprovals', type: 'number', defaultValue: 0, admin: { width: '20%', description: 'Products. 0 = no review.' } },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'allowSelfApproval',
              type: 'checkbox',
              defaultValue: false,
              admin: {
                width: '50%',
                description: 'Let a reviewer approve their own change. Off means a second person must approve every change.',
              },
            },
            {
              name: 'adminsMaySelfApprove',
              type: 'checkbox',
              defaultValue: true,
              admin: {
                width: '50%',
                description:
                  'Let an admin approve their own change even when the setting above is off. On by default so a solo admin can still publish. Off means admins also need a second person.',
              },
            },
          ],
        },
        {
          type: 'row',
          fields: [
            {
              name: 'notifyReviewers',
              type: 'checkbox',
              defaultValue: true,
              admin: { width: '50%', description: 'Email reviewers when something is submitted for review.' },
            },
          ],
        },
        {
          name: 'notifyEmails',
          type: 'textarea',
          access: { read: adminOnlyFieldAccess, update: adminOnlyFieldAccess },
          admin: { description: 'Extra addresses to email on every submission, one per line. Optional. Only admins can see this list.' },
        },
      ],
    },
    {
      type: 'group',
      name: 'socialLogin',
      label: 'Social login',
      admin: {
        description:
          'Let customers (and, if you allow it, staff) sign in with Google, GitHub, Apple, Facebook, Microsoft or Discord. Everything is off until you set it up: you create your own app with each provider, paste its credentials here, then switch it on. Nothing is shipped with the site. Secrets are encrypted and only admins can read them.',
      },
      fields: socialLoginFields,
    },
  ],
}
