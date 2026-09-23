import type { CollectionConfig } from '@/engine'

import { isAdmin } from '@/access/ecommerceAccess'

import { pageBuilderBlocks } from '@/cms/config/blockLibrary'

/**
 * SHADOW config for the ecommerce plugin's real `products` collection - see
 * ./Addresses.ts's header comment. Reproduced from `createProductsCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`, Phase 19: cut over from Payload's
 * own real collection type) with added `versions: { drafts: true }`
 * (Stage 10 - first ecommerce collection with versioning) and `trash: true`
 * (soft-delete support - new in generate.ts this stage). A SHADOW config
 * means this is a local TypeScript mirror of what the real ecommerce plugin
 * registers dynamically at import time: when that plugin is eventually
 * removed (payload-removal-plan.md), this becomes the canonical config, and
 * the matching schema/db-layer boilerplate gets generated once from it via
 * the existing codegen pipeline (src/cms/db/schema/generate.ts). Until then,
 * any schema/slug/relationship changes here must be mirrored in the real
 * plugin config as well - see the plugin's own ./createProductsCollection.js
 * and the existing "SHADOW config" notes on Addresses.ts/Carts.ts/Orders.ts/
 * Transactions.ts.
 *
 * DELIBERATELY NOT MODELED HERE (Layer 2/3, not this DB-layer stage - see
 * payload-removal-plan.md's Ecommerce scoping):
 *  - The custom product stripe sync hooks (`beforeChangeProduct`,
 *    `afterChangeProduct`, `afterDeleteProduct`).
 *  - Product variant storage (products' `stripeProductID`/`variants` fields
 *    are admin-only for phase 19, not exposed to the storefront yet - Phase
 *    20 territory).
 *  - Product visibility/access control beyond admin access (product search
 *    endpoint is Layer 2).
 */
export const Products: CollectionConfig = {
  slug: 'products',
  dbName: 'eg_products',
  labels: { singular: 'Product', plural: 'Products' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'title',
  },
  access: {
    create: isAdmin,
    read: () => true,
    update: isAdmin,
    delete: isAdmin,
  },
  versions: { drafts: true },
  timestamps: true,
  trash: true,
  fields: [
    { name: 'title', type: 'text', required: true, unique: true },
    { name: 'slug', type: 'text', unique: true, index: true },
    {
      name: 'category',
      type: 'select',
      options: [
        { label: 'Apparel', value: 'apparel' },
        { label: 'Digital', value: 'digital' },
        { label: 'Physical', value: 'physical' },
      ],
    },
    { name: 'shortDescription', type: 'textarea' },
    { name: 'description', type: 'richText', admin: { elements: ['link'] } },
    { name: 'images', type: 'upload', relationTo: 'media', hasMany: true },
    { name: 'faqs', type: 'relationship', relationTo: 'faqs', hasMany: true },
    {
      name: 'layout',
      type: 'blocks',
      blocks: pageBuilderBlocks,
    },
    {
      type: 'group',
      name: 'seo',
      label: 'SEO',
      fields: [
        { name: 'metaTitle', type: 'text' },
        { name: 'metaDescription', type: 'textarea' },
        { name: 'ogImage', type: 'upload', relationTo: 'media' },
        { name: 'noIndex', type: 'checkbox' },
      ],
    },
    { name: 'customFields', type: 'json' },
    { name: 'inventory', type: 'number' },
    {
      type: 'row',
      fields: [
        { name: 'priceInAUDEnabled', type: 'checkbox' },
        { name: 'priceInAUD', type: 'number' },
      ],
    },
  ],
}