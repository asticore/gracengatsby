import { formatCurrency } from '@/lib/formatCurrency'

/**
 * `admin.components.Cell` stand-in for Products' `priceInAUD` column
 * (`../collections/Products.ts`) - see `@/admin/cellRegistry.ts`'s header for
 * why this is a plain function rather than a client component like real
 * Payload's own `PriceCell` (`@payloadcms/plugin-ecommerce`'s `ui/PriceCell`).
 *
 * Deliberately reuses the SAME `formatCurrency` helper already used for this
 * exact field everywhere it's shown on the storefront (`ProductCard.tsx`,
 * `shop/[slug]/page.tsx`, `cart/page.tsx`) rather than inventing a second,
 * possibly-divergent formatting convention just for the admin list - whatever
 * `priceInAUD`'s true unit convention is, this keeps admin and storefront
 * display in agreement. `formatCurrency` already returns `''` for a
 * missing/non-number value, which `ListView.tsx` already renders as an empty
 * cell - no extra "not set" handling needed here.
 */
export function formatPriceCell(value: unknown): string {
  return formatCurrency(typeof value === 'number' ? value : null)
}
