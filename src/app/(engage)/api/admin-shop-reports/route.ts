import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { loadShopCurrency } from '@/features/ecommerce/lib/shopCurrency'
import { rawD1 } from '@/features/ecommerce/server/db'
import { buildShopReport } from '@/features/shopReports/report'
import { loadCategories, loadCoupons, loadLocations, loadPayments, loadSeries, loadTopProducts, EXPORT_LIMIT } from '@/features/shopReports/queries'
import { loadLowStock } from '@/features/shopReports/queriesStock'
import { resolveRange, type ReportRange } from '@/features/shopReports/range'
import { centsToDecimal, toCsv, type CsvCell } from '@/features/shopReports/csv'
import { fillSeries } from '@/features/shopReports/shape'

export const dynamic = 'force-dynamic'

type D1 = Parameters<typeof loadSeries>[0]

const CSV_TABLES = ['series', 'products', 'categories', 'coupons', 'payments', 'locations', 'lowstock'] as const
type CsvTable = (typeof CSV_TABLES)[number]

/**
 * GET: the Shop reports payload for a range (needs orders.read or the Shop settings screen).
 *   ?preset=7d|30d|90d|month|custom&from=YYYY-MM-DD&to=YYYY-MM-DD&bucket=day|week|month
 *   &products=N&locations=N&lowStock=N  (pages of those tables)
 * GET with &format=csv&table=... : one table as a CSV file, up to EXPORT_LIMIT rows.
 */
export async function GET(request: Request): Promise<Response> {
  const context = await getAdminContext()
  if (!context.user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
  if (!(context.isAdmin || context.can('orders', 'read'))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const params = new URL(request.url).searchParams
  const range = resolveRange({
    preset: params.get('preset'),
    from: params.get('from'),
    to: params.get('to'),
    bucket: params.get('bucket'),
  })
  const currency = await loadShopCurrency(context.engine as never)

  if (params.get('format') === 'csv') {
    const table = params.get('table')
    if (!table || !(CSV_TABLES as readonly string[]).includes(table)) return NextResponse.json({ error: 'Unknown table.' }, { status: 400 })
    const file = await csvFor(table as CsvTable, range, currency)
    return new Response(file.body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="shop-${table}-${range.from}-to-${range.to}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const report = await buildShopReport(range, {
    products: params.get('products') ?? undefined,
    locations: params.get('locations') ?? undefined,
    lowStock: params.get('lowStock') ?? undefined,
  })
  return NextResponse.json({ currency, report }, { headers: { 'Cache-Control': 'private, max-age=60' } })
}

/** One table as CSV. Money columns are decimal amounts in the shop currency. */
async function csvFor(table: CsvTable, range: ReportRange, currency: string): Promise<{ body: string }> {
  const d1 = (await rawD1()) as unknown as D1
  switch (table) {
    case 'series': {
      const points = fillSeries(await loadSeries(d1, range, range.bucket), range.from, range.to, range.bucket)
      return { body: toCsv(['Period starting', 'Orders', `Revenue (${currency})`], points.map((p) => [p.bucket, p.orders, centsToDecimal(p.revenueCents)])) }
    }
    case 'products': {
      const { rows } = await loadTopProducts(d1, range, 1, EXPORT_LIMIT)
      return { body: toCsv(['Product', 'Product ID', 'Category', 'Units sold', `Revenue (${currency})`], rows.map((r) => [r.name, r.productId, r.category, r.units, centsToDecimal(r.revenueCents)])) }
    }
    case 'categories': {
      const rows = await loadCategories(d1, range)
      return { body: toCsv(['Category', 'Units sold', `Revenue (${currency})`], rows.map((r) => [r.category, r.units, centsToDecimal(r.revenueCents)])) }
    }
    case 'coupons': {
      const rows = await loadCoupons(d1, range)
      return { body: toCsv(['Coupon code', 'Times used', `Discount given (${currency})`], rows.map((r) => [r.code, r.uses, centsToDecimal(r.discountCents)])) }
    }
    case 'payments': {
      const rows = await loadPayments(d1, range)
      return { body: toCsv(['Payment method', 'Orders', `Revenue (${currency})`], rows.map((r) => [r.method, r.orders, centsToDecimal(r.revenueCents)])) }
    }
    case 'locations': {
      const { rows } = await loadLocations(d1, range, 1, EXPORT_LIMIT)
      return { body: toCsv(['Country', 'State', 'Orders', `Revenue (${currency})`], rows.map((r) => [r.country, r.state, r.orders, centsToDecimal(r.revenueCents)])) }
    }
    case 'lowstock': {
      const { rows } = await loadLowStock(d1, 1, EXPORT_LIMIT)
      return { body: toCsv(['Product', 'Product ID', 'SKU', 'Stock left', 'Low stock at'], rows.map((r): CsvCell[] => [r.title, r.productId, r.sku, r.stockQty, r.threshold])) }
    }
  }
}
