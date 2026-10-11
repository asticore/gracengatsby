import { verifyCartToken } from '@/features/ecommerce/lib/abandonedCart'
import { rawD1, runChanges, SQL } from '@/features/ecommerce/server/db'

export const dynamic = 'force-dynamic'

/** GET or POST ?t=<signed token> - stops cart reminders for that cart. */
async function handle(request: Request): Promise<Response> {
  const token = new URL(request.url).searchParams.get('t') ?? ''
  const verified = await verifyCartToken(process.env.ENGAGE_SECRET ?? '', token, 'unsub')
  if (!verified.ok) return new Response('This link is invalid or has expired.', { status: 400 })
  await runChanges(await rawD1(), SQL.cartUnsubscribe, verified.cartId)
  return new Response('<!doctype html><meta charset="utf-8"><title>Unsubscribed</title><p>You will not get any more cart reminders.</p>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
export const GET = handle
export const POST = handle
