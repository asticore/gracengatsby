'use client'

import React from 'react'

import { CollapsibleCard } from '@/admin/components/CollapsibleCard'
import { formatMoney } from '@/features/ecommerce/lib/money'
import type { ShopReport } from './report'

type Props = {
  report: ShopReport
  currency: string
  csvQuery: string
  onPage: (table: 'products' | 'locations' | 'lowStock', page: number) => void
}

const pctText = (value: number | null) => (value === null ? '-' : `${value}%`)

/** The detail tables. Each sits in a collapsible card (closed until opened) with a CSV download. */
export function ShopReportTables({ report, currency, csvQuery, onPage }: Props) {
  const money = (cents: number) => formatMoney(cents, currency)
  return (
    <div className="shop-reports__tables">
      <CollapsibleCard id="shop-reports-products" title="Top products">
        <Table
          empty="No product sales in this range."
          csv={`${csvQuery}&format=csv&table=products`}
          head={['Product', 'Category', 'Units sold', 'Revenue']}
          rows={report.products.rows.map((r) => [r.name, r.category ?? '-', r.units, money(r.revenueCents)])}
          pager={{ page: report.products.page, pages: report.products.pages, onPage: (p) => onPage('products', p) }}
        />
      </CollapsibleCard>
      <CollapsibleCard id="shop-reports-categories" title="Sales by category">
        <Table
          empty="No category sales in this range."
          csv={`${csvQuery}&format=csv&table=categories`}
          head={['Category', 'Units sold', 'Revenue', 'Share']}
          rows={report.categories.map((c) => [c.category, c.units, money(c.revenueCents), pctText(c.sharePct)])}
        />
      </CollapsibleCard>
      <CollapsibleCard id="shop-reports-coupons" title="Coupon use">
        <Table
          empty="No coupons were used in this range."
          csv={`${csvQuery}&format=csv&table=coupons`}
          head={['Coupon code', 'Times used', 'Discount given']}
          rows={report.coupons.map((c) => [c.code, c.uses, money(c.discountCents)])}
        />
      </CollapsibleCard>
      <CollapsibleCard id="shop-reports-payments" title="Sales by payment method">
        <Table
          empty="No paid orders in this range."
          csv={`${csvQuery}&format=csv&table=payments`}
          head={['Payment method', 'Orders', 'Revenue']}
          rows={report.payments.map((p) => [p.method === 'none' ? 'None (gift card or store credit only)' : p.method, p.orders, money(p.revenueCents)])}
        />
      </CollapsibleCard>
      <CollapsibleCard id="shop-reports-locations" title="Sales by country and state">
        <Table
          empty="No paid orders in this range."
          csv={`${csvQuery}&format=csv&table=locations`}
          head={['Country', 'State', 'Orders', 'Revenue']}
          rows={report.locations.rows.map((l) => [l.country, l.state || '-', l.orders, money(l.revenueCents)])}
          pager={{ page: report.locations.page, pages: report.locations.pages, onPage: (p) => onPage('locations', p) }}
        />
      </CollapsibleCard>
      <CollapsibleCard id="shop-reports-lowstock" title="Low stock">
        <Table
          empty="No products are at or under their low stock level."
          csv={`${csvQuery}&format=csv&table=lowstock`}
          head={['Product', 'SKU', 'Stock left', 'Low stock level']}
          rows={report.lowStock.rows.map((r) => [r.title, r.sku ?? '-', r.stockQty, r.threshold])}
          pager={{ page: report.lowStock.page, pages: report.lowStock.pages, onPage: (p) => onPage('lowStock', p) }}
        />
      </CollapsibleCard>
      <CollapsibleCard id="shop-reports-abandoned" title="Abandoned carts">
        <dl className="shop-reports__pairs">
          <dt title="Carts with an email address that were not bought, last changed in this range.">Carts left behind</dt>
          <dd>{report.abandoned.abandoned}</dd>
          <dt title="Carts that got at least one reminder email.">Carts sent a reminder</dt>
          <dd>{report.abandoned.reminded}</dd>
          <dt title="Reminded carts that were bought later, in this range.">Bought after a reminder</dt>
          <dd>{report.abandoned.recovered}</dd>
          <dt title="Bought after a reminder, as a share of carts sent a reminder.">Recovery rate</dt>
          <dd>{pctText(report.abandoned.recoveryRatePct)}</dd>
        </dl>
      </CollapsibleCard>
    </div>
  )
}

type Pager = { page: number; pages: number; onPage: (page: number) => void }

function Table({ head, rows, empty, csv, pager }: { head: string[]; rows: (string | number)[][]; empty: string; csv: string; pager?: Pager }) {
  return (
    <div className="shop-reports__table-wrap">
      <div className="shop-reports__table-actions">
        <a className="shop-reports__csv" href={`/api/admin-shop-reports?${csv}`} download title="Download this table as a spreadsheet file (up to 5,000 rows).">
          Download CSV
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="shop-reports__empty">{empty}</p>
      ) : (
        <table className="shop-reports__table">
          <thead>
            <tr>
              {head.map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pager && pager.pages > 1 ? (
        <div className="shop-reports__pager">
          <button type="button" disabled={pager.page <= 1} onClick={() => pager.onPage(pager.page - 1)}>
            Previous
          </button>
          <span>
            Page {pager.page} of {pager.pages}
          </span>
          <button type="button" disabled={pager.page >= pager.pages} onClick={() => pager.onPage(pager.page + 1)}>
            Next
          </button>
        </div>
      ) : null}
    </div>
  )
}
