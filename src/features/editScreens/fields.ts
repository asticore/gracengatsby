import type { Field } from '@/engine'

/**
 * Fields added by the edit-screens audit (trash, sticky posts, reading time,
 * recurring events, ticket tiers). Column names are what
 * src/cms/db/schema/generate.ts produces for them; the migration
 * 20261014_100000_edit_screens creates the same columns. Change one, change both.
 */

/** When the document was moved to the trash; empty for a live document. Hidden: the Trash buttons own it. */
export const trashedAtField: Field = {
  name: 'trashedAt',
  type: 'date',
  admin: { hidden: true, readOnly: true, description: 'Set when the document is moved to the trash. Empty means it is not in the trash.' },
}

export const stickyField: Field = {
  name: 'sticky',
  type: 'checkbox',
  defaultValue: false,
  label: 'Sticky post',
  admin: { position: 'sidebar', description: 'Keeps this post at the top of the blog list, above newer posts.' },
}

export const readingTimeField: Field = {
  name: 'readingTime',
  type: 'number',
  label: 'Reading time (minutes)',
  admin: {
    position: 'sidebar',
    readOnly: true,
    description: 'Worked out from the text each time you save (about 200 words a minute).',
  },
}

export const pageExcerptField: Field = {
  name: 'excerpt',
  type: 'textarea',
  admin: { description: 'A short summary of the page. Used by search results, listings and social previews that ask for one.' },
}

export const pageFeaturedImageField: Field = {
  name: 'featuredImage',
  type: 'upload',
  relationTo: 'media',
  admin: { description: 'The main picture for this page, used where a listing or share preview needs one.' },
}

export const recurrenceField: Field = {
  type: 'group',
  name: 'recurrence',
  label: 'Repeats',
  admin: { description: 'Make this a repeating event. The start and end date above are the first occurrence.' },
  fields: [
    {
      name: 'frequency',
      type: 'select',
      defaultValue: 'none',
      label: 'Repeat',
      options: [
        { label: 'Does not repeat', value: 'none' },
        { label: 'Every day', value: 'daily' },
        { label: 'Every week', value: 'weekly' },
        { label: 'Every month', value: 'monthly' },
      ],
    },
    {
      name: 'interval',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 52,
      label: 'Every how many days, weeks or months',
      admin: { description: '1 means every day, week or month, 2 means every other one.', condition: (_data, siblingData) => Boolean(siblingData?.frequency) && siblingData?.frequency !== 'none' },
    },
    {
      name: 'weekdays',
      type: 'text',
      label: 'On these days (weekly)',
      admin: {
        placeholder: 'Mon, Wed',
        description: 'For a weekly repeat: the days of the week, for example Mon, Wed. Leave blank to use the day of the first date.',
        condition: (_data, siblingData) => siblingData?.frequency === 'weekly',
      },
    },
    {
      name: 'monthlyBy',
      type: 'select',
      defaultValue: 'dayOfMonth',
      label: 'Monthly repeat on',
      options: [
        { label: 'The same date each month', value: 'dayOfMonth' },
        { label: 'The same weekday each month (for example the second Tuesday)', value: 'nthWeekday' },
      ],
      admin: { condition: (_data, siblingData) => siblingData?.frequency === 'monthly' },
    },
    {
      name: 'count',
      type: 'number',
      min: 1,
      max: 52,
      label: 'Number of dates',
      admin: {
        description: 'Stop after this many dates, counting the first one. Leave blank to use the stop date instead. At most 52.',
        condition: (_data, siblingData) => Boolean(siblingData?.frequency) && siblingData?.frequency !== 'none',
      },
    },
    {
      name: 'until',
      type: 'date',
      label: 'Stop repeating after',
      admin: {
        description: 'Leave blank to repeat for a year from the first date.',
        condition: (_data, siblingData) => Boolean(siblingData?.frequency) && siblingData?.frequency !== 'none',
      },
    },
    {
      name: 'exceptions',
      type: 'textarea',
      label: 'Skipped dates',
      admin: {
        description: 'Dates that do not happen, one per line as YYYY-MM-DD (for example a public holiday).',
        condition: (_data, siblingData) => Boolean(siblingData?.frequency) && siblingData?.frequency !== 'none',
      },
    },
  ],
}

export const ticketTiersField: Field = {
  name: 'ticketTiers',
  type: 'json',
  label: 'Ticket tiers',
  admin: {
    description: 'Different kinds of ticket (for example Standard and VIP) shown on the event page. Prices are in dollars.',
    components: { Field: '@/features/editScreens/admin/TicketTiersField#TicketTiersField' },
  },
}

/** The event this one was made from by "Generate occurrences". Set by the generator only. */
export const seriesOfField: Field = {
  name: 'seriesOf',
  type: 'relationship',
  relationTo: 'events',
  hasMany: false,
  admin: { hidden: true, readOnly: true, description: 'The repeating event this date belongs to.' },
}

/** Button under the Repeats group: creates the other dates as drafts. Needs a saved event. */
export const generateOccurrencesField: Field = {
  name: 'generateOccurrences',
  type: 'ui',
  // virtual: no column; the schema generator skips it (the button only runs an action).
  virtual: true,
  admin: { components: { Field: '@/features/editScreens/admin/GenerateOccurrencesField#GenerateOccurrencesField' } },
}

/** The ticket type an RSVP was made for (a name from the event's ticket tiers). */
export const rsvpTicketTierField: Field = {
  name: 'ticketTier',
  type: 'text',
  label: 'Ticket type',
  admin: { description: 'The ticket type chosen on the event page. Blank when the event has no ticket types.' },
}

export const rsvpCheckInFields: Field[] = [
  {
    name: 'checkedIn',
    type: 'checkbox',
    defaultValue: false,
    label: 'Checked in',
    admin: { description: 'Tick when the guest arrives. The event page tabs have a quick toggle.' },
  },
  { name: 'checkedInAt', type: 'date', admin: { readOnly: true, description: 'When the guest was checked in.' } },
]
