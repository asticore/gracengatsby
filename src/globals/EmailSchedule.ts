import type { GlobalConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'

/**
 * When emails are sent: one place to switch each automatic email on or off, and
 * to set how far ahead the reminders go and when scheduled emails pause.
 *
 * A switch that is off means that email is not sent. The attempt is still
 * recorded in the email log as skipped. Transactional emails (password resets)
 * are always on, and quiet hours only hold reminders, never anything the person
 * asked for.
 *
 * Abandoned cart emails are not listed here: their delays live in Shop settings,
 * and the Communication page points there.
 */

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => {
  const value = `${String(hour).padStart(2, '0')}:00`
  return { label: value, value }
})

const sendSwitch = (name: string, label: string, description: string) => ({
  type: 'group' as const,
  name,
  label,
  admin: { description },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox' as const,
      label: 'Send this email',
      defaultValue: true,
      admin: { description: 'Untick to stop this email. Nothing is sent, and the attempt is logged as skipped.' },
    },
  ],
})

export const EmailSchedule: GlobalConfig = {
  slug: 'email-schedule',
  label: 'When emails are sent',
  dbName: 'eg_email_schedule',
  admin: {
    group: 'Settings',
    description: 'Switch each automatic email on or off, and set the timing of reminders.',
  },
  access: {
    read: () => true,
    update: isAdmin,
  },
  fields: [
    sendSwitch('accountWelcome', 'Welcome to a new account', 'Sent when someone creates an account.'),
    {
      type: 'group',
      name: 'accountReset',
      label: 'Password reset',
      admin: {
        description: 'Always on. Password reset emails cannot be turned off, because people need them to get back into their account.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Send this email',
          defaultValue: true,
          admin: { readOnly: true, description: 'Locked on. Password reset emails are always sent.' },
        },
      ],
    },
    sendSwitch(
      'accountAlreadyRegistered',
      'Already registered',
      'Sent when someone tries to create an account with an address that already has one.',
    ),
    {
      type: 'group',
      name: 'membershipRenewal',
      label: 'Membership renewal reminder',
      admin: { description: 'Sent a set number of days before a membership renews. Reminders pause during quiet hours.' },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Send this email',
          defaultValue: true,
          admin: { description: 'Untick to stop renewal reminders.' },
        },
        {
          name: 'daysBefore',
          type: 'number',
          label: 'Days before renewal',
          defaultValue: 7,
          min: 1,
          admin: { description: 'How many days before renewal the reminder is sent. Whole days, at least 1.' },
        },
      ],
    },
    sendSwitch('rsvpConfirmation', 'Event booking confirmation', 'Sent to a guest when they book a place at an event.'),
    {
      type: 'group',
      name: 'eventReminder',
      label: 'Event reminder',
      admin: {
        description: 'Sent once to each guest who gave an email address, a set number of hours before the event starts. Off by default.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Send this email',
          defaultValue: false,
          admin: { description: 'Tick to send reminders to guests before their event.' },
        },
        {
          name: 'hoursBefore',
          type: 'number',
          label: 'Hours before the event',
          defaultValue: 24,
          min: 1,
          admin: { description: 'How many hours before the start the reminder is sent. At least 1.' },
        },
      ],
    },
    sendSwitch('approvalSubmitted', 'Review requested', 'Sent to reviewers when something is sent to them for approval.'),
    sendSwitch('approvalDecision', 'Review decision', 'Sent to the person who asked for a review, when it is approved or sent back.'),
    sendSwitch('backInStock', 'Back in stock', 'Sent to shoppers who asked to be told when a product is back.'),
    sendSwitch('lowStockAlert', 'Low stock alert', 'Sent to the shop admin when a product is low or out of stock.'),
    {
      type: 'group',
      name: 'quietHours',
      label: 'Quiet hours',
      admin: {
        description:
          'Reminders are held during quiet hours and sent once they end. Emails someone has asked for, such as a password reset or a booking confirmation, are never held.',
      },
      fields: [
        {
          name: 'enabled',
          type: 'checkbox',
          label: 'Hold reminders during quiet hours',
          defaultValue: false,
          admin: { description: 'Times are in the site time zone, set under Site details.' },
        },
        {
          name: 'start',
          type: 'select',
          label: 'Quiet hours start',
          defaultValue: '21:00',
          options: HOUR_OPTIONS,
        },
        {
          name: 'end',
          type: 'select',
          label: 'Quiet hours end',
          defaultValue: '07:00',
          options: HOUR_OPTIONS,
        },
      ],
    },
  ],
}