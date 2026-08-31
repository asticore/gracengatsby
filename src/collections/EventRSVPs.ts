import type { CollectionConfig } from 'payload'

import { isAdmin } from '../access/ecommerceAccess'
import { isAdminOrRsvpOwner } from '../features/accounts/access'
import { checkEventCapacity } from '../hooks/checkEventCapacity'

export const EventRSVPs: CollectionConfig = {
  slug: 'event-rsvps',
  dbName: 'eg_event_rsvps',
  labels: {
    singular: 'Event RSVP',
    plural: 'Event RSVPs',
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['event', 'name', 'email', 'guestCount', 'createdAt'],
    group: 'Content',
  },
  access: {
    // Anyone can RSVP to a free event from the public site.
    create: () => true,
    delete: isAdmin,
    // Admins see every booking; a signed-in customer sees the ones left under
    // their own address, and nothing else. Written as a rule on the collection
    // rather than as a filter in the account screens, so a query that forgets
    // the filter returns nothing instead of everything.
    read: isAdminOrRsvpOwner,
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
