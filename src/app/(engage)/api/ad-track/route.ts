import { readAdUnitKeysFromD1 } from '@/features/ads/d1'
import { recordAdEvent } from '@/features/ads/stats'
import { allowUnitWrite, isLikelyBot, isSameOriginRequest, MAX_TRACK_BYTES, parseTrackBody, todayUtc } from '@/features/ads/track'
import { clientKey, hit } from '@/features/security/rateLimit'

export const dynamic = 'force-dynamic'

const noContent = (status = 204): Response => new Response(null, { status, headers: { 'Cache-Control': 'no-store' } })

/**
 * POST /api/ad-track - counts one viewable impression for an ad unit.
 * Public by design. Bounded: tiny body, strict shape, same-origin only, bots
 * ignored, rate limited, and only for units that exist while Ads is on.
 * Stores no visitor identifier, only unit + day + breakpoint counters.
 */
export async function POST(request: Request): Promise<Response> {
  if (hit(`ad-track:${clientKey(request)}`, 120).limited) return noContent(429)
  if (!isSameOriginRequest(request.headers.get('sec-fetch-site'))) return noContent(403)
  if (isLikelyBot(request.headers.get('user-agent'))) return noContent()
  const declared = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(declared) && declared > MAX_TRACK_BYTES) return noContent(413)

  let text: string
  try {
    text = await request.text()
  } catch {
    return noContent(400)
  }
  if (text.length > MAX_TRACK_BYTES) return noContent(413)
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return noContent(400)
  }
  const event = parseTrackBody(raw)
  if (!event) return noContent(400)

  // Unit keys come from a 60 second isolate cache, so a beacon costs no database read in the common case.
  const keys = await readAdUnitKeysFromD1()
  if (!keys.has(event.unit)) return noContent()
  if (!allowUnitWrite(event.unit)) return noContent()
  await recordAdEvent(event, todayUtc())
  return noContent()
}
