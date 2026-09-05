/**
 * Engine seam: shop client hooks and context provider.
 *
 * Cart, addresses, currency and payment state for the storefront. Ships to the
 * browser bundle, so it is kept apart from the server-side ../commerce.ts.
 *
 * See ../index.ts for what this directory is and the rules that govern it.
 */

export {
  EcommerceProvider as ShopProvider,
  useAddresses,
  useCart,
  useCurrency,
  usePayments,
} from '@payloadcms/plugin-ecommerce/client/react'

/** Deprecated vendor-named alias - call sites move to `ShopProvider`. */
export { EcommerceProvider } from '@payloadcms/plugin-ecommerce/client/react'
