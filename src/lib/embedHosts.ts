/**
 * Single source of the hosts a page of ours may put in an iframe. Plain module (no React, no server imports) so
 * the embed element, the video and map elements and the Content-Security-Policy builder all read the same list.
 */
export const EMBED_IFRAME_HOST = {
  youtube: 'www.youtube-nocookie.com',
  vimeo: 'player.vimeo.com',
  'google-calendar': 'calendar.google.com',
  typeform: 'form.typeform.com',
  lottie: 'lottie.host',
  /** Map element: Google keyless embed and OpenStreetMap. */
  googleMaps: 'www.google.com',
  openStreetMap: 'www.openstreetmap.org',
} as const

/** Extra hosts that are framed but not tied to one provider key (kept for the CSP; youtube.com for plain embeds). */
const EXTRA_FRAME_HOSTS = ['www.youtube.com'] as const

/** Every iframe host as a CSP source expression. */
export const EMBED_IFRAME_HOSTS: readonly string[] = Array.from(
  new Set([...Object.values(EMBED_IFRAME_HOST), ...EXTRA_FRAME_HOSTS]),
)

export const EMBED_FRAME_SOURCES: readonly string[] = EMBED_IFRAME_HOSTS.map((h) => `https://${h}`)
