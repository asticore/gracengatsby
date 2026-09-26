import type { CollectionConfig } from '@/engine'

import { adminOrPublishedStatus, isAdmin } from '@/access/ecommerceAccess'

import { pageBuilderBlocks } from '@/blocks'
import { richTextEditor } from '@/engine/editor'

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
 * Ecommerce cutover (Products gap, 2026-09-26): investigated the "product
 * stripe sync hooks" this comment used to list as deliberately deferred -
 * they don't exist. `createProductsCollection.js` (read directly, all 62
 * lines) declares no `hooks` key at all, and there is no `hooks/`
 * subdirectory under this plugin version's `dist/collections/products/`
 * (confirmed via `ls`) - same false-premise pattern already found and
 * corrected on Orders.ts. This plugin never syncs a Stripe Product/Price
 * catalog; checkout goes straight through PaymentIntents against cart
 * totals (`stripeAdapter.ts`'s own inventory-decrement-at-checkout logic is
 * this app's already-working equivalent of the real plugin's checkout-time
 * `productsValidation` re-check). Nothing to port.
 *
 * Found and fixed a real gap instead: `read` was `() => true` (unconditional
 * public read) - real Payload uses `access.adminOrPublishedStatus`
 * (`createProductsCollection.js:28-33`), gating non-admin reads on
 * `_status: 'published'`. This shadow was letting anyone read draft/
 * unpublished products. Fixed to `adminOrPublishedStatus`
 * (`@/access/ecommerceAccess`, already used elsewhere e.g. Pages.ts).
 * `create`/`update`/`delete` were already correct (`isAdmin`-only, matching
 * the real plugin exactly). No field-level access exists on any real product
 * field either (`amountField.js`/`inventoryField.js`/`pricesField.js`/
 * `variantsFields.js` all have zero `access` keys) - correctly unmodeled
 * here, no isCustomer/isDocumentOwner bug class applies to Products.
 *
 * Also matched real `inventoryField.js`'s `defaultValue: 0, min: 0`
 * (previously a bare, unconstrained number here).
 *
 * DELIBERATELY NOT MODELED HERE (Layer 2/3, not this DB-layer stage - see
 * payload-removal-plan.md's Ecommerce scoping):
 *  - Product variant storage (products' `stripeProductID`/`variants` fields
 *    are admin-only for phase 19, not exposed to the storefront yet - Phase
 *    20 territory).
 *  - Real `pricesField.js`'s per-currency `group` nesting (a `priceInAUD`
 *    group containing a row of `priceInAUDEnabled` + amount) vs. this
 *    shadow's flattened top-level `row` - a structural difference at the
 *    admin-UI/field-shape level, not an access or security gap; left as-is
 *    pending a decision on whether the DB-layer codegen needs the real
 *    nesting before this collection is ever driven by the real plugin's own
 *    schema generation.
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
    read: adminOrPublishedStatus,
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
    { name: 'description', type: 'richText', editor: richTextEditor() },
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
    { name: 'inventory', type: 'number', defaultValue: 0, min: 0 },
    {
      type: 'row',
      fields: [
        { name: 'priceInAUDEnabled', type: 'checkbox' },
        { name: 'priceInAUD', type: 'number' },
      ],
    },
  ],
}
