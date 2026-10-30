import { getCloudflareContext } from '@opennextjs/cloudflare'

/**
 * Runs work after the response is sent, where the platform allows it (waitUntil), otherwise right
 * away. Never rejects. Same pattern as the IndexNow hook (src/features/seo/indexNowHook.ts).
 */
export const after = (work: Promise<unknown>): void => {
  void getCloudflareContext({ async: true })
    .then(({ ctx }) => {
      const waitUntil = (ctx as { waitUntil?: (promise: Promise<unknown>) => void } | undefined)?.waitUntil
      if (waitUntil) waitUntil(work)
      else void work
    })
    .catch(() => {
      void work
    })
}
