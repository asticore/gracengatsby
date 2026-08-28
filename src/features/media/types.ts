/**
 * The shape the rest of this feature works with.
 *
 * Media Settings stores everything as optional/nullable (the engine's globals
 * always can be), which would mean a null check at every use site. This is the
 * settled version: every value present, every value already validated. It is a
 * plain serialisable object on purpose so it can cross the server/client
 * boundary and be handed to the pure URL builder in tests without any engine.
 */

export type MediaProvider = 'cloudflare-images' | 'cloudflare-resizing' | 'none'

/** What the delivery URL should negotiate down to. */
export type DeliveryFormat = 'auto' | 'avif' | 'webp' | 'original'

export type MediaConfig = {
  /**
   * False when the `media` feature is off, the provider is 'none', or the
   * provider is configured but unusable (see resolveMediaConfig). Everything
   * downstream checks this one flag and falls back to the stored R2 URL.
   */
  enabled: boolean
  provider: MediaProvider
  quality: number
  format: DeliveryFormat
  stripMetadata: boolean
  maxWidth: number
  maxHeight: number
  /** Empty when responsive sizes are switched off - callers then emit no srcset. */
  responsiveWidths: number[]
  /** Cloudflare Images only. Already trimmed of any trailing slash. */
  deliveryPrefix: string
  batchSize: number
}

/**
 * The subset of a stored media record this feature needs. Deliberately not the
 * generated `Media` type: upload fields arrive as `number | Media` depending on
 * depth, and blocks hand us partially-populated records. Structural typing lets
 * every caller pass what it already has.
 */
export type MediaLike = {
  url?: string | null
  filename?: string | null
  width?: number | null
  height?: number | null
  alt?: string | null
  mimeType?: string | null
  /**
   * Set only once media is mirrored into Cloudflare Images (see the field note
   * in resolveMediaConfig). Absent on every record today, which is why the
   * cloudflare-images path degrades instead of guessing an id.
   */
  cloudflareImageId?: string | null
}

/** Everything an <img> needs, ready to spread. */
export type ResolvedImage = {
  src: string
  srcSet?: string
  sizes?: string
  width?: number
  height?: number
  alt: string
  loading: 'lazy' | 'eager'
  decoding: 'async' | 'sync'
  fetchPriority?: 'high' | 'auto'
}

/** Per-image overrides at the call site. */
export type ImageRequest = {
  /** Intended rendered width in CSS pixels. Clamped to maxWidth. */
  width?: number
  height?: number
  /**
   * How the image fills the requested box. `scale-down` is the default because
   * it never enlarges - a 400px original asked for at 1600px stays 400px rather
   * than being blown up into a bigger file that looks worse.
   */
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad'
  /** The `sizes` attribute. Without it a srcset is a guess the browser gets wrong. */
  sizes?: string
  /** Above-the-fold images opt out of lazy loading. */
  priority?: boolean
}
