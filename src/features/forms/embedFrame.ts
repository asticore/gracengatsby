import { normaliseFormConfig } from './config'
import { frameAncestors } from './origin'

/**
 * Letting the embed page - and only the embed page - be shown in another
 * website's iframe.
 *
 * Every other path keeps the site-wide `X-Frame-Options` (usually SAMEORIGIN)
 * untouched; this is applied to `/embed/forms/<key>` alone. The allow-list is
 * the form's own, expressed as `frame-ancestors` (which also covers browsers
 * that ignore X-Frame-Options when both are present, so removing the old header
 * is safe).
 */

/** Matches `/embed/forms/<id-or-key>` and returns the key. A trailing slash is allowed, nothing else is. */
export function embedPathKey(pathname: string): string | null {
  const match = /^\/embed\/forms\/([A-Za-z0-9_-]{1,60})\/?$/.exec(pathname)
  return match ? match[1] : null
}

export type EmbedFrameDecision =
  | { frameable: false }
  | { frameable: true; contentSecurityPolicy: string }

/** From the stored form config (a JSON string or object) and its status. */
export function decideEmbedFrame(input: { formConfig: unknown; formStatus?: string | null } | null): EmbedFrameDecision {
  if (!input) return { frameable: false }
  if (input.formStatus === 'draft') return { frameable: false }
  let raw = input.formConfig
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw)
    } catch {
      raw = null
    }
  }
  const config = normaliseFormConfig(raw)
  if (config.embed?.enabled === false) return { frameable: false }
  return { frameable: true, contentSecurityPolicy: `frame-ancestors ${frameAncestors(config.embed?.allowedOrigins || [])}` }
}

/**
 * Applies the decision to a response's headers. A frame-ancestors directive
 * already present in a CSP is replaced rather than duplicated.
 */
export function applyEmbedFrame(headers: Headers, decision: EmbedFrameDecision): void {
  if (!decision.frameable) return
  headers.delete('X-Frame-Options')
  const directive = decision.contentSecurityPolicy
  const current = headers.get('Content-Security-Policy')
  if (!current) {
    headers.set('Content-Security-Policy', directive)
    return
  }
  const without = current
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part && !/^frame-ancestors\b/i.test(part))
  headers.set('Content-Security-Policy', [...without, directive].join('; '))
}
