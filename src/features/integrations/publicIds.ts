import { getEngine } from '@/lib/engine'

export type PublicIds = {
  ga4MeasurementId?: string
  gtmContainerId?: string
  metaPixelId?: string
  tiktokPixelId?: string
  searchConsoleVerification?: string
  clarityProjectId?: string
}

type Loose = Record<string, unknown> | null | undefined

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/** A connection is on unless its switch is explicitly unticked (a missing switch counts as on, so older rows keep working). */
const switchedOn = (doc: Loose, key: string): boolean => group(doc, key)?.enabled !== false

const group = (doc: Loose, key: string): Loose => {
  const value = doc?.[key]
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined
}

/**
 * Picks the public tracking and verification IDs. Each value comes from the
 * Integrations global first and falls back, field by field, to the older
 * SEO & Analytics fields so a site that saved them there keeps working.
 * Only public IDs are returned: never a secret.
 */
export function pickPublicIds(integrations: Loose, seo: Loose): PublicIds {
  const google = group(integrations, 'google')
  const analytics = group(seo, 'analytics')
  const verification = group(seo, 'verification')
  const picked: PublicIds = {
    // A switch set to off stops the tag; a blank ID stops it too. Both are checked here so the loader never sees a paused ID.
    ga4MeasurementId: google?.ga4Enabled === false ? undefined : text(google?.ga4MeasurementId) ?? text(analytics?.ga4MeasurementId),
    gtmContainerId: google?.gtmEnabled === false ? undefined : text(google?.gtmContainerId) ?? text(analytics?.gtmContainerId),
    // Switching a pixel off in Integrations stops it everywhere, including the old SEO & Analytics fallback.
    metaPixelId: switchedOn(integrations, 'metaPixel') ? text(group(integrations, 'metaPixel')?.pixelId) ?? text(analytics?.metaPixelId) : undefined,
    tiktokPixelId: switchedOn(integrations, 'tiktokPixel') ? text(group(integrations, 'tiktokPixel')?.pixelId) : undefined,
    searchConsoleVerification: text(google?.searchConsoleVerification) ?? text(verification?.google),
    clarityProjectId: text(group(integrations, 'clarity')?.projectId),
  }
  return Object.fromEntries(Object.entries(picked).filter(([, value]) => value !== undefined)) as PublicIds
}

/** Server-only loader for pickPublicIds. Never throws. */
export async function getPublicIds(): Promise<PublicIds> {
  try {
    const engine = await getEngine()
    const [integrations, seo] = await Promise.all([
      engine.findGlobal({ slug: 'integrations', depth: 0, overrideAccess: true }).catch((): null => null),
      engine.findGlobal({ slug: 'seo-settings', depth: 0, overrideAccess: true }).catch((): null => null),
    ])
    return pickPublicIds(integrations as Loose, seo as Loose)
  } catch {
    return {}
  }
}
