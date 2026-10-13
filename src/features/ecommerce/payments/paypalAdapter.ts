/**
 * PayPal Orders v2 adapter (server only). Three documented calls:
 *   POST /v1/oauth2/token                       client credentials, cached until shortly before expiry
 *   POST /v2/checkout/orders                    create an order for an exact amount (intent CAPTURE)
 *   POST /v2/checkout/orders/{id}/capture       capture what the buyer approved
 *
 * Secrets never leave this module: errors carry PayPal's own issue code, never the keys. `fetch` and the
 * clock are injectable so tests can mock PayPal. Only Web APIs are used (Cloudflare Workers).
 */

export type PayPalSettings = { clientId: string; clientSecret: string; environment?: string | null }
export type PayPalOptions = { fetch?: typeof fetch; now?: () => number }

export class PayPalError extends Error {
  /** PayPal's own issue code, e.g. ORDER_ALREADY_CAPTURED. Safe to show staff; never a secret. */
  readonly issue?: string
  constructor(message: string, issue?: string) {
    super(message)
    this.issue = issue
  }
}

export type PayPalCapture = {
  /** PayPal's order status, e.g. COMPLETED. */
  status: string
  /** Capture id of the first capture on the order, or null when PayPal has none. */
  captureId: string | null
  /** Status of that capture. Only COMPLETED means the money is ours; PENDING means PayPal is still holding it. */
  captureStatus: string | null
  /** Captured amount in cents, read from PayPal's decimal string. */
  amountCents: number | null
  currency: string | null
}

export type PayPalAdapter = {
  createOrder(amountCents: number, currency: string, reference: string): Promise<{ id: string; status: string }>
  captureOrder(paypalOrderId: string): Promise<PayPalCapture>
}

export const paypalBaseUrl = (environment?: string | null): string => (environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

/** Token per (host, client id). Lives as long as the isolate does; a fresh isolate just fetches a new one. */
const tokenCache = new Map<string, { token: string; expiresAt: number }>()

/** For tests, and for a settings change that must take effect at once. */
export function clearPayPalTokenCache(): void {
  tokenCache.clear()
}

export async function getAccessToken(settings: PayPalSettings, options: PayPalOptions = {}): Promise<string> {
  const fetchImpl = options.fetch ?? fetch
  const now = options.now ?? Date.now
  const base = paypalBaseUrl(settings.environment)
  const key = `${base}|${settings.clientId}`
  const cached = tokenCache.get(key)
  if (cached && cached.expiresAt > now()) return cached.token

  const res = await fetchImpl(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${settings.clientId}:${settings.clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new PayPalError(`PayPal refused the keys (${res.status}).`)
  const json = (await res.json().catch((): Record<string, unknown> => ({}))) as { access_token?: unknown; expires_in?: unknown }
  if (typeof json.access_token !== 'string' || !json.access_token) throw new PayPalError('PayPal did not return an access token.')
  // Refresh a minute early so a token never expires mid-request.
  const ttlSeconds = Math.max(60, Number(json.expires_in) || 300)
  tokenCache.set(key, { token: json.access_token, expiresAt: now() + (ttlSeconds - 60) * 1000 })
  return json.access_token
}

/** "1234" cents -> "12.34". PayPal wants exactly two decimals. */
export function formatPayPalAmount(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`
}

/** PayPal's decimal string ("12.34") -> cents, with integer arithmetic only. Null when it is not a plain amount. */
export function parsePayPalAmount(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d+(\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number((fraction + '00').slice(0, 2))
}

type Json = Record<string, unknown>

/** The first capture on the first purchase unit, read the same way for a capture response and an order lookup. */
function readCapture(json: Json): PayPalCapture {
  const unit = (Array.isArray(json.purchase_units) ? json.purchase_units[0] : undefined) as { payments?: { captures?: unknown[] } } | undefined
  const capture = (Array.isArray(unit?.payments?.captures) ? unit?.payments?.captures[0] : undefined) as
    | { id?: unknown; status?: unknown; amount?: { value?: unknown; currency_code?: unknown } }
    | undefined
  return {
    status: typeof json.status === 'string' ? json.status : '',
    captureId: typeof capture?.id === 'string' ? capture.id : null,
    captureStatus: typeof capture?.status === 'string' ? capture.status : null,
    amountCents: parsePayPalAmount(capture?.amount?.value),
    currency: typeof capture?.amount?.currency_code === 'string' ? capture.amount.currency_code : null,
  }
}

async function readJson(res: Response): Promise<Json> {
  return ((await res.json().catch((): Json => ({}))) ?? {}) as Json
}

function refusal(status: number, json: Json): PayPalError {
  const details = Array.isArray(json.details) ? (json.details[0] as { issue?: unknown } | undefined) : undefined
  const issue = typeof details?.issue === 'string' ? details.issue : undefined
  return new PayPalError(`PayPal refused the request (${status}${issue ? `: ${issue}` : ''}).`, issue)
}

export function createPayPalAdapter(settings: PayPalSettings, options: PayPalOptions = {}): PayPalAdapter {
  const fetchImpl = options.fetch ?? fetch
  const base = paypalBaseUrl(settings.environment)

  const call = async (method: 'GET' | 'POST', path: string, body: unknown, requestId?: string): Promise<{ ok: boolean; status: number; json: Json }> => {
    const token = await getAccessToken(settings, options)
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        // Same id on a repeat call makes PayPal return the first answer instead of acting twice.
        ...(requestId ? { 'PayPal-Request-Id': requestId } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
    return { ok: res.ok, status: res.status, json: await readJson(res) }
  }

  return {
    async createOrder(amountCents, currency, reference) {
      if (!Number.isInteger(amountCents) || amountCents <= 0) throw new PayPalError('A valid amount is required to start PayPal.')
      if (!/^[A-Z]{3}$/.test(currency)) throw new PayPalError('A valid currency is required to start PayPal.')
      const res = await call('POST', '/v2/checkout/orders', {
        intent: 'CAPTURE',
        purchase_units: [{ reference_id: reference, custom_id: reference, amount: { currency_code: currency, value: formatPayPalAmount(amountCents) } }],
      }, crypto.randomUUID())
      if (!res.ok || typeof res.json.id !== 'string') throw refusal(res.status, res.json)
      return { id: res.json.id, status: typeof res.json.status === 'string' ? res.json.status : '' }
    },

    async captureOrder(paypalOrderId) {
      if (!/^[A-Za-z0-9]{8,40}$/.test(paypalOrderId)) throw new PayPalError('Invalid PayPal order id.')
      const path = `/v2/checkout/orders/${paypalOrderId}/capture`
      // A stable request id per order: a repeated capture is answered from PayPal's record, never charged twice.
      const res = await call('POST', path, {}, `capture-${paypalOrderId}`)
      if (res.ok) return readCapture(res.json)
      if (res.json && Array.isArray(res.json.details) && (res.json.details[0] as { issue?: unknown })?.issue === 'ORDER_ALREADY_CAPTURED') {
        // Captured by an earlier attempt that did not finish here: read what PayPal recorded.
        const lookup = await call('GET', `/v2/checkout/orders/${paypalOrderId}`, undefined)
        if (lookup.ok) return readCapture(lookup.json)
      }
      throw refusal(res.status, res.json)
    },
  }
}
