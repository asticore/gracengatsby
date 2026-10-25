import type { TemplateValues } from './renderTemplate'

/**
 * Made-up but realistic values for test sends, so a test shows how each email
 * reads with real-length names, dates and links. The keys match the tags used
 * in templateDefaults.ts. A template with no entry here falls back to the generic
 * sample, so a new template still gets a usable test.
 */

const SITE = 'https://example.com'

export const TEST_SAMPLE_VALUES: Record<string, TemplateValues> = {
  accountReset: { minutes: 60, link: `${SITE}/reset-password?token=sample` },
  accountAlreadyRegistered: { signInLink: `${SITE}/sign-in`, resetLink: `${SITE}/reset-password` },
  accountWelcome: { link: `${SITE}/account` },
  accountVerify: { hours: 24, link: `${SITE}/account/verify-email?token=sample` },
  accountMagicLink: { minutes: 15, link: `${SITE}/account/sign-in/link?token=sample` },
  accountLoginCode: { minutes: 15, code: '482913' },
  accountTwoFactorCode: { minutes: 10, code: '730216' },
  membershipRenewal: { tier: 'Gold', days: 7, renewsAt: '1 November 2026' },
  approvalSubmitted: {
    requesterName: 'Sam Example',
    noun: 'page',
    title: 'Spring menu',
    waiting: ' (2 others are waiting)',
    link: `${SITE}/admin/approvals`,
  },
  approvalDecision: {
    reviewerName: 'Alex Reviewer',
    verb: 'approved',
    noun: 'page',
    title: 'Spring menu',
    note: ' Looks good.',
    link: `${SITE}/admin/approvals`,
  },
  rsvpConfirmation: {
    name: 'Sam',
    eventTitle: 'Summer open evening',
    eventDate: 'Saturday 12 September 2026, 18:30',
    guestCount: 2,
  },
  eventReminder: {
    name: 'Sam',
    eventTitle: 'Summer open evening',
    when: 'tomorrow at 18:30',
    eventDate: 'Saturday 12 September 2026, 18:30',
    link: `${SITE}/events/summer-open-evening`,
  },
}

/** A generic sample for any template that has no specific one. */
const GENERIC_SAMPLE: TemplateValues = { name: 'Sam', title: 'Sample item', link: `${SITE}/account` }

export const sampleValuesFor = (key: string): TemplateValues => TEST_SAMPLE_VALUES[key] ?? GENERIC_SAMPLE

/** Plain-English names for the template picker. */
export const TEMPLATE_LABELS: Record<string, string> = {
  accountReset: 'Password reset',
  accountAlreadyRegistered: 'Account already exists',
  accountWelcome: 'Welcome to a new account',
  accountVerify: 'Confirm your email address',
  accountMagicLink: 'Sign-in link',
  accountLoginCode: 'Sign-in code',
  accountTwoFactorCode: 'Two-step code',
  membershipRenewal: 'Membership renewal reminder',
  approvalSubmitted: 'Approval requested',
  approvalDecision: 'Approval decision',
  rsvpConfirmation: 'Booking confirmed',
  eventReminder: 'Event reminder',
}

/** The subject of a test send, so it is never mistaken for a real email. */
export const testSubject = (subject: string): string => `[Test] ${subject}`
