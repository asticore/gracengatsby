import { getEngine } from '@/lib/engine'

import { normalisePageAudio } from './config'

type Group = { enabled?: boolean | null; sourceType?: string | null; media?: unknown } | null | undefined

/** Resolve a document's `pageAudio` group (public data only) into the client config, or null when off. */
export async function loadPageAudioConfig(group: Group) {
  let mediaUrl: string | null = null
  if (group?.enabled === true && group.sourceType !== 'url' && group.media) {
    try {
      const mediaId = typeof group.media === 'object' ? (group.media as { id: number }).id : (group.media as number)
      const media = (await (await getEngine()).findByID({ collection: 'media', id: mediaId, depth: 0 })) as { url?: string | null } | null
      mediaUrl = media?.url ?? null
    } catch {
      mediaUrl = null
    }
  }
  return normalisePageAudio(group, mediaUrl)
}
