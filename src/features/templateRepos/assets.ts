import { MEDIA_PROP_KEYS } from '@/components/blocks/elements/elementUtil'

/**
 * Media references inside a visual-editor tree: collecting them (for export
 * and for downloading a template's pictures) and rewriting them (after the
 * pictures have been saved as media on this site). Pure: no network, no
 * database. One walker serves both jobs so they can never disagree about
 * where a picture can hide.
 *
 * Places a picture can be referenced:
 *  - element props named in MEDIA_PROP_KEYS (a media id, {id,url,alt}, a URL, or a list of those)
 *  - the same for the older blocks (hero backgroundImage, imageText image, gallery images)
 *  - design keys: bgImage / bgImageUrl, bgSlideIds / bgSlides, bgVideoPoster,
 *    and the v2 design background.imageUrl (any device/state leaf)
 *  - nested columns of sections, to any depth
 */

export type AssetRefs = { ids: number[]; urls: string[] }

/** What an old picture becomes on this site. Keyed in an id map by the old id (as text) or the old URL. */
export type MappedAsset = { id: number; url?: string }
export type AssetIdMap = Record<string, MappedAsset>

type Mapper = {
  id: (id: number) => MappedAsset | undefined
  url: (url: string) => string | undefined
}

const BLOCK_MEDIA_KEYS: Record<string, readonly string[]> = {
  hero: ['backgroundImage'],
  imageText: ['image'],
  gallery: ['images'],
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isMediaId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0
/** Only absolute https links and site-relative paths count as picture URLs. */
const isAssetUrl = (v: unknown): v is string => typeof v === 'string' && v.length <= 2048 && (/^https:\/\//i.test(v) || /^\/(?!\/)/.test(v))

function mediaValue(value: unknown, cb: Mapper): unknown {
  if (isMediaId(value)) return cb.id(value)?.id ?? value
  if (typeof value === 'string') return isAssetUrl(value) ? (cb.url(value) ?? value) : value
  if (Array.isArray(value)) return value.map((item) => mediaValue(item, cb))
  if (isObj(value)) {
    const out: Record<string, unknown> = { ...value }
    let mapped: MappedAsset | undefined
    if (isMediaId(value.id)) {
      mapped = cb.id(value.id)
      if (mapped) {
        out.id = mapped.id
        if (mapped.url !== undefined && 'url' in value) out.url = mapped.url
      }
    }
    if (!mapped && isAssetUrl(value.url)) out.url = cb.url(value.url) ?? value.url
    return out
  }
  return value
}

/** Every string leaf of a value that may be per-device, such as v2 background.imageUrl. */
function stringLeaves(value: unknown, cb: Mapper): unknown {
  if (typeof value === 'string') return isAssetUrl(value) ? (cb.url(value) ?? value) : value
  if (Array.isArray(value)) return value.map((item) => stringLeaves(item, cb))
  if (isObj(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, stringLeaves(item, cb)]))
  return value
}

function designValue(design: unknown, cb: Mapper): unknown {
  if (!isObj(design)) return design
  const out: Record<string, unknown> = { ...design }

  let bgMapped: MappedAsset | undefined
  if (isMediaId(design.bgImage)) {
    bgMapped = cb.id(design.bgImage)
    if (bgMapped) {
      out.bgImage = bgMapped.id
      if (bgMapped.url !== undefined) out.bgImageUrl = bgMapped.url
    }
  }
  if (!bgMapped && isAssetUrl(design.bgImageUrl)) out.bgImageUrl = cb.url(design.bgImageUrl) ?? design.bgImageUrl

  if (isAssetUrl(design.bgVideoPoster)) out.bgVideoPoster = cb.url(design.bgVideoPoster) ?? design.bgVideoPoster

  const slideIds = Array.isArray(design.bgSlideIds) ? design.bgSlideIds : null
  const slideUrls = Array.isArray(design.bgSlides) ? [...design.bgSlides] : null
  if (slideIds) {
    const newIds = slideIds.map((id, index) => {
      if (!isMediaId(id)) return id
      const mapped = cb.id(id)
      if (!mapped) return id
      if (slideUrls && mapped.url !== undefined && index < slideUrls.length) slideUrls[index] = mapped.url
      return mapped.id
    })
    out.bgSlideIds = newIds
  }
  if (slideUrls) {
    out.bgSlides = slideUrls.map((url, index) => {
      // A url already replaced through its id is not looked up again.
      if (slideIds && isMediaId(slideIds[index]) && cb.id(slideIds[index] as number)) return url
      return isAssetUrl(url) ? (cb.url(url) ?? url) : url
    })
  }

  if (isObj(design.background) && design.background.imageUrl !== undefined) {
    out.background = { ...design.background, imageUrl: stringLeaves(design.background.imageUrl, cb) }
  }
  return out
}

function nodeValue(node: unknown, cb: Mapper): unknown {
  if (!isObj(node)) return node
  const out: Record<string, unknown> = { ...node }
  if (node.design !== undefined) out.design = designValue(node.design, cb)

  const blockKeys = typeof node.blockType === 'string' ? BLOCK_MEDIA_KEYS[node.blockType] : undefined
  if (blockKeys) {
    for (const key of blockKeys) if (node[key] !== undefined) out[key] = mediaValue(node[key], cb)
  }
  if (node.blockType === 'element' && typeof node.elementType === 'string' && isObj(node.props)) {
    const keys = MEDIA_PROP_KEYS[node.elementType]
    if (keys) {
      const props: Record<string, unknown> = { ...node.props }
      for (const key of keys) if (props[key] !== undefined) props[key] = mediaValue(props[key], cb)
      out.props = props
    }
    if (isObj(node.props) && node.props.design !== undefined) {
      out.props = { ...(out.props as Record<string, unknown>), design: designValue(node.props.design, cb) }
    }
  }
  if (Array.isArray(node.columns)) {
    out.columns = node.columns.map((column) =>
      isObj(column) && Array.isArray(column.blocks) ? { ...column, blocks: column.blocks.map((child) => nodeValue(child, cb)) } : column,
    )
  }
  return out
}

/** Every distinct media id and picture URL the tree refers to. */
export function collectAssets(tree: readonly unknown[]): AssetRefs {
  const ids = new Set<number>()
  const urls = new Set<string>()
  const cb: Mapper = {
    id: (id) => {
      ids.add(id)
      return undefined
    },
    url: (url) => {
      urls.add(url)
      return undefined
    },
  }
  for (const node of tree) nodeValue(node, cb)
  return { ids: [...ids], urls: [...urls] }
}

/**
 * A copy of the tree with ids and URLs rewritten through `idMap` (keys: old id as
 * text, or old URL). Anything not in the map is left exactly as it was. The input is not changed.
 */
export function relinkAssets<T>(tree: readonly T[], idMap: AssetIdMap): T[] {
  const own = (key: string): MappedAsset | undefined => (Object.prototype.hasOwnProperty.call(idMap, key) ? idMap[key] : undefined)
  const cb: Mapper = {
    id: (id) => own(String(id)),
    url: (url) => own(url)?.url,
  }
  return tree.map((node) => nodeValue(node, cb) as T)
}
