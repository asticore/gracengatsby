/**
 * Pure design checks for the visual editor's page tree. The Checks list in EditorDock shows the
 * results; clicking one selects the node it points at (see indexNodePaths for the id-to-path map).
 *
 * Rules (warn = likely a real problem, info = worth a look):
 *   - low text/background contrast (WCAG ratio below 4.5), only when both colours are plain hex
 *   - heading order skips a level (h2 straight to h4)
 *   - image over 2 MB, only when the node carries a size in props (fileSize or sizeBytes)
 *   - image with no alt text
 *   - more than 3 heavy effects on one block (particles, parallax, pointer effect, animated background, Ken Burns)
 *   - a button or CTA with a label but no link
 */

import type { SectionNode } from '@/lib/sectionTree'

import type { NodePath } from './treeOps'

export type WarningLevel = 'warn' | 'info'

export type DesignWarning = {
  id: string
  level: WarningLevel
  nodeId: string
  message: string
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024
const MIN_CONTRAST = 4.5
const MAX_HEAVY_EFFECTS = 3
const ANIMATED_BG_EFFECTS = ['aurora', 'mesh', 'gradient-shift']

type Rec = Record<string, unknown>

const asRec = (value: unknown): Rec => (value && typeof value === 'object' ? (value as Rec) : {})
const str = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/** Stable id for a node: its _id when present, otherwise its path. */
export function nodeIdOf(node: SectionNode, path: NodePath): string {
  return typeof node._id === 'string' && node._id ? node._id : `path:${path.join('.')}`
}

type Visited = { node: SectionNode; path: NodePath; nodeId: string }

/** Depth-first, document-order walk. Block paths are odd length, column paths even (see treeOps.ts). */
function visitAll(blocks: SectionNode[], base: NodePath, visit: (item: Visited) => void): void {
  blocks.forEach((node, index) => {
    const path = [...base, index]
    visit({ node, path, nodeId: nodeIdOf(node, path) })
    node.columns?.forEach((column, columnIndex) => {
      visitAll(column.blocks || [], [...path, columnIndex], visit)
    })
  })
}

/** Maps every node id in the tree to its path, so a warning can select its node. */
export function indexNodePaths(tree: SectionNode[]): Map<string, NodePath> {
  const map = new Map<string, NodePath>()
  visitAll(tree, [], ({ path, nodeId }) => map.set(nodeId, path))
  return map
}

/** Parses #rgb or #rrggbb. Anything else (var(), gradients, names) returns null. */
export function parseHex(value: unknown): [number, number, number] | null {
  if (typeof value !== 'string') return null
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim())
  if (!match) return null
  let hex = match[1]
  if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}

function channelLuminance(value: number): number {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * channelLuminance(rgb[0]) + 0.7152 * channelLuminance(rgb[1]) + 0.0722 * channelLuminance(rgb[2])
}

/** WCAG contrast ratio between two colours, from 1 to 21. */
export function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Heading level from an element's tag prop (h1-h6). A heading element with no tag defaults to h2. */
function headingLevel(node: SectionNode): number | null {
  if (node.blockType !== 'element') return null
  const props = asRec(node.props)
  const tag = str(props.tag).toLowerCase()
  if (/^h[1-6]$/.test(tag)) return Number(tag.charAt(1))
  if (node.elementType === 'heading') return 2
  return null
}

function contrastWarning(node: SectionNode): string | null {
  const design = asRec(node.design)
  if (design.bgType !== undefined && design.bgType !== 'color') return null
  const text = parseHex(design.textColor)
  const background = parseHex(design.bgColor)
  if (!text || !background) return null
  const ratio = contrastRatio(text, background)
  if (ratio >= MIN_CONTRAST) return null
  return `Low text contrast (${ratio.toFixed(2)}:1, needs 4.5:1)`
}

