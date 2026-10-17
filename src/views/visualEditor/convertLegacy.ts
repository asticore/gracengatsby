/**
 * Turns a legacy monolithic block (hero, ctaBanner, imageText, gallery) into the equivalent
 * granular section tree: a Section holding heading / text-editor / button / image elements, the
 * same shape the template presets build. Pure - the editor does the state update and id assignment.
 *
 * Rules: every user value is kept. Text becomes a text element or heading, links become buttons,
 * media ids stay media ids, the anchor id and any valid BlockStyle design carry over onto the
 * section. A string field with no direct equivalent becomes a text element rather than being dropped.
 */

import { asBlockStyle, type BlockStyle } from '@/lib/blockStyle'
import { getElementDef } from '@/lib/elements/registry'
import type { SectionColumn, SectionNode } from '@/lib/sectionTree'

type Rec = Record<string, unknown>

const CONVERTIBLE_TYPES: readonly string[] = ['hero', 'ctaBanner', 'imageText', 'gallery']

/** True for the legacy monolithic block types that have a granular equivalent. */
export function canConvertLegacy(blockType: string): boolean {
  return CONVERTIBLE_TYPES.includes(blockType)
}

const isRec = (value: unknown): value is Rec => Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** An element node built from the element's own defaults, with some props overridden (same rule as templatePresets). */
const el = (elementType: string, props: Rec = {}): SectionNode => ({
  blockType: 'element',
  elementType,
  props: { ...(getElementDef(elementType)?.defaultProps() || {}), ...props },
})

const heading = (text: string, align: string, tag: string): SectionNode => el('heading', { text, tag, align })
const button = (text: string, url: string, variant: string): SectionNode => el('button', { text, url, variant, align: 'center' })

/** Lexical rich text: one paragraph per line. A value that is already Lexical JSON is kept exactly as it is. */
function richText(value: unknown): Rec {
  if (isRec(value)) return value
  const lines = String(value ?? '').split('\n')
  return {
    root: {
      type: 'root',
      version: 1,
      direction: 'ltr',
      format: '',
      indent: 0,
      children: lines.map((line) => ({
        type: 'paragraph',
        version: 1,
        direction: 'ltr',
        format: '',
        indent: 0,
        children: line ? [{ type: 'text', version: 1, text: line, format: 0, style: '', mode: 'normal', detail: 0 }] : [],
      })),
    },
  }
}

/** A text element holding one of the block's string values. */
const textEl = (value: string, align = 'left'): SectionNode => el('text-editor', { align, content: richText(value) })

type MediaRef = { id?: number; url?: string; alt?: string }

/** A media value as the legacy blocks store it: a media id, a populated media object, or a bare address. */
function mediaRef(value: unknown): MediaRef | null {
  if (typeof value === 'number' && Number.isFinite(value)) return { id: value }
  if (typeof value === 'string') return value ? { url: value } : null
  if (!isRec(value)) return null
  const ref: MediaRef = {}
  if (typeof value.id === 'number') ref.id = value.id
  if (typeof value.url === 'string' && value.url) ref.url = value.url
  if (typeof value.alt === 'string' && value.alt) ref.alt = value.alt
  return ref.id !== undefined || ref.url !== undefined ? ref : null
}

const imageEl = (ref: MediaRef | null): SectionNode =>
  el('image', {
    ratio: '4:3',
    ...(ref?.id !== undefined ? { image: ref.id } : {}),
    ...(ref?.url ? { url: ref.url } : {}),
    ...(ref?.alt ? { alt: ref.alt } : {}),
  })

/** The section's design: the preset defaults, overridden by the block's own valid BlockStyle keys, plus its anchor id. */
function sectionDesign(block: Rec, defaults: Rec): BlockStyle {
  const raw = isRec(block.design) ? block.design : {}
  const anchor = typeof block.anchorId === 'string' && block.anchorId ? { anchorId: block.anchorId } : {}
  return asBlockStyle({ ...defaults, ...raw, ...(raw.anchorId === undefined ? anchor : {}) })
}

const column = (width: 12 | 6, blocks: SectionNode[]): SectionColumn => ({ width, blocks })
const section = (design: BlockStyle, ...columns: SectionColumn[]): SectionNode => ({ blockType: 'section', design, columns })

/** Any other non-empty string on the legacy block becomes a text element, so nothing is silently lost. */
function leftoverText(block: Rec, known: readonly string[]): SectionNode[] {
  const skip = new Set<string>(['blockType', '_id', 'design', 'anchorId', ...known])
  const out: SectionNode[] = []
  for (const [key, value] of Object.entries(block)) {
    if (!skip.has(key) && typeof value === 'string' && value !== '') out.push(textEl(value))
  }
  return out
}

const HERO_KEYS = ['heading', 'subheading', 'backgroundImage', 'primaryCtaLabel', 'primaryCtaUrl', 'secondaryCtaLabel', 'secondaryCtaUrl']

