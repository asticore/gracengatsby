import type { S3Store } from '../destinations'

/**
 * Copies the media bucket to the destination, object by object.
 *
 * Each object is streamed straight from the source bucket's body into a signed
 * PUT - the bytes are never assembled in memory, so a single 500 MB video does
 * not decide whether the backup runs. `list` is paged, so the key list does not
 * either.
 *
 * Objects go across individually rather than into one archive because there is
 * no streaming zip writer available here worth trusting with the only copy of
 * someone's images, and because individual objects make a partial restore
 * possible: a lost file can be pulled back on its own without unpacking a
 * hundred gigabytes to reach it.
 */

export type MediaCopyResult = { objects: number; bytes: number; failures: string[] }

/** Where media lives inside a backup, relative to the backup's own prefix. */
export const MEDIA_PREFIX = 'media'

export async function copyMedia(
  bucket: R2Bucket,
  store: S3Store,
  backupPrefix: string,
  /** Stops the run cleanly when the invocation is running out of time. */
  shouldContinue: () => boolean = () => true,
): Promise<MediaCopyResult> {
  const result: MediaCopyResult = { objects: 0, bytes: 0, failures: [] }
  let cursor: string | undefined

  do {
    const listing = await bucket.list({ cursor, limit: 500 })

    for (const object of listing.objects) {
      if (!shouldContinue()) {
        result.failures.push('Stopped early - the run reached its time limit before every file was copied.')
        return result
      }

      const source = await bucket.get(object.key)
      if (!source?.body) {
        // An object that lists but will not open is worth naming rather than
        // skipping in silence - it usually means it was deleted mid-run.
        result.failures.push(`${object.key}: could not be read from the media bucket.`)
        continue
      }

      try {
        await store.put(
          `${backupPrefix}/${MEDIA_PREFIX}/${object.key}`,
          source.body as unknown as BodyInit,
          object.httpMetadata?.contentType || 'application/octet-stream',
        )
        result.objects++
        result.bytes += object.size
      } catch (error) {
        result.failures.push(`${object.key}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)

  return result
}

/** Puts one media object back, used by restore. */
export async function restoreMediaObject(
  bucket: R2Bucket,
  body: ReadableStream,
  key: string,
  contentType: string | null,
): Promise<void> {
  await bucket.put(key, body, {
    httpMetadata: contentType ? { contentType } : undefined,
  })
}
