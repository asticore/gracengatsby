import { siteOrigin } from '@/features/pagespeed/target'

/**
 * The address Google sends people back to. It must match the redirect address
 * typed into the Google Cloud client exactly, so it follows SITE_URL when that is
 * set, and otherwise the address the request actually came in on. Without this,
 * an install that has not set SITE_URL would send the sign-in to the wrong site.
 */
export function publicOrigin(requestUrl?: string): string {
  if ((process.env.SITE_URL || '').trim()) return siteOrigin()
  if (requestUrl) {
    try {
      return new URL(requestUrl).origin
    } catch {
      // Fall through to the configured default.
    }
  }
  return siteOrigin()
}
