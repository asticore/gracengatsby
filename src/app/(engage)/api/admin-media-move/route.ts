import { NextResponse } from 'next/server'

import { authorizeMedia } from '@/features/media/access'
import { sanitizeFolder } from '@/features/media/folders'
import { mediaUpdater, parseIdList, readJsonBody, type MediaEngine } from '@/features/media/store'

/** POST /api/admin-media-move  { ids: number[], folder: string } - sets the folder of each picture. */
export async function POST(request: Request): Promise<Response> {
  const auth = await authorizeMedia('update')
  if (!auth.context) return auth.response

  const body = await readJsonBody(request)
  if (!body) return NextResponse.json({ error: 'Send JSON with ids and a folder.' }, { status: 400 })
  const ids = parseIdList(body.ids)
  if (!ids) return NextResponse.json({ error: 'Choose at least one picture.' }, { status: 400 })
  const folder = sanitizeFolder(body.folder)
  if (folder === null) {
    return NextResponse.json(
      { error: 'Folder names can use letters, numbers, spaces, hyphens, underscores and slashes, up to 120 characters.' },
      { status: 400 },
    )
  }

  const update = mediaUpdater(auth.context.engine as unknown as MediaEngine)
  let moved = 0
  for (const id of ids) {
    await update(id, { folder })
    moved += 1
  }
  return NextResponse.json({ ok: true, moved, folder })
}