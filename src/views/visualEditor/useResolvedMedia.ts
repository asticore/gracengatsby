'use client'

import { useEffect, useState } from 'react'

type MediaDoc = { id: number; url?: string | null; alt?: string | null }

const cache = new Map<number, MediaDoc>()

/** Resolves a media id (as stored by the visual editor) to a {id,url,alt} object for preview rendering. */
export function useResolvedMedia(id: number | null | undefined): MediaDoc | null {
  const [doc, setDoc] = useState<MediaDoc | null>(() => (id ? cache.get(id) || null : null))

  useEffect(() => {
    if (!id || cache.has(id)) return
    let cancelled = false
    fetch(`/api/media/${id}?depth=0`, { credentials: 'include' })
      .then((r) => r.json() as Promise<MediaDoc>)
      .then((data) => {
        if (cancelled) return
        cache.set(id, data)
        setDoc(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [id])

  return id ? cache.get(id) || doc : null
}

export function useResolvedMediaList(ids: (number | null | undefined)[]): MediaDoc[] {
  const [docs, setDocs] = useState<MediaDoc[]>([])

  useEffect(() => {
    const validIds = ids.filter((id): id is number => typeof id === 'number')
    if (validIds.length === 0) return
    let cancelled = false
    Promise.all(
      validIds.map((id) => {
        if (cache.has(id)) return Promise.resolve(cache.get(id) as MediaDoc)
        return fetch(`/api/media/${id}?depth=0`, { credentials: 'include' })
          .then((r) => r.json() as Promise<MediaDoc>)
          .then((data) => {
            cache.set(id, data)
            return data
          })
          .catch(() => ({ id }) as MediaDoc)
      }),
    ).then((results) => {
      if (!cancelled) setDocs(results)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ids)])

  return ids.some((id) => typeof id === 'number') ? docs : []
}