function heavyEffects(node: SectionNode): string[] {
  const design = asRec(node.design)
  const effects: string[] = []
  if (design.bgEffect === 'particles') effects.push('particles')
  if (typeof design.parallax === 'string' && design.parallax !== 'none') effects.push('parallax')
  if (typeof design.pointerFx === 'string' && design.pointerFx !== 'none') effects.push('pointer effect')
  if (typeof design.bgEffect === 'string' && ANIMATED_BG_EFFECTS.includes(design.bgEffect)) effects.push('animated background')
  if (typeof design.kenBurns === 'string' && design.kenBurns !== 'none') effects.push('Ken Burns')
  return effects
}

/** Label/URL pairs a CTA can carry: `primaryCtaLabel` -> `primaryCtaUrl`, `buttonText` -> `buttonUrl`. */
function ctaPairs(source: Rec): Array<{ url: string }> {
  const pairs: Array<{ url: string }> = []
  for (const [key, value] of Object.entries(source)) {
    if (!str(value)) continue
    if (key === 'buttonText') {
      pairs.push({ url: 'buttonUrl' })
      continue
    }
    const match = /^(.*)Label$/.exec(key)
    if (match) pairs.push({ url: `${match[1]}Url` })
  }
  return pairs
}

/** Reads a link value: a plain string, or the LinkField shape { url }. */
function linkValue(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  return str(asRec(value).url)
}

/** Buttons and CTAs that have a label but no link. Blank labels do not count. */
function emptyLinkCount(node: SectionNode): number {
  const props = node.blockType === 'element' ? asRec(node.props) : asRec(node)
  const pairs = ctaPairs(props)
  if (pairs.length > 0) return pairs.filter((pair) => !linkValue(props[pair.url])).length
  if (node.blockType === 'element' && /button|cta/i.test(str(node.elementType))) {
    const hasLabel = str(props.text) || str(props.label)
    const hasUrl = linkValue(props.link) || linkValue(props.url) || linkValue(props.href)
    if (hasLabel && !hasUrl) return 1
  }
  return 0
}

type ImageIssue = { kind: 'image-size' | 'image-alt'; message: string }

function imageIssues(node: SectionNode): ImageIssue[] {
  if (node.blockType !== 'element' || node.elementType !== 'image') return []
  const props = asRec(node.props)
  const issues: ImageIssue[] = []
  const size = [props.fileSize, props.sizeBytes].find((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (size !== undefined && size > MAX_IMAGE_BYTES) issues.push({ kind: 'image-size', message: 'Image is over 2 MB' })
  const hasSource = (props.image !== undefined && props.image !== null && props.image !== '') || Boolean(str(props.url))
  if (hasSource && !str(props.alt)) issues.push({ kind: 'image-alt', message: 'Image has no alt text' })
  return issues
}

/** Runs every design check over the page tree. Results are in document order. */
export function collectWarnings(tree: SectionNode[]): DesignWarning[] {
  const warnings: DesignWarning[] = []
  const add = (level: WarningLevel, nodeId: string, kind: string, message: string, index = 0) => {
    warnings.push({ id: `${kind}:${nodeId}:${index}`, level, nodeId, message })
  }

  let previousHeading: number | null = null

  visitAll(tree, [], ({ node, nodeId }) => {
    const contrast = contrastWarning(node)
    if (contrast) add('warn', nodeId, 'contrast', contrast)

    const level = headingLevel(node)
    if (level !== null) {
      if (previousHeading !== null && level > previousHeading + 1) {
        add('warn', nodeId, 'heading', `Heading jumps from h${previousHeading} to h${level}`)
      }
      previousHeading = level
    }

    for (const issue of imageIssues(node)) add('warn', nodeId, issue.kind, issue.message)

    const effects = heavyEffects(node)
    if (effects.length > MAX_HEAVY_EFFECTS) {
      add('info', nodeId, 'effects', `${effects.length} heavy effects on one block (${effects.join(', ')})`)
    }

    const empty = emptyLinkCount(node)
    for (let i = 0; i < empty; i += 1) {
      add('warn', nodeId, 'empty-link', 'Button or link has no URL', i)
    }
  })

  return warnings
}
