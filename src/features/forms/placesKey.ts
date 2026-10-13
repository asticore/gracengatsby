/**
 * The Google Maps key a public form may use for Places address lookup.
 *
 * It is a browser key by nature (Google expects it in page source and it is
 * limited by domain in Google Cloud), so it is handed to visitors. Two limits
 * keep it that way: it is sent only when a field on this form asks for Places,
 * and it is the one value read from the Integrations global. No other secret
 * is ever touched here. Server-only; the engine is passed in, as in settings.ts.
 */
export type IntegrationsReader = {
  findGlobal(args: { slug: string; depth: number; overrideAccess: boolean }): Promise<unknown>
}

export async function readPlacesBrowserKey(
  engine: IntegrationsReader,
  fields: { addressLookup?: string | null }[],
): Promise<string | undefined> {
  if (!(fields || []).some((field) => field.addressLookup === 'google')) return undefined
  const integrations = (await engine
    .findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true })
    .catch((): null => null)) as { google?: { mapsApiKey?: unknown } } | null
  const key = integrations?.google?.mapsApiKey
  return typeof key === 'string' && key.trim() ? key.trim() : undefined
}
