import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { effectiveRate, MAX_DISPLAY_CURRENCIES, RATE_ATTRIBUTION } from '@/features/ecommerce/lib/displayCurrency'
import { validateDisplayCurrencies } from '@/features/ecommerce/lib/displayCurrencyRows'
import { loadShopCurrency } from '@/features/ecommerce/lib/shopCurrency'
import { listDisplayCurrencyRows, saveDisplayCurrencyRows, type DisplayCurrencyRow } from '@/features/ecommerce/server/displayCurrencies'
import { rawD1 } from '@/features/ecommerce/server/db'
import { refreshDisplayRates } from '@/features/ecommerce/server/displayRates'

export const dynamic = 'force-dynamic'

type Ctx = Awaited<ReturnType<typeof getAdminContext>>

async function authorize(action: 'read' | 'update'): Promise<{ ctx: Ctx } | { response: Response }> {
  const ctx = await getAdminContext()
  if (!ctx.user) return { response: NextResponse.json({ error: 'Unauthorised' }, { status: 401 }) }
  if (!(ctx.isAdmin || ctx.can('settings:shop-settings', action))) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ctx }
}

function describe(row: DisplayCurrencyRow) {
  const auto = row.rate_mode === 'auto'
  const rate = effectiveRate(row)
  return {
    code: row.code,
    enabled: row.enabled === 1,
    rateMode: auto ? 'auto' : 'manual',
    manualRate: row.manual_rate,
    autoRate: row.auto_rate,
    autoRateAt: row.auto_rate_at,
    // A usable rate: a manual one, or an automatic one fetched for the current shop currency.
    shownRate: rate,
    usable: rate !== null && (!auto || row.auto_rate_base !== null),
  }
}

/** GET: the list, with the rate that is in use for each. Needs Shop settings read. */
export async function GET(): Promise<Response> {
  const auth = await authorize('read')
  if ('response' in auth) return auth.response
  const base = await loadShopCurrency(auth.ctx.engine as never)
  const rows = await listDisplayCurrencyRows((await rawD1()) as never)
  return NextResponse.json(
    { base, attribution: RATE_ATTRIBUTION, maxCurrencies: MAX_DISPLAY_CURRENCIES, currencies: rows.map(describe) },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * POST { currencies: [{code, enabled, rateMode, manualRate}] } saves the list (needs Shop settings update).
 * POST { action: 'refresh' } fetches the automatic rates now instead of waiting for the hourly job.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorize('update')
  if ('response' in auth) return auth.response
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const base = await loadShopCurrency(auth.ctx.engine as never)
  const d1 = (await rawD1()) as never

  if (body.action === 'refresh') {
    try {
      const result = await refreshDisplayRates(d1, base, new Date(), { force: true })
      return NextResponse.json({ refreshed: result.codes, missing: result.missing })
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'The rates could not be fetched.' }, { status: 502 })
    }
  }

  const checked = validateDisplayCurrencies(body.currencies, base)
  if (checked.error) return NextResponse.json({ error: checked.error }, { status: 400 })
  await saveDisplayCurrencyRows(d1, checked.rows, new Date())
  const rows = await listDisplayCurrencyRows(d1)
  return NextResponse.json({ currencies: rows.map(describe) })
}
