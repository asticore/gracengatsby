/**
 * Product feeds for Google Merchant Center (/feeds/google-merchant.xml) and Meta / Facebook
 * Catalog (/feeds/meta-catalog.csv). Built only from PUBLISHED products by the caller; every
 * variation of a variable product becomes its own row, tied together by item_group_id.
 */

import { variationLabel, variationPriceFields } from '../catalogue'
import { priceInfo } from '../pricing'
import { canPurchase, computeStockStatus, type StockFields } from '../stock'
import { escapeHtml } from './invoice'
import { csvCell } from './manifest'

type Loose = Record<string, unknown>

export type FeedItem = {
  id: string
  groupId: string
  title: string
  description: string
  link: string
  imageLink: string
  additionalImages: string[]
  availability: 'in stock' | 'out of stock' | 'backorder'
  price: string
  salePrice: string
  brand: string
  gtin: string
  mpn: string
  condition: 'new' | 'used' | 'refurbished'
  productType: string
  googleCategory: string
  /** kg, canonical */
  weightKg: number | null
  color: string
  size: string
}

export type FeedContext = {
  /** https://example.com, no trailing slash */
  baseUrl: string
  currency: string
  brand: string
  condition?: 'new' | 'used' | 'refurbished'
  googleCategory?: string
  now?: Date
}

/** Plain text from a rich-text value (Lexical-style JSON) or a plain string. */
export function plainText(value: unknown, max = 5000): string {
  const parts: string[] = []
  const walk = (node: unknown): void => {
    if (!node) return
    if (typeof node === 'string') {
      parts.push(node)
      return
    }
    if (Array.isArray(node)) {
      node.forEach(walk)
      return
    }
    if (typeof node === 'object') {
      const n = node as Loose
      if (typeof n.text === 'string') parts.push(n.text)
      if (n.children) walk(n.children)
      else if (n.root) walk(n.root)
      if (n.type === 'paragraph' || n.type === 'heading' || n.type === 'listitem') parts.push(' ')
    }
  }
  walk(value)
  return parts.join('').replace(/\s+/g, ' ').trim().slice(0, max)
}

const money = (n: number, currency: string): string => `${n.toFixed(2)} ${currency}`

