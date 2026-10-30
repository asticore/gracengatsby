import { GOOGLE_CONNECTION_SLUG, INTEGRATIONS_SLUG, type PickerKind } from './constants'
import type { GoogleEngine } from './auth'
import { readGoogleDoc } from './auth'
import { googleGet } from './fetchJson'
import { ADSENSE_NAME, listFor, measurementIdFrom, parseTagManagerValue, publisherIdFrom } from './lists'

/**
 * Saves one dropdown choice. Each value is checked against what Google lists
 * for this account before it is stored. When a choice gives a GA4 measurement
 * ID or a GTM container ID, those are written to Integrations: only into a blank
 * field by default, or over the old value when the caller asks for "replace".
 */

/** `value` is the ID now stored on Integrations (GA4 measurement ID or GTM container ID), '' when there is none. */
export type PickResult = { ok: true; message: string; notes: string[]; value?: string } | { ok: false; error: string; status: number }

export type PickInput = { kind: PickerKind; value: string }

/** Parses the request body for one save. Null when the shape is wrong. */
export function parsePickBody(body: unknown): PickInput | null {
  const raw = (body ?? {}) as { kind?: unknown; value?: unknown }
  if (typeof raw.value !== 'string') return null
  const value = raw.value.trim()
  if (!value || value.length > 300) return null
  if (raw.kind !== 'ga4' && raw.kind !== 'gsc' && raw.kind !== 'gtm' && raw.kind !== 'adsense') return null
  return { kind: raw.kind, value }
}

/**
 * How a chosen GA4 or GTM ID reaches Integrations. "blank" (the Google connection
 * screen) fills the field only when it is empty. "replace" (the Tracking screen)
 * is an explicit choice by the owner, so it overwrites the old value.
 */
export type FillMode = 'blank' | 'replace'

/** Fills one Integrations field under the given mode and reports what happened, in plain English. */
async function fillField(
  engine: GoogleEngine,
  group: 'ga4MeasurementId' | 'gtmContainerId',
  value: string,
  label: string,
  mode: FillMode,
): Promise<string> {
  const integrations = (await engine.findGlobal({ slug: INTEGRATIONS_SLUG, depth: 0, overrideAccess: true }).catch((): null => null)) as
    | { google?: Record<string, unknown> | null }
    | null
  const google = { ...(integrations?.google ?? {}) }
  const existing = typeof google[group] === 'string' ? (google[group] as string).trim() : ''
  if (existing === value) return `${label} on Integrations is already ${value}.`
  if (existing && mode === 'blank') return `${label} on Integrations is already ${existing}, so it was left as it is.`
  google[group] = value
  await engine.updateGlobal({ slug: INTEGRATIONS_SLUG, data: { google }, overrideAccess: true })
  if (existing) return `${label} on Integrations was ${existing}, and is now ${value}.`
  return `${label} on Integrations was empty, so it is now ${value}.`
}

/** Checks the choice against Google, saves it, and fills the matching Integrations field if blank. */
export async function applyPick(engine: GoogleEngine, input: PickInput, options: { fill?: FillMode } = {}): Promise<PickResult> {
  const doc = await readGoogleDoc(engine)
  if (!doc?.refreshTokenEnc) return { ok: false, error: 'Connect Google first.', status: 409 }

  try {
    if (input.kind === 'gsc') {
      const items = await listFor(engine, 'gsc')
      if (!items.some((item) => item.value === input.value)) return { ok: false, error: 'That site is not in your Search Console list.', status: 400 }
      await engine.updateGlobal({ slug: GOOGLE_CONNECTION_SLUG, data: { searchConsoleSite: input.value }, overrideAccess: true })
      return { ok: true, message: `Search Console site saved: ${input.value}.`, notes: [] }
    }

    if (input.kind === 'adsense') {
      if (!ADSENSE_NAME.test(input.value)) return { ok: false, error: 'That AdSense account is not recognised.', status: 400 }
      const items = await listFor(engine, 'adsense')
      if (!items.some((item) => item.value === input.value)) return { ok: false, error: 'That AdSense account is not in your list.', status: 400 }
      await engine.updateGlobal({
        slug: GOOGLE_CONNECTION_SLUG,
        data: { adsenseAccountId: input.value, adsensePublisherId: publisherIdFrom(input.value) },
        overrideAccess: true,
      })
      return { ok: true, message: `AdSense account saved: ${publisherIdFrom(input.value)}.`, notes: [] }
    }

    if (input.kind === 'gtm') {
      const parsed = parseTagManagerValue(input.value)
      if (!parsed) return { ok: false, error: 'That Tag Manager container is not recognised.', status: 400 }
      const items = await listFor(engine, 'gtm')
      if (!items.some((item) => item.value === input.value)) return { ok: false, error: 'That container is not in your Tag Manager list.', status: 400 }
      const container = (await googleGet(
        engine,
        `https://www.googleapis.com/tagmanager/v2/accounts/${parsed.accountId}/containers/${parsed.containerId}`,
      )) as { publicId?: unknown }
      const publicId = typeof container.publicId === 'string' ? container.publicId : ''
      if (!/^GTM-[A-Z0-9]{4,12}$/.test(publicId)) return { ok: false, error: 'Google did not give a GTM ID for that container.', status: 502 }
      await engine.updateGlobal({
        slug: GOOGLE_CONNECTION_SLUG,
        data: { gtmAccountId: parsed.accountId, gtmContainerId: parsed.containerId },
        overrideAccess: true,
      })
      const note = await fillField(engine, 'gtmContainerId', publicId, 'Tag Manager container ID', options.fill ?? 'blank')
      return { ok: true, message: `Tag Manager container saved (${publicId}).`, notes: [note], value: publicId }
    }

    // GA4: the value is the bare property number.
    const items = await listFor(engine, 'ga4')
    if (!items.some((item) => item.value === input.value)) return { ok: false, error: 'That property is not in your Analytics list.', status: 400 }
    const streams = await googleGet(engine, `https://analyticsadmin.googleapis.com/v1beta/properties/${input.value}/dataStreams`)
    const measurementId = measurementIdFrom(streams)
    await engine.updateGlobal({
      slug: GOOGLE_CONNECTION_SLUG,
      data: { ga4PropertyId: input.value, ga4MeasurementId: measurementId },
      overrideAccess: true,
    })
    if (!measurementId) {
      return { ok: true, message: `Analytics property saved (${input.value}).`, notes: ['This property has no website data stream, so no measurement ID was found.'], value: '' }
    }
    const note = await fillField(engine, 'ga4MeasurementId', measurementId, 'Analytics measurement ID', options.fill ?? 'blank')
    return { ok: true, message: `Analytics property saved (${input.value}).`, notes: [note], value: measurementId }
  } catch (error) {
    const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : 502
    return { ok: false, error: error instanceof Error ? error.message : 'Google could not be reached.', status }
  }
}
