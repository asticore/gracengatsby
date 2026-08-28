import type { MediaConfig, MediaProvider } from './types'

import { DISABLED_CONFIG } from './url'

/**
 * Reads Media Settings and turns it into the settled config the rest of the
 * feature uses.
 *
 * Two rules run through all of it:
 *   - it never throws. An unreadable global, a half-filled settings screen or a
 *     feature that is switched off all end at DISABLED_CONFIG, which means
 *     plain R2 URLs. Images failing to load is a far worse outcome than images
 *     failing to shrink.
 *   - it never invents credentials. If the account hash is missing there is no
 *     address to serve from, so the provider is treated as unconfigured rather
 *     than guessed at.
 */

/**
 * Used when responsive sizes are on but no widths have been entered - the
 * array field ships without defaults, and an empty srcset would quietly undo
 * the setting the user just switched on. Phone through to large desktop.
 */
const FALLBACK_WIDTHS = [320, 640, 960, 1280, 1920, 2560]

/** Cloudflare Images' standard delivery host, used when no prefix is given. */
const DEFAULT_IMAGES_HOST = 'https://imagedelivery.net'

const toPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback
}

const clean = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Both format checkboxes on means "serve whichever of the two this browser
 * accepts" - that is exactly what `auto` does at the edge, and it is a better
 * answer than picking one and stranding the other half of the audience.
 */
function resolveFormat(webp: boolean, avif: boolean): MediaConfig['format'] {
  if (webp && avif) return 'auto'
  if (avif) return 'avif'
  if (webp) return 'webp'
  return 'original'
}

/**
 * Pure so it can be exercised without a database. Takes the raw global exactly
 * as stored.
 */
export function resolveMediaConfig(settings: unknown, featureEnabled: boolean): MediaConfig {
  const raw = (settings ?? {}) as Record<string, any>
  const optimisation = (raw.optimisation ?? {}) as Record<string, any>
  const resizing = (raw.resizing ?? {}) as Record<string, any>
  const delivery = (raw.delivery ?? {}) as Record<string, any>
  const bulk = (raw.bulk ?? {}) as Record<string, any>

  const provider = (clean(optimisation.provider) || 'none') as MediaProvider
  const batchSize = toPositiveInt(bulk.batchSize, DISABLED_CONFIG.batchSize)

  const prefixSetting = clean(delivery.deliveryUrlPrefix).replace(/\/+$/, '')
  const accountHash = clean(delivery.cloudflareAccountHash)
  const deliveryPrefix = prefixSetting || (accountHash ? `${DEFAULT_IMAGES_HOST}/${accountHash}` : '')

  // Image Resizing runs on the zone already serving the site, so it needs no
  // credentials. Cloudflare Images has nowhere to serve from without a hash.
  const usable =
    featureEnabled &&
    (provider === 'cloudflare-resizing' || (provider === 'cloudflare-images' && Boolean(deliveryPrefix)))

  if (!usable) return { ...DISABLED_CONFIG, provider, batchSize, deliveryPrefix }

  const entered = Array.isArray(resizing.responsiveWidths)
    ? (resizing.responsiveWidths as { width?: number | null }[])
        .map((row) => toPositiveInt(row?.width, 0))
        .filter((width) => width > 0)
    : []

  const responsiveWidths =
    resizing.generateResponsiveSizes === false
      ? []
      : Array.from(new Set(entered.length > 0 ? entered : FALLBACK_WIDTHS)).sort((a, b) => a - b)

  return {
    enabled: true,
    provider,
    quality: Math.min(100, Math.max(1, toPositiveInt(optimisation.quality, 82))),
    format: resolveFormat(optimisation.convertToWebp !== false, optimisation.convertToAvif === true),
    stripMetadata: optimisation.stripMetadata !== false,
    maxWidth: toPositiveInt(resizing.maxWidth, DISABLED_CONFIG.maxWidth),
    maxHeight: toPositiveInt(resizing.maxHeight, DISABLED_CONFIG.maxHeight),
    responsiveWidths,
    deliveryPrefix,
    batchSize,
  }
}

