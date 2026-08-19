import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { checkEventCapacity } from '../hooks/checkEventCapacity'

export const EventRSVPs: CollectionConfig = {
  slug: 'event-rsvps',
  labels: {
    singular: 'Event RSVP',
    plural: 'Event RSVPs',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['event', 'name', 'email', 'guestCount', 'createdAt'],
    group: 'Events',
  },
  access: {
    // Anyone can RSVP to a free event from the public site.
    create: () => true,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    {
      name: 'event',
      type: 'relationship',
      relationTo: 'events',
      required: true,
      index: true,
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'email',
      type: 'email',
      required: true,
    },
    {
      name: 'guestCount',
      type: 'number',
      defaultValue: 1,
      min: 1,
      label: 'Number of guests (including yourself)',
    },
    {
      name: 'notes',
      type: 'textarea',
    },
  ],
  hooks: {
    beforeChange: [checkEventCapacity],
  },
  timestamps: true,
}
