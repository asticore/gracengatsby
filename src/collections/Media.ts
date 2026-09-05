import type { CollectionConfig } from '@/engine'

import { isAdmin } from '../access/ecommerceAccess'

export const Media: CollectionConfig = {
  slug: 'media',
  dbName: 'eg_media',
  admin: {
    group: 'Content',
  },
  // Only `read` was set here, so writes fell through to the engine default of
  // "anyone signed in" - which includes every customer account. That allowed
  // any customer to upload arbitrary files served from this origin (an SVG or
  // HTML upload is a stored-XSS vector) and to delete existing images.
  access: {
    create: isAdmin,
    read: () => true,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
  ],
  upload: {
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
  },
}
