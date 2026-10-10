import type { CollectionConfig } from '@/engine'

import { roleAccess } from '../access/ecommerceAccess'

export const Media: CollectionConfig = {
  slug: 'media',
  dbName: 'eg_media',
  admin: {
    group: 'Content',
    // Thumbnail gallery instead of the stock row table - see the component
    // for why "different sizes" means on-screen tile density rather than
    // sharp-generated image variants (unavailable on this app's Workers
    // runtime, same reason `crop`/`focalPoint` are off below).
    components: {
      views: {
        list: {
          Component: '@/views/media/MediaGalleryView#MediaGalleryView',
        },
      },
      // Tools above the edit form: replace the file, optimise, generate alt
      // text and see where the picture is used. Registered in componentRegistry.
      edit: {
        beforeDocumentControls: ['@/features/media/admin/MediaEditPanel#MediaEditPanel'],
      },
    },
  },
  // Only `read` was set here, so writes fell through to the engine default of
  // "anyone signed in" - which includes every customer account. That allowed
  // any customer to upload arbitrary files served from this origin (an SVG or
  // HTML upload is a stored-XSS vector) and to delete existing images.
  access: {
    create: roleAccess('media', 'create'),
    read: () => true,
    update: roleAccess('media', 'update'),
    delete: roleAccess('media', 'delete'),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      admin: {
        description: 'Describes the picture for screen readers and search engines. The gallery can draft this for you.',
      },
    },
    {
      name: 'caption',
      type: 'text',
      admin: { description: 'Optional text shown under the picture where it is used.' },
    },
    {
      name: 'folder',
      type: 'text',
      defaultValue: '',
      admin: {
        position: 'sidebar',
        description: 'Optional folder path such as products/summer. Use slashes to nest folders. Leave blank for the top level.',
      },
    },
    {
      name: 'focalX',
      type: 'number',
      defaultValue: 50,
      min: 0,
      max: 100,
      admin: {
        description: 'Where the subject sits when the picture is cropped. Click the preview to set the point.',
        components: {
          Field: '@/features/media/admin/MediaFocalPointField#MediaFocalPointField',
        },
      },
    },
    {
      // Set together with focalX by the focal point editor above, so it has no
      // input of its own.
      name: 'focalY',
      type: 'number',
      defaultValue: 50,
      min: 0,
      max: 100,
      admin: { hidden: true },
    },
    {
      name: 'crop',
      type: 'json',
      admin: {
        description: 'Crop preset used when the picture is shown in a fixed shape. The original file is never changed.',
        components: {
          Field: '@/features/media/admin/MediaCropField#MediaCropField',
        },
      },
    },
    {
      name: 'credit',
      type: 'text',
      admin: { description: 'Photographer or source credit, shown where the picture is used.' },
    },
    {
      name: 'license',
      type: 'text',
      admin: { description: 'Licence of the picture, for example CC BY 2.0 or Unsplash License.' },
    },
    {
      name: 'sourceUrl',
      type: 'text',
      label: 'Source URL',
      admin: { description: 'Where the picture was found.' },
    },
    {
      name: 'source',
      type: 'select',
      defaultValue: 'upload',
      options: [
        { label: 'Uploaded', value: 'upload' },
        { label: 'Unsplash', value: 'unsplash' },
        { label: 'Pexels', value: 'pexels' },
        { label: 'Pixabay', value: 'pixabay' },
        { label: 'Openverse', value: 'openverse' },
      ],
      admin: { position: 'sidebar', readOnly: true },
    },
    {
      name: 'originalSize',
      type: 'number',
      admin: { readOnly: true, description: 'Size in bytes before optimisation.' },
    },
    {
      name: 'optimizedSize',
      type: 'number',
      admin: { readOnly: true, description: 'Size in bytes after optimisation. Blank if never optimised.' },
    },
  ],
  upload: {
    // These are not supported on Workers yet due to lack of sharp
    crop: false,
    focalPoint: false,
  },
}
