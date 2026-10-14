import { getEngine } from '@/lib/engine'

/**
 * Cloudflare "development mode" for the site's zone: while it is on, Cloudflare
 * skips its own cache, so edits show at once. Uses the Zone ID and API token
 * saved under Integrations > Cloudflare. Never throws.
 */

const API = 'https://api.cloudflare.com/client/v4'

export type DevModeValue = 'on' | 'off'

export type DevModeResult = {
  ok: boolean
  /** Current state as Cloudflare reports it, when known. */
  value: DevModeValue | null
  /** Minutes left before it switches itself off, when Cloudflare reports it. */
  minutesRemaining: number | null
  message: string
}

export type CloudflareZone = { zoneId: string; apiToken: string }

const failure = (message: string): DevModeResult => ({ ok: false, value: null, minutesRemaining: null, message })

/** Plain-English message for a Cloudflare error status. */
export function devModeErrorMessage(status: number): string {
  if (status === 403) {
    return 'Cloudflare refused the change. The API token needs the Zone Settings: Edit permission for this zone. Add it under Cloudflare > My Profile > API Tokens, then try again.'
  }
  if (status === 401) return 'Cloudflare did not accept the API token. Check the token under Integrations > Cloudflare.'
  if (status === 404) return 'Cloudflare could not find this zone. Check the Zone ID under Integrations > Cloudflare.'
  return `Cloudflare answered with an error (status ${status}). Try again in a minute.`
}

/** The saved Zone ID and token, or null when either is missing. */
export async function loadCloudflareZone(): Promise<CloudflareZone | null> {
  try {
    const engine = await getEngine()
    const integrations = (await engine
      .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
      .catch((): null => null)) as { cloudflare?: { zoneId?: string | null; apiToken?: string | null } } | null
    const zoneId = integrations?.cloudflare?.zoneId?.trim()
    const apiToken = integrations?.cloudflare?.apiToken?.trim()
    return zoneId && apiToken ? { zoneId, apiToken } : null
  } catch {
    return null
  }
}

type ZoneSettingBody = {
  success?: boolean
  result?: { value?: string; time_remaining?: number } | null
}

const parseSetting = (body: ZoneSettingBody): { value: DevModeValue | null; minutes: number | null } => {
  const value = body.result?.value === 'on' || body.result?.value === 'off' ? body.result.value : null
  const minutes = typeof body.result?.time_remaining === 'number' ? Math.round(body.result.time_remaining / 60) : null
  return { value, minutes }
}

const headersFor = (zone: CloudflareZone): Record<string, string> => ({
  Authorization: `Bearer ${zone.apiToken}`,
  'Content-Type': 'application/json',
})

/** Reads the current development mode state. */
export async function getDevelopmentMode(zone: CloudflareZone): Promise<DevModeResult> {
  try {
    const response = await fetch(`${API}/zones/${zone.zoneId}/settings/development_mode`, { headers: headersFor(zone) })
    if (!response.ok) return failure(devModeErrorMessage(response.status))
    const parsed = parseSetting((await response.json()) as ZoneSettingBody)
    return { ok: true, value: parsed.value, minutesRemaining: parsed.minutes, message: parsed.value ? `Development mode is ${parsed.value}.` : 'Development mode state is unknown.' }
  } catch {
    return failure('Could not reach Cloudflare. Check the connection and try again.')
  }
}

/** Switches development mode on or off. */
export async function setDevelopmentMode(zone: CloudflareZone, value: DevModeValue): Promise<DevModeResult> {
  try {
    const response = await fetch(`${API}/zones/${zone.zoneId}/settings/development_mode`, {
      method: 'PATCH',
      headers: headersFor(zone),
      body: JSON.stringify({ value }),
    })
    if (!response.ok) return failure(devModeErrorMessage(response.status))
    const parsed = parseSetting((await response.json()) as ZoneSettingBody)
    return {
      ok: true,
      value: parsed.value ?? value,
      minutesRemaining: parsed.minutes,
      message: value === 'on' ? 'Development mode is on. Cloudflare will switch it off by itself after three hours.' : 'Development mode is off.',
    }
  } catch {
    return failure('Could not reach Cloudflare. Check the connection and try again.')
  }
}
