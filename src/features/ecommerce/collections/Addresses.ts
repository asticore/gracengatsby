import type { CollectionConfig } from '@/engine'

import { isAdmin, isAuthenticated, isCustomer, isDocumentOwner } from '@/access/ecommerceAccess'

/**
 * SHADOW config for the ecommerce plugin's real `addresses` collection - see
 * ./Products.ts's header comment. Reproduced from `createAddressesCollection.js`
 * (`@payloadcms/plugin-ecommerce@3.88.0`, read directly from
 * `node_modules/.pnpm/.../dist/collections/addresses/{createAddressesCollection,hooks/beforeChange}.js`).
 *
 * Ecommerce cutover (Addresses gap, 2026-09-26): the real plugin has NO
 * "default address" field or dedicated address-book endpoints at all - that
 * was an inaccurate description in this file's own earlier comment. What it
 * actually does, and what was genuinely missing here:
 *
 * - **Access was wrong, not just incomplete.** `read`/`update`/`delete` used
 *   to be `isAdmin || isCustomer` - `isCustomer` only checks the caller's
 *   ROLE (any authenticated non-admin), not whether THIS address document
 *   belongs to them. Any signed-in customer could read/edit/delete any OTHER
 *   customer's saved address. Real Payload's own access is `accessOR(isAdmin,
 *   isDocumentOwner)` for those three - `isDocumentOwner` (`@/access/
 *   ecommerceAccess`, already used correctly by `./Carts.ts`) resolves to a
 *   `{customer: {equals: req.user.id}}` Where clause for a non-admin, which
 *   this app's own access layer enforces the same way real Payload does.
 *   `create` is real Payload's plain `isAuthenticated` (any signed-in user,
 *   not customer-only - an admin creating an address for someone else still
 *   needs to be able to create one at all before the beforeChange hook below
 *   can even run for a non-admin caller).
 * - **The `customer` field was never auto-assigned.** Real Payload's
 *   `beforeChange` hook force-sets `data.customer = req.user.id` whenever the
 *   acting user is a customer (never an admin) - a customer's own create/
 *   update requests can't set someone else's `customer` id even if they send
 *   one, and don't need to send one at all. Reproduced verbatim below.
 * - **"Multiple addresses per customer"** was never actually missing - it's
 *   just what a normal collection with a `customer` relationship + this
 *   app's already-generic REST CRUD (`src/localapi/rest.ts`) gives you for
 *   free. No dedicated address-book endpoint exists in the real plugin
 *   either.
 */
export const Addresses: CollectionConfig = {
  slug: 'addresses',
  dbName: 'eg_addresses',
  labels: { singular: 'Address', plural: 'Addresses' },
  admin: {
    group: 'Ecommerce',
    useAsTitle: 'addressLine1',
  },
  access: {
    create: (args) => isAdmin(args) || isAuthenticated(args),
    read: (args) => isAdmin(args) || isDocumentOwner(args),
    update: (args) => isAdmin(args) || isDocumentOwner(args),
    delete: (args) => isAdmin(args) || isDocumentOwner(args),
  },
  hooks: {
    beforeChange: [
      ({ data, req }: Record<string, unknown> & { data: Record<string, unknown> }) => {
        // Mirrors real Payload's own addresses `beforeChange` exactly: a
        // customer (never an admin) always gets `data.customer` forced to
        // their own id, regardless of what they sent.
        const user = (req as { user?: { id: number } | null }).user
        // `isCustomer` is typed against real Payload's own `FieldAccess`
        // (`@/engine`), which wants a full `PayloadRequest` - this hook's own
        // `req` is this app's looser `LocalReq`-shaped object (same as every
        // other collection hook in this app, e.g. `beforeChangeCart`), so
        // only `req.user` is ever actually read by `isCustomer` regardless.
        if (user && isCustomer({ req } as Parameters<typeof isCustomer>[0])) {
          data.customer = user.id
        }
        return data
      },
    ],
  },
  timestamps: true,
  fields: [
    { name: 'customer', type: 'relationship', relationTo: 'users', admin: { position: 'sidebar' } },
    { name: 'title', type: 'text', admin: { position: 'sidebar' } },
    { name: 'firstName', type: 'text' },
    { name: 'lastName', type: 'text' },
    { name: 'company', type: 'text' },
    { name: 'addressLine1', type: 'text', required: true },
    { name: 'addressLine2', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'state', type: 'text' },
    { name: 'postalCode', type: 'text' },
    {
      name: 'country',
      type: 'select',
      required: true,
      options: [
        { label: 'United States', value: 'US' },
        { label: 'Australia', value: 'AU' },
        { label: 'Canada', value: 'CA' },
        { label: 'United Kingdom', value: 'UK' },
      ],
    },
    { name: 'phone', type: 'text' },
  ],
}