function convertHero(block: Rec): SectionNode {
  const bg = mediaRef(block.backgroundImage)
  const defaults: Rec = bg
    ? {
        bgType: 'image',
        ...(bg.id !== undefined ? { bgImage: bg.id } : {}),
        ...(bg.url ? { bgImageUrl: bg.url } : {}),
        minHeight: 480,
        bgOverlay: 45,
        textColor: '#ffffff',
        paddingTop: 80,
        paddingBottom: 80,
      }
    : { bgType: 'color', bgColor: '#111827', textColor: '#ffffff', minHeight: 480, bgOverlay: 45, paddingTop: 80, paddingBottom: 80 }

  const children: SectionNode[] = []
  if (typeof block.heading === 'string' && block.heading) children.push(heading(block.heading, 'center', 'h1'))
  if (typeof block.subheading === 'string' && block.subheading) children.push(textEl(block.subheading, 'center'))
  const primaryLabel = typeof block.primaryCtaLabel === 'string' ? block.primaryCtaLabel : ''
  const primaryUrl = typeof block.primaryCtaUrl === 'string' ? block.primaryCtaUrl : ''
  if (primaryLabel || primaryUrl) children.push(button(primaryLabel, primaryUrl, 'primary'))
  const secondaryLabel = typeof block.secondaryCtaLabel === 'string' ? block.secondaryCtaLabel : ''
  const secondaryUrl = typeof block.secondaryCtaUrl === 'string' ? block.secondaryCtaUrl : ''
  if (secondaryLabel || secondaryUrl) children.push(button(secondaryLabel, secondaryUrl, 'secondary'))
  children.push(...leftoverText(block, HERO_KEYS))

  return section(sectionDesign(block, defaults), column(12, children))
}

const CTA_KEYS = ['heading', 'text', 'buttonLabel', 'buttonUrl', 'style']

function convertCtaBanner(block: Rec): SectionNode {
  const light = block.style === 'light'
  const defaults: Rec = light
    ? { bgType: 'color', bgColor: '#f3f4f6', textColor: '#111827', paddingTop: 56, paddingBottom: 56 }
    : { bgType: 'color', bgColor: '#111827', textColor: '#ffffff', paddingTop: 56, paddingBottom: 56 }

  const children: SectionNode[] = []
  if (typeof block.heading === 'string' && block.heading) children.push(heading(block.heading, 'center', 'h2'))
  if (typeof block.text === 'string' && block.text) children.push(textEl(block.text, 'center'))
  const label = typeof block.buttonLabel === 'string' ? block.buttonLabel : ''
  const url = typeof block.buttonUrl === 'string' ? block.buttonUrl : ''
  if (label || url) children.push(button(label, url, 'primary'))
  children.push(...leftoverText(block, CTA_KEYS))

  return section(sectionDesign(block, defaults), column(12, children))
}

const IMAGE_TEXT_KEYS = ['image', 'content', 'imageSide']

function convertImageText(block: Rec): SectionNode {
  const side = block.imageSide === 'right' ? 'right' : 'left'
  const picture = column(6, [imageEl(mediaRef(block.image))])

  const words: SectionNode[] = []
  const hasContent = block.content !== undefined && block.content !== null && block.content !== ''
  words.push(el('text-editor', { align: 'left', ...(hasContent ? { content: richText(block.content) } : {}) }))
  words.push(...leftoverText(block, IMAGE_TEXT_KEYS))
  const wordsColumn = column(6, words)

  return section(sectionDesign(block, {}), ...(side === 'right' ? [wordsColumn, picture] : [picture, wordsColumn]))
}

const GALLERY_KEYS = ['heading', 'images']

function convertGallery(block: Rec): SectionNode {
  const ids: number[] = []
  const urlLines: string[] = []
  const images = Array.isArray(block.images) ? block.images : []
  for (const item of images) {
    const ref = mediaRef(item)
    if (!ref) continue
    if (ref.id !== undefined) ids.push(ref.id)
    else if (ref.url) urlLines.push(`${ref.url} | ${ref.alt ?? ''}`)
  }

  const children: SectionNode[] = []
  if (typeof block.heading === 'string' && block.heading) children.push(heading(block.heading, 'center', 'h2'))
  children.push(el('image-gallery', { images: ids, ...(urlLines.length ? { urls: urlLines.join('\n') } : {}) }))
  children.push(...leftoverText(block, GALLERY_KEYS))

  return section(sectionDesign(block, {}), column(12, children))
}

/**
 * The granular section that replaces a legacy block, or null when the block type has no equivalent.
 * The result carries no editor ids; the caller assigns them (withFreshIds) and may keep the old node's _id.
 */
export function convertLegacyBlock(block: Record<string, unknown>): Record<string, unknown> | null {
  const type = block.blockType
  if (typeof type !== 'string' || !canConvertLegacy(type)) return null
  switch (type) {
    case 'hero':
      return convertHero(block)
    case 'ctaBanner':
      return convertCtaBanner(block)
    case 'imageText':
      return convertImageText(block)
    case 'gallery':
      return convertGallery(block)
    default:
      return null
  }
}
