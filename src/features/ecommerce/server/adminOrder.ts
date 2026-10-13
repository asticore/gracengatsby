import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { resolveAccess } from '@/features/roles/permissions'
import type { InvoiceOrder, InvoiceStore } from '../lib/invoice'
import type { InvoiceSettings } from '../lib/invoiceSettings'

type Doc = Record<string, unknown>
export type AdminEngine = {
  findByID: (a: unknown) => Promise<Doc | null>
  find: (a: unknown) => Promise<{ docs: Doc[] }>
  findGlobal: (a: unknown) => Promise<Doc>
  create: (a: unknown) => Promise<Doc>
  update: (a: unknown) => Promise<Doc>
}

/** Admin, or a role holding the given orders permission. Everyone else gets a ready-made refusal. */
export async function authorizeOrders(action: 'read' | 'update') {
  const context = await getAdminContext()
  if (!context.user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  if (!(context.isAdmin || resolveAccess(context.user as never, 'orders', action) === 'all')) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true as const, context, engine: context.engine as unknown as AdminEngine, user: context.user as unknown as { id: number; email?: string } }
}

export function parseOrderId(raw: string): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function loadInvoiceData(engine: AdminEngine, id: number): Promise<{ order: InvoiceOrder; store: InvoiceStore; settings: Partial<InvoiceSettings> } | null> {
  const order = await engine.findByID({ collection: 'orders', id, depth: 0, overrideAccess: true })
  if (!order) return null
  const shop = (await engine.findGlobal({ slug: 'shop-settings', depth: 0, overrideAccess: true }).catch((): Doc => ({}))) as { tax?: Doc; invoice?: Partial<InvoiceSettings> }
  const site = (await engine.findGlobal({ slug: 'site-settings', depth: 0, overrideAccess: true }).catch((): Doc => ({}))) as { siteName?: string }
  const tax = shop.tax ?? {}
  return {
    order: order as unknown as InvoiceOrder,
    settings: shop.invoice ?? {},
    store: {
      name: String(tax.businessName || site.siteName || 'Shop'),
      abn: typeof tax.abn === 'string' ? tax.abn : null,
      address: typeof tax.businessAddress === 'string' ? tax.businessAddress : null,
    },
  }
}

export function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
