/**
 * Per-page background audio (group `pageAudio` on Pages). Pure helpers: validation of the
 * source URL and normalising the stored group into the small public config the client
 * component needs. Public data only - the page is edge cached.
 */

export type PageAudioConfig = {
  src: string
  loop: boolean
  /** 0..1 */
  volume: number
  startMuted: boolean
  showControls: boolean
  startOnFirstInteraction: boolean
  respectReducedData: boolean
}

export const PAGE_AUDIO_EXTENSIONS = ['mp3', 'ogg', 'oga', 'opus', 'm4a', 'wav'] as const

const EXT_RE = new RegExp(`\\.(${PAGE_AUDIO_EXTENSIONS.join('|')})$`, 'i')

/**
 * Accepts an https URL or a same-origin path (one leading slash) that ends in an audio
 * extension (query and hash ignored). Returns the trimmed URL, or null when it is not allowed.
 */
export function normaliseAudioUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > 2048 || /[\s<>"']/.test(value)) return null
  let pathname: string
  if (value.startsWith('/')) {
    if (value.startsWith('//')) return null
    pathname = value.split(/[?#]/)[0]
  } else {
    let parsed: URL
    try {
      parsed = new URL(value)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
    pathname = parsed.pathname
  }
  return EXT_RE.test(pathname) ? value : null
}

/** Field-level validate for the URL input. Empty is fine (checked together with the source choice). */
export function validateAudioUrl(value: unknown): true | string {
  if (value === undefined || value === null || value === '') return true
  return normaliseAudioUrl(value)
    ? true
    : 'Use an https:// link (or a /path on this site) to an .mp3 or .ogg file. Streaming-page links are not supported.'
}

const clampVolume = (raw: unknown): number => {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return 0.8
  return Math.min(100, Math.max(0, n)) / 100
}

const bool = (raw: unknown, fallback: boolean): boolean => (typeof raw === 'boolean' ? raw : fallback)

/**
 * Turns the stored group into the public config, or null when audio should not render at all.
 * `mediaUrl` is the resolved URL of the uploaded file (the page doc holds only its id).
 */
export function normalisePageAudio(raw: unknown, mediaUrl?: string | null): PageAudioConfig | null {
  const g = raw as Record<string, unknown> | null | undefined
  if (!g || g.enabled !== true) return null
  const useUpload = g.sourceType !== 'url'
  const src = useUpload ? normaliseAudioUrl(mediaUrl ?? null) ?? safeUploadUrl(mediaUrl) : normaliseAudioUrl(g.url)
  if (!src) return null
  return {
    src,
    loop: bool(g.loop, true),
    volume: clampVolume(g.volume),
    startMuted: bool(g.startMuted, true),
    showControls: bool(g.showControls, true),
    startOnFirstInteraction: bool(g.startOnFirstInteraction, true),
    respectReducedData: bool(g.respectReducedData, true),
  }
}

/** Uploaded media may lack a known audio extension in its URL; accept same-origin paths and https. */
function safeUploadUrl(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (!v || /[\s<>"']/.test(v)) return null
  if (v.startsWith('/') && !v.startsWith('//')) return v
  try {
    return new URL(v).protocol === 'https:' ? v : null
  } catch {
    return null
  }
}

/** True when the visitor's connection asks to save data (or is very slow). */
export function shouldSkipForReducedData(
  connection: { saveData?: boolean; effectiveType?: string } | null | undefined,
): boolean {
  if (!connection) return false
  return connection.saveData === true || connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g'
}
