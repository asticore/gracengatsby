import type { CollectionConfig } from 'payload'

import { lexicalEditor } from '@payloadcms/richtext-lexical'

import { adminOrPublishedStatus, isAdmin } from '../access/ecommerceAccess'
import { formatSlugHook } from '../utilities/formatSlug'

export const Events: CollectionConfig = {
  slug: 'events',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'startDate', 'eventType', '_status'],
    group: 'Events',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: adminOrPublishedStatus,
    update: isAdmin,
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
      required: true,
      unique: true,
      admin: {
        position: 'sidebar',
        description: 'Auto-generated from the title if left blank.',
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
      editor: lexicalEditor(),
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
      name: 'rsvps',
      type: 'join',
      collection: 'event-rsvps',
      on: 'event',
      admin: {
        position: 'sidebar',
        defaultColumns: ['name', 'email', 'guestCount', 'createdAt'],
      },
    },
  ],
}
