import type { Where } from '@/engine'

import { Media } from '@/collections/Media'

import { createCollectionOps } from '../generic'
import { media } from '../schema'

/**
 * Payload's document shape for the `media` collection - see
 * src/collections/Media.ts. `alt` is Media's one declared field; everything
 * else is Payload's own implicit upload columns (see
 * ../schema/generate.ts's hasUpload/uploadColumns doc comment) - this data
 * layer only mirrors those columns, it does not perform an actual file
 * upload (storage/resizing is Payload's own upload handler's job, entirely
 * outside this data layer's scope, same as every other test in this
 * directory inserting a media row directly rather than through a real
 * upload - see e.g. tests/int/cms-db-page-templates.int.spec.ts's own note).
 */
export type MediaDoc = {
  id: number
  alt: string
  url?: string | null
  thumbnailURL?: string | null
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  width?: number | null
  height?: number | null
  updatedAt: string
  createdAt: string
}

const ops = createCollectionOps(media, Media)

export const findMedia = ops.findMany as unknown as (args?: { where?: Where; limit?: number }) => Promise<MediaDoc[]>
export const findMediaByID = ops.findByID as unknown as (id: number) => Promise<MediaDoc | null>
export const countMedia = ops.count
export const createMedia = ops.create as unknown as (
  data: Partial<Omit<MediaDoc, 'id' | 'updatedAt' | 'createdAt'>> & { alt: string },
) => Promise<MediaDoc>
export const updateMedia = ops.updateByID as unknown as (
  id: number,
  data: Partial<Omit<MediaDoc, 'id' | 'updatedAt' | 'createdAt'>>,
) => Promise<MediaDoc | null>
export const deleteMedia = ops.deleteByID
