import React from 'react'

import { getEngine } from '@/lib/engine'

import { MEDIA_PROP_KEYS, collectMediaIds, substituteMedia, type MediaRef } from './elementUtil'
import { renderElement } from './renderElement'

/**
 * Server wrapper for elements that hold pictures. The element props store media as ids (that is all the editor's
 * picker keeps); this looks the ids up once and hands renderElement the resolved {url, alt}. A missing or deleted
 * id is left as a number, which the renderers treat as "no image".
 */
export const ElementWithMedia = async ({ elementType, props }: { elementType: string; props: Record<string, unknown> }) => {
  const keys = MEDIA_PROP_KEYS[elementType] || []
  const ids = collectMediaIds(props, keys)
  let resolved = props
  if (ids.length > 0) {
    const engine = await getEngine()
    const docs = new Map<number, MediaRef>()
    await Promise.all(
      ids.slice(0, 60).map(async (id) => {
        const doc = await engine.findByID({ collection: 'media', id, depth: 0 }).catch((): null => null)
        if (doc && typeof doc.url === 'string') docs.set(id, { id, url: doc.url, alt: typeof doc.alt === 'string' ? doc.alt : null })
      }),
    )
    resolved = substituteMedia(props, keys, docs)
  }
  return <>{renderElement(elementType, resolved)}</>
}