const mediaUrl = (m: unknown, base: string): string => {
  const url = m && typeof m === 'object' ? (m as Loose).url : typeof m === 'string' ? m : ''
  if (typeof url !== 'string' || !url) return ''
  if (/^https?:\/\//i.test(url)) return url
  return url.startsWith('/') ? `${base}${url}` : ''
}

const availabilityOf = (stock: StockFields): FeedItem['availability'] => {
  const status = computeStockStatus(stock)
  if (status === 'outofstock' || !canPurchase(stock, 1)) return 'out of stock'
  return status === 'onbackorder' ? 'backorder' : 'in stock'
}

const optionOf = (attrs: Record<string, string>, names: string[]): string => {
  const key = Object.keys(attrs).find((k) => names.includes(k.toLowerCase()))
  return key ? attrs[key] : ''
}

/** Turns published product documents (read at depth 1) into feed rows. Products without a price or a slug are skipped. */
export function buildFeedItems(products: Loose[], ctx: FeedContext): FeedItem[] {
  const now = ctx.now ?? new Date()
  const items: FeedItem[] = []
  for (const p of products) {
    const type = (p.productType as string) || 'simple'
    if (type === 'external' || type === 'grouped') continue
    const slug = typeof p.slug === 'string' ? p.slug : ''
    const title = typeof p.title === 'string' ? p.title : ''
    if (!slug || !title) continue
    const images = (Array.isArray(p.images) ? p.images : []).map((m) => mediaUrl(m, ctx.baseUrl)).filter(Boolean)
    const description = plainText(p.shortDescription || p.description) || title
    const base = {
      groupId: String(p.id),
      description,
      link: `${ctx.baseUrl}/shop/${slug}`,
      brand: ctx.brand,
      condition: ctx.condition ?? 'new',
      productType: typeof p.category === 'string' ? p.category : '',
      googleCategory: ctx.googleCategory ?? '',
      weightKg: typeof p.weight === 'number' ? p.weight : null,
    }
    if (type === 'variable') {
      for (const v of (Array.isArray(p.variations) ? p.variations : []) as Loose[]) {
        if (v.enabled === false || !v.id) continue
        const info = priceInfo(variationPriceFields(p as never, v as never), now)
        if (info.price === null) continue
        const stock: StockFields = v.manageStock ? (v as StockFields) : p.manageStock ? (p as StockFields) : (v as StockFields)
        const attrs = Object.fromEntries(
          String(v.attributeValues ?? '')
            .split('|')
            .map((pair) => pair.split('=') as [string, string])
            .filter((pair) => pair[0] && pair[1]),
        )
        const own = mediaUrl(v.image, ctx.baseUrl)
        items.push({
          ...base,
          id: String(v.sku || `${p.id}-${v.id}`),
          title: `${title} - ${variationLabel(v as never)}`.slice(0, 150),
          imageLink: own || images[0] || '',
          additionalImages: images.slice(own ? 0 : 1, 10),
          availability: availabilityOf(stock),
          price: money(info.regular ?? info.price, ctx.currency),
          salePrice: info.onSale ? money(info.price, ctx.currency) : '',
          gtin: String(v.gtin || p.gtin || ''),
          mpn: String(v.sku || p.sku || ''),
          weightKg: typeof v.weight === 'number' ? v.weight : base.weightKg,
          color: optionOf(attrs, ['color', 'colour']),
          size: optionOf(attrs, ['size']),
        })
      }
      continue
    }
    const info = priceInfo(p as never, now)
    if (info.price === null) continue
    items.push({
      ...base,
      id: String(p.sku || p.id),
      title: title.slice(0, 150),
      imageLink: images[0] || '',
      additionalImages: images.slice(1, 11),
      availability: availabilityOf(p as StockFields),
      price: money(info.regular ?? info.price, ctx.currency),
      salePrice: info.onSale ? money(info.price, ctx.currency) : '',
      gtin: String(p.gtin || ''),
      mpn: String(p.sku || ''),
      color: '',
      size: '',
    })
  }
  // A feed row without an image is rejected by both platforms.
  return items.filter((i) => i.imageLink)
}

const tag = (name: string, value: string | number | null | undefined): string => (value === '' || value === null || value === undefined ? '' : `<g:${name}>${escapeHtml(value)}</g:${name}>`)

export function googleMerchantXml(items: FeedItem[], channel: { title: string; link: string; description: string }): string {
  const rows = items
    .map(
      (i) =>
        `<item>${tag('id', i.id)}<title>${escapeHtml(i.title)}</title><description>${escapeHtml(i.description)}</description><link>${escapeHtml(i.link)}</link>${tag('image_link', i.imageLink)}${i.additionalImages.map((u) => tag('additional_image_link', u)).join('')}${tag('availability', i.availability)}${tag('price', i.price)}${tag('sale_price', i.salePrice)}${tag('brand', i.brand)}${tag('gtin', i.gtin)}${i.gtin ? '' : tag('identifier_exists', 'no')}${tag('mpn', i.mpn)}${tag('condition', i.condition)}${tag('item_group_id', i.groupId)}${tag('product_type', i.productType)}${tag('google_product_category', i.googleCategory)}${tag('color', i.color)}${tag('size', i.size)}${i.weightKg !== null ? tag('shipping_weight', `${i.weightKg} kg`) : ''}</item>`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>${escapeHtml(channel.title)}</title><link>${escapeHtml(channel.link)}</link><description>${escapeHtml(channel.description)}</description>${rows}</channel></rss>\n`
}

export const META_COLUMNS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'google_product_category', 'sale_price', 'item_group_id', 'gtin', 'mpn', 'color', 'size', 'product_type', 'additional_image_link']

export function metaCatalogCsv(items: FeedItem[]): string {
  const lines = [META_COLUMNS.join(',')]
  for (const i of items) {
    const availability = i.availability === 'backorder' ? 'available for order' : i.availability
    lines.push(
      [i.id, i.title, i.description.slice(0, 5000), availability, i.condition, i.price, i.link, i.imageLink, i.brand, i.googleCategory, i.salePrice, i.groupId, i.gtin, i.mpn, i.color, i.size, i.productType, i.additionalImages.join(',')]
        .map(csvCell)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}