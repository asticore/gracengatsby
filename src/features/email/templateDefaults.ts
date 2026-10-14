/**
 * The built-in wording for each automatic email. A template that is left blank
 * in the `email-templates` global falls back to these, and these are exactly
 * the messages the senders used before the wording became editable, so a site
 * that never touches Email templates sends the same emails as before.
 *
 * Tags are written with double braces, e.g. {{link}}. Renderer: renderTemplate.ts.
 */

export type EmailTemplateKey =
  | 'accountReset'
  | 'accountAlreadyRegistered'
  | 'accountWelcome'
  | 'membershipRenewal'
  | 'approvalSubmitted'
  | 'approvalDecision'
  | 'rsvpConfirmation'

export type EmailTemplate = { subject: string; body: string }

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTemplateKey, EmailTemplate> = {
  accountReset: {
    subject: 'Reset your password',
    body: [
      'Someone asked to reset the password on your account.',
      'Open this link to choose a new one - it works once, and expires in {{minutes}} minutes:\n{{link}}',
      'If this was not you, ignore this email. Your password has not changed.',
    ].join('\n\n'),
  },
  accountAlreadyRegistered: {
    subject: 'You already have an account',
    body: [
      'Someone tried to create an account with this email address, but you already have one.',
      'Sign in here:\n{{signInLink}}',
      'Forgotten your password? Reset it here:\n{{resetLink}}',
      'If this was not you, nothing has changed and you can ignore this email.',
    ].join('\n\n'),
  },
  accountWelcome: {
    subject: 'Your account is ready',
    body: ['Your account is ready.', 'You can see your orders, addresses and bookings here:\n{{link}}'].join('\n\n'),
  },
  membershipRenewal: {
    subject: 'Your {{tier}} membership renews in {{days}} day(s)',
    body: 'Your {{tier}} membership is due to renew on {{renewsAt}} - that is {{days}} day(s) away.',
  },
  approvalSubmitted: {
    subject: 'Review requested: {{title}}',
    body: [
      '{{requesterName}} sent this {{noun}} for review: {{title}}{{waiting}}',
      'Open it to approve or ask for changes:\n{{link}}',
    ].join('\n\n'),
  },
  approvalDecision: {
    subject: '{{title}} was {{verb}}',
    body: ['{{reviewerName}} {{verb}} this {{noun}}: {{title}}.{{note}}', 'Open it here:\n{{link}}'].join('\n\n'),
  },
  rsvpConfirmation: {
    subject: "You're booked: {{eventTitle}}",
    body: [
      'Hi {{name}}, your booking for {{eventTitle}} is confirmed.',
      'When: {{eventDate}}\nGuests: {{guestCount}}',
      'See you there.',
    ].join('\n\n'),
  },
}
