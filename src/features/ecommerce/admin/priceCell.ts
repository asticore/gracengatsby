import { formatPriceInAUD } from '@/lib/formatCurrency'

/**
 * `admin.components.Cell` stand-in for Products' `priceInAUD` column
 * (`../collections/Products.ts`) - see `@/admin/cellRegistry.ts`'s header for
 * why this is a plain function rather than a client component like real
 * Payload's own `PriceCell` (`@payloadcms/plugin-ecommerce`'s `ui/PriceCell`).
 *
 * Reuses the SAME `formatPriceInAUD` helper already used for this exact
 * field everywhere it's shown on the storefront (`ProductCard.tsx`,
 * `shop/[slug]/page.tsx`, `cart/page.tsx`) so admin and storefront display
 * stay in agreement. `priceInAUD` is stored in WHOLE currency units, NOT
 * cents - originally used `formatCurrency` here (which divides by 100),
 * found and fixed as part of resolving that unit-convention ambiguity
 * 2026-09-26 (see the plan doc's What's-left item #12) - this Cell was
 * itself displaying prices ~100x too small until then. `formatPriceInAUD`
 * already returns `''` for a missing/non-number value, which `ListView.tsx`
 * already renders as an empty cell - no extra "not set" handling needed here.
 */
export function formatPriceCell(value: unknown): string {
  return formatPriceInAUD(typeof value === 'number' ? value : null)
}
