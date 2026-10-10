import { getCloudflareContext } from '@opennextjs/cloudflare'

import type { ImagesBinding } from './optimise'

/**
 * Finds the Cloudflare Images binding (`IMAGES` in wrangler.jsonc).
 *
 * Returns null when there is no binding - the account has not enabled Images
 * transformations, or this is a local run where the binding does not exist.
 * Callers then skip optimisation and show "Image transformations are not
 * enabled on this account" rather than failing the upload.
 *
 * Outside production (next dev, vitest) this returns null without touching the
 * Cloudflare context, the same environment split storage.ts uses for R2.
 */
export async function resolveImagesBinding(): Promise<ImagesBinding | null> {
  if (process.env.NODE_ENV !== 'production' || process.env.VITEST) return null
  try {
    const { env } = await getCloudflareContext({ async: true })
    const binding = (env as unknown as { IMAGES?: ImagesBinding }).IMAGES
    return binding ?? null
  } catch {
    return null
  }
}
