import type { CollectionConfig } from 'payload'

import { adminOrPublishedStatus, isAdmin } from '../access/ecommerceAccess'
import { formatSlugHook } from '../utilities/formatSlug'
import { HeroBlock } from '../blocks/Hero'
import { RichTextBlock } from '../blocks/RichTextBlock'
import { ImageTextBlock } from '../blocks/ImageText'
import { ProductGridBlock } from '../blocks/ProductGrid'
import { EventGridBlock } from '../blocks/EventGrid'
import { GalleryBlock } from '../blocks/Gallery'
import { CtaBannerBlock } from '../blocks/CtaBanner'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', '_status'],
    group: 'Site Settings',
    description:
      'Build out extra pages (About, Lookbook, Contact, etc.) from a library of sections. Add the finished page to the menu under Site Settings -> Navigation to link to it.',
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
        description:
          'Auto-generated from the title if left blank. This becomes the page URL - e.g. "about-us" -> /about-us.',
      },
      hooks: {
        beforeValidate: [formatSlugHook('title')],
      },
    },
    {
      name: 'blocks',
      type: 'blocks',
      minRows: 1,
      labels: { singular: 'Section', plural: 'Sections' },
      blocks: [
        HeroBlock,
        RichTextBlock,
        ImageTextBlock,
        ProductGridBlock,
        EventGridBlock,
        GalleryBlock,
        CtaBannerBlock,
      ],
    },
  ],
}
