import type { CollectionConfig } from '@/engine'

import { richTextEditor } from '@/engine/editor'

import { roleAccess, roleOrPublished } from '../access/ecommerceAccess'
import { seoFields } from '../fields/seo'
import { schemaTypeField } from '../fields/schemaType'
import { authorshipFields, authorshipBeforeChange } from '../fields/authorship'
import { formatSlugHook } from '../utilities/formatSlug'
import { customFieldsField } from '../fields/customFields'
import { publishGuard } from '@/features/roles/contentEditGuard'

export const Events: CollectionConfig = {
  slug: 'events',
  dbName: 'eg_events',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'startDate', 'eventType', '_status'],
    group: 'Content',
    // List/calendar toggle - see the component for why this needs its own
    // direct engine.find() for calendar mode rather than reusing the list
    // route's own paginated `data`.
    components: {
      views: {
        list: {
          Component: '@/views/events/EventsCalendarView#EventsCalendarView',
        },
      },
    },
  },
  access: {
    create: roleAccess('events', 'create'),
    delete: roleAccess('events', 'delete'),
    read: roleOrPublished('events'),
    update: roleAccess('events', 'update'),
  },
  versions: {
    drafts: true,
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-fills from the title as you type - edit it here to override.',
        components: {
          Field: '@/fields/slug/SlugComponent#SlugComponent',
        },
      },
      hooks: {
        beforeValidate: [formatSlugHook('title')],
      },
    },
    {
      name: 'summary',
      type: 'textarea',
      admin: {
        description: 'A short teaser shown on the events list and social previews.',
      },
    },
    {
      name: 'description',
      type: 'richText',
      editor: richTextEditor(),
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      type: 'row',
      fields: [
        {
          name: 'startDate',
          type: 'date',
          required: true,
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
            width: '50%',
          },
        },
        {
          name: 'endDate',
          type: 'date',
          admin: {
            date: {
              pickerAppearance: 'dayAndTime',
            },
            width: '50%',
          },
        },
      ],
    },
    {
      type: 'group',
      name: 'location',
      fields: [
        {
          name: 'venueName',
          type: 'text',
        },
        {
          name: 'address',
          type: 'text',
        },
        {
          name: 'isOnline',
          type: 'checkbox',
          defaultValue: false,
          label: 'This is an online/virtual event',
        },
      ],
    },
    {
      name: 'eventType',
      type: 'select',
      required: true,
      defaultValue: 'free',
      options: [
        { label: 'Free (RSVP)', value: 'free' },
        { label: 'Paid (ticketed)', value: 'paid' },
      ],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'ticketProduct',
      type: 'relationship',
      relationTo: 'products',
      hasMany: false,
      admin: {
        position: 'sidebar',
        description: 'The product used to sell tickets to this event via Stripe checkout.',
        condition: (data) => data?.eventType === 'paid',
      },
    },
    {
      name: 'capacity',
      type: 'number',
      min: 0,
      admin: {
        position: 'sidebar',
        description: 'Leave blank for unlimited capacity.',
      },
    },
    {
      name: 'externalRegistrationUrl',
      type: 'text',
      admin: {
        position: 'sidebar',
        description:
          'Optional. If set, the "Register" button on the event page links straight to this URL (e.g. an external Eventbrite page or form) instead of the built-in RSVP/ticket flow.',
      },
    },
    {
      name: 'rsvps',
      type: 'join',
      collection: 'event-rsvps',
      on: 'event',
      admin: {
        position: 'sidebar',
        defaultColumns: ['name', 'email', 'guestCount', 'createdAt'],
      },
    },
    customFieldsField,
    seoFields,
    ...authorshipFields,
    schemaTypeField('events'),
  ],
  hooks: {
    beforeChange: [authorshipBeforeChange, publishGuard],
  },
}
