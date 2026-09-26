/**
 * Server-side counterpart to `./componentRegistry.ts`, for `admin.components.Cell`
 * overrides - the gap noted in the plan doc ("`ListView.tsx` has no per-field
 * `Cell`-override mechanism at all"). Unlike `Field` overrides (consumed by the
 * CLIENT `fields/FieldRenderer.tsx`, which needs real interactivity to edit a
 * value), `ListView.tsx` is a server component with no interactivity in its
 * cells at all - a plain formatting function is enough, no need to ship a React
 * client component to the browser for read-only list display. Real Payload's
 * own `admin.components.Cell` is a full client component (see e.g.
 * `@payloadcms/plugin-ecommerce`'s `PriceCell`, a `'use client'` component
 * using `Intl.NumberFormat`); this is a deliberately simpler stand-in matching
 * this app's server-rendered list view - same simplification pattern as
 * `componentRegistry.ts` collapsing real Payload's `{path, clientProps}` object
 * shape down to a bare string identifier.
 *
 * Maps the SAME `'<module-path>#<ExportName>'` identifier convention used by
 * `componentRegistry.ts`, resolved here by `ListView.tsx` - the only caller of
 * `resolveCellFormatter`. A field declares an override via a plain string at
 * `field.admin.components.Cell`, exactly mirroring `.Field`.
 */

import { formatPriceCell } from '@/features/ecommerce/admin/priceCell'

export type CellFormatter = (value: unknown, doc: Record<string, unknown>) => string

export const CELL_REGISTRY: Record<string, CellFormatter> = {
  '@/features/ecommerce/admin/priceCell#formatPriceCell': formatPriceCell,
}

export function resolveCellFormatter(path: string | undefined | null): CellFormatter | undefined {
  if (!path) return undefined
  return CELL_REGISTRY[path]
}
