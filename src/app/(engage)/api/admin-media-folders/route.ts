import { NextResponse } from 'next/server'

import { authorizeMedia } from '@/features/media/access'
import { distinctFolders } from '@/features/media/folders'
import { collectMediaDocs, MAX_FOLDER_SCAN } from '@/features/media/library'
import type { MediaEngine } from '@/features/media/store'

/**
 * GET /api/admin-media-folders - every folder in use, sorted.
 * Reads the library a page at a time. At most MAX_FOLDER_SCAN documents are read;
 * `truncated` is true when the library holds more than that, so the list may
 * be incomplete.
 */
export async function GET(): Promise<Response> {
  const auth = await authorizeMedia('read')
  if (!auth.context) return auth.response

  const engine = auth.context.engine as unknown as MediaEngine
  const { docs, truncated } = await collectMediaDocs((page, limit) =>
    engine.find({ collection: 'media', limit, page, depth: 0, overrideAccess: true }),
  )
  return NextResponse.json({ folders: distinctFolders(docs as Array<{ folder?: string | null }>), truncated, cap: MAX_FOLDER_SCAN })
}