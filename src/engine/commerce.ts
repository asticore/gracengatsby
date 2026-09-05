/**
 * Engine seam: the shop plugin, server side.
 *
 * Supplies the product/variant/cart/order collections and the payment
 * adapter wiring. Only mounted when the Shop feature is on
 * (src/features/registry.ts), which makes this one of the more separable
 * subsystems - the site runs without it.
 *
 * See ./index.ts for what this directory is and the rules that govern it.
 */

export { ecommercePlugin as shopPlugin } from '@payloadcms/plugin-ecommerce'

/** Deprecated vendor-named alias - call sites move to `shopPlugin`. */
export { ecommercePlugin } from '@payloadcms/plugin-ecommerce'
