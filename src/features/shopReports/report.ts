/**
 * Builds the whole Shop reports payload (KPIs, chart series, tables) for one range, cached for five
 * minutes per range and page. Server only. Money is whole cents; the screen formats it in the shop currency.
 */
import { rawD1 } from '@/features/ecommerce/server/db'
import { cachedReport } from './cache'
import { loadAbandoned, loadLowStock } from './queriesStock'
import { loadCategories, loadCoupons, loadKpis, loadLocations, loadPayments, loadSeries, loadTopProducts } from './queries'
import type { ReportRange } from './range'
import { averageOrderCents, fillSeries, pageCount, percentOfTotal } from './shape'
import { PAGE_SIZE } from './queries'

export type ReportPages = { products?: unknown; locations?: unknown; lowStock?: unknown }

export async function buildShopReport(range: ReportRange, pages: ReportPages = {}) {
  const key = JSON.stringify([range.from, range.to, range.bucket, pages.products ?? 1, pages.locations ?? 1, pages.lowStock ?? 1])
  return cachedReport(key, async () => {
    const d1 = (await rawD1()) as unknown as Parameters<typeof loadKpis>[0]
    const [kpis, series, products, categories, coupons, payments, locations, lowStock, abandoned] = await Promise.all([
      loadKpis(d1, range),
      loadSeries(d1, range, range.bucket),
      loadTopProducts(d1, range, pages.products),
      loadCategories(d1, range),
      loadCoupons(d1, range),
      loadPayments(d1, range),
      loadLocations(d1, range, pages.locations),
      loadLowStock(d1, pages.lowStock),
      loadAbandoned(d1, range),
    ])
    const paid = categories.reduce((n, c) => n + c.revenueCents, 0)
    return {
      range,
      kpis: {
        ...kpis,
        netRevenueCents: kpis.revenueCents - kpis.refundsCents,
        averageOrderCents: averageOrderCents(kpis.revenueCents, kpis.orders),
      },
      series: fillSeries(series, range.from, range.to, range.bucket),
      products: { ...products, pageSize: PAGE_SIZE, pages: pageCount(products.total, PAGE_SIZE) },
      categories: categories.map((c) => ({ ...c, sharePct: percentOfTotal(c.revenueCents, paid) })),
      coupons,
      payments,
      locations: { ...locations, pageSize: PAGE_SIZE, pages: pageCount(locations.total, PAGE_SIZE) },
      lowStock: { ...lowStock, pageSize: PAGE_SIZE, pages: pageCount(lowStock.total, PAGE_SIZE) },
      abandoned,
    }
  })
}

export type ShopReport = Awaited<ReturnType<typeof buildShopReport>>
