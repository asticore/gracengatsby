/**
 * Product CSV export and import. Pure, no I/O: the admin routes read and write the database.
 *
 * One row per product, plus one row per variation with "Parent SKU" pointing at the variable
 * product, in the spirit of the WooCommerce product CSV. Import matches products by SKU, so the same
 * file can be exported, edited and imported back.
 *
 * Export is formula-injection safe: a text cell that starts with = + - @ tab or CR is prefixed
 * with a single quote so a spreadsheet never evaluates it. Import removes that prefix again, so a
 * round trip is lossless. Numeric columns are written as plain numbers and never prefixed.
 */

import { parseCsv, toCsv } from '@/lib/spreadsheet/csv'

import { decodeAttributeValues, encodeAttributeValues, splitValues, type ProductAttributeRow, type VariationRow } from './variations'

export const CSV_MAX_BYTES = 2 * 1024 * 1024
export const CSV_MAX_DATA_ROWS = 5000
export const MAX_ATTRIBUTE_COLUMNS = 10

const PRODUCT_TYPES = ['simple', 'variable', 'grouped', 'external'] as const
const BACKORDERS = ['no', 'notify', 'yes'] as const
const STOCK_STATUSES = ['instock', 'outofstock', 'onbackorder'] as const
const TAX_CLASSES = ['standard', 'reduced', 'zero'] as const

/** What the exporter reads from a product (all optional: it is database data). */
export type ExportProduct = {
  id?: number
  title?: string | null
  slug?: string | null
  _status?: string | null
  productType?: string | null
  sku?: string | null
  gtin?: string | null
  shortDescription?: string | null
  category?: string | null
  priceInAUD?: number | null
  salePrice?: number | null
  saleFrom?: string | null
  saleTo?: string | null
  manageStock?: boolean | null
  stockQty?: number | null
  backorders?: string | null
  lowStockThreshold?: number | null
  stockStatus?: string | null
  weight?: number | null
  length?: number | null
  width?: number | null
  height?: number | null
  shippingClass?: number | { id: number; slug?: string | null } | null
  taxClass?: string | null
  externalUrl?: string | null
  buttonText?: string | null
  attributes?: ProductAttributeRow[] | null
  variations?: VariationRow[] | null
  crossSells?: Array<number | { id: number; sku?: string | null }> | null
  upsells?: Array<number | { id: number; sku?: string | null }> | null
  groupedProducts?: Array<number | { id: number; sku?: string | null }> | null
}

export const BASE_COLUMNS = [
  'Type',
  'SKU',
  'Parent SKU',
  'Name',
  'Slug',
  'Published',
  'Short description',
  'Category',
  'Regular price',
  'Sale price',
  'Sale from',
  'Sale to',
  'Manage stock',
  'Stock',
  'Backorders',
  'Low stock threshold',
  'Stock status',
  'GTIN',
  'Weight',
  'Length',
  'Width',
  'Height',
  'Shipping class',
  'Tax class',
  'External URL',
  'Button text',
  'Enabled',
  'Image ID',
  'Cross-sells',
  'Upsells',
  'Grouped products',
] as const

/** Columns whose cells are numbers or fixed keywords and so are never quoted against formulas. */
const NUMERIC_COLUMNS = new Set(['Regular price', 'Sale price', 'Stock', 'Low stock threshold', 'Weight', 'Length', 'Width', 'Height', 'Image ID'])

const FORMULA_START = /^[=+\-@\t\r]/

/** Neutralises a text cell so a spreadsheet will not run it as a formula. */
export const protectCell = (value: string): string => (FORMULA_START.test(value) ? `'${value}` : value)

/** Reverses `protectCell` (only for a leading quote followed by a formula character). */
export const unprotectCell = (value: string): string => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value)

const num = (value: number | null | undefined): string => (typeof value === 'number' && Number.isFinite(value) ? String(value) : '')
const bool = (value: boolean | null | undefined): string => (value ? '1' : value === false ? '0' : '')
const idOrSku = (list: ExportProduct['crossSells']): string =>
  (list ?? [])
    .map((entry) => (typeof entry === 'object' && entry ? entry.sku || String(entry.id) : String(entry)))
    .filter(Boolean)
    .join('|')

export function exportHeader(attributeColumns: number): string[] {
  const header: string[] = [...BASE_COLUMNS]
  for (let i = 1; i <= attributeColumns; i++) header.push(`Attribute ${i} name`, `Attribute ${i} value(s)`, `Attribute ${i} variation`, `Attribute ${i} visible`)
  return header
}

export function productsToRows(products: ExportProduct[]): string[][] {
  const attributeColumns = Math.min(
    MAX_ATTRIBUTE_COLUMNS,
    Math.max(0, ...products.map((product) => Math.max(product.attributes?.length ?? 0, ...(product.variations ?? []).map((variation) => Object.keys(decodeAttributeValues(variation.attributeValues)).length)))),
  )
  const header = exportHeader(attributeColumns)
  const index = new Map(header.map((name, i) => [name, i]))
  const rows: string[][] = [header]

  const blank = (): string[] => header.map(() => '')
  const set = (row: string[], column: string, value: string): void => {
    const at = index.get(column)
    if (at === undefined) return
    row[at] = NUMERIC_COLUMNS.has(column) ? value : protectCell(value)
  }

  for (const product of products) {
    const row = blank()
    set(row, 'Type', product.productType || 'simple')
    set(row, 'SKU', product.sku || '')
    set(row, 'Name', product.title || '')
    set(row, 'Slug', product.slug || '')
    set(row, 'Published', product._status === 'draft' ? '0' : '1')
    set(row, 'Short description', product.shortDescription || '')
    set(row, 'Category', product.category || '')
    set(row, 'Regular price', num(product.priceInAUD))
    set(row, 'Sale price', num(product.salePrice))
    set(row, 'Sale from', product.saleFrom || '')
    set(row, 'Sale to', product.saleTo || '')
    set(row, 'Manage stock', bool(product.manageStock))
    set(row, 'Stock', num(product.stockQty))
    set(row, 'Backorders', product.backorders || '')
    set(row, 'Low stock threshold', num(product.lowStockThreshold))
    set(row, 'Stock status', product.stockStatus || '')
    set(row, 'GTIN', product.gtin || '')
    set(row, 'Weight', num(product.weight))
    set(row, 'Length', num(product.length))
    set(row, 'Width', num(product.width))
    set(row, 'Height', num(product.height))
    const shipping = product.shippingClass
    set(row, 'Shipping class', typeof shipping === 'object' && shipping ? shipping.slug || '' : '')
    set(row, 'Tax class', product.taxClass || '')
    set(row, 'External URL', product.externalUrl || '')
    set(row, 'Button text', product.buttonText || '')
    set(row, 'Cross-sells', idOrSku(product.crossSells))
    set(row, 'Upsells', idOrSku(product.upsells))
    set(row, 'Grouped products', idOrSku(product.groupedProducts))
    ;(product.attributes ?? []).slice(0, attributeColumns).forEach((attribute, i) => {
      const n = i + 1
      const name = attribute.name || (attribute.attribute && typeof attribute.attribute === 'object' ? attribute.attribute.name : '') || ''
      set(row, `Attribute ${n} name`, name)
      set(row, `Attribute ${n} value(s)`, attribute.values || '')
      set(row, `Attribute ${n} variation`, bool(Boolean(attribute.forVariations)))
      set(row, `Attribute ${n} visible`, bool(attribute.visible !== false))
    })
    rows.push(row)

    for (const variation of product.variations ?? []) {
      const vrow = blank()
      set(vrow, 'Type', 'variation')
      set(vrow, 'SKU', variation.sku || '')
      set(vrow, 'Parent SKU', product.sku || '')
      set(vrow, 'Name', product.title || '')
      set(vrow, 'Regular price', num(variation.priceInAUD))
      set(vrow, 'Sale price', num(variation.salePrice))
      set(vrow, 'Sale from', variation.saleFrom || '')
      set(vrow, 'Sale to', variation.saleTo || '')
      set(vrow, 'Manage stock', bool(variation.manageStock))
      set(vrow, 'Stock', num(variation.stockQty))
      set(vrow, 'Backorders', variation.backorders || '')
      set(vrow, 'Stock status', variation.stockStatus || '')
      set(vrow, 'GTIN', variation.gtin || '')
      set(vrow, 'Weight', num(variation.weight))
      set(vrow, 'Length', num(variation.length))
      set(vrow, 'Width', num(variation.width))
      set(vrow, 'Height', num(variation.height))
      set(vrow, 'Enabled', bool(variation.enabled !== false))
      set(vrow, 'Image ID', num(typeof variation.image === 'object' && variation.image ? variation.image.id : (variation.image as number | null | undefined)))
      Object.entries(decodeAttributeValues(variation.attributeValues))
        .slice(0, attributeColumns)
        .forEach(([name, value], i) => {
          set(vrow, `Attribute ${i + 1} name`, name)
          set(vrow, `Attribute ${i + 1} value(s)`, value)
        })
      rows.push(vrow)
    }
  }
  return rows
}

export const exportProductsCsv = (products: ExportProduct[]): string => '﻿' + toCsv(productsToRows(products))

/* ------------------------------ import ------------------------------ */

export type ImportedProduct = {
  line: number
  sku: string
  data: {
    title?: string
    slug?: string
    productType?: (typeof PRODUCT_TYPES)[number]
    published?: boolean
    shortDescription?: string
    category?: string
    priceInAUD?: number | null
    salePrice?: number | null
    saleFrom?: string | null
    saleTo?: string | null
    manageStock?: boolean
    stockQty?: number | null
    backorders?: (typeof BACKORDERS)[number]
    lowStockThreshold?: number | null
    stockStatus?: (typeof STOCK_STATUSES)[number]
    gtin?: string
    weight?: number | null
    length?: number | null
    width?: number | null
    height?: number | null
    taxClass?: string
    externalUrl?: string
    buttonText?: string
  }
  shippingClassSlug?: string
  attributes: ProductAttributeRow[]
  variations: Array<VariationRow & { line: number }>
  crossSellSkus: string[]
  upsellSkus: string[]
  groupedSkus: string[]
}

export type ImportError = { line: number; message: string }

export type ImportPlan = {
  products: ImportedProduct[]
  errors: ImportError[]
  /** Parent SKUs of variation rows whose parent is not in the file (applied to existing products). */
  orphanVariations: Array<{ parentSku: string; variation: VariationRow & { line: number } }>
  totalRows: number
  truncated: boolean
}

const clip = (value: string, max: number): string => value.slice(0, max)

function parseNumber(raw: string, label: string, line: number, errors: ImportError[], opts: { integer?: boolean; allowNegative?: boolean } = {}): number | null | undefined {
  const text = raw.trim()
  if (text === '') return undefined
  const value = Number(text)
  if (!Number.isFinite(value) || (!opts.allowNegative && value < 0) || (opts.integer && !Number.isInteger(value))) {
    errors.push({ line, message: `${label} "${clip(text, 40)}" is not a valid ${opts.integer ? 'whole ' : ''}number.` })
    return null
  }
  return value
}

const parseFlag = (raw: string): boolean | undefined => {
  const text = raw.trim().toLowerCase()
  if (!text) return undefined
  if (['1', 'yes', 'true', 'y'].includes(text)) return true
  if (['0', 'no', 'false', 'n'].includes(text)) return false
  return undefined
}

const parseDate = (raw: string, label: string, line: number, errors: ImportError[]): string | null | undefined => {
  const text = raw.trim()
  if (!text) return undefined
  if (!Number.isFinite(Date.parse(text))) {
    errors.push({ line, message: `${label} "${clip(text, 40)}" is not a valid date.` })
    return null
  }
  return text
}

const parseList = (raw: string): string[] =>
  raw
    .split(/[|,]/)
    .map((part) => part.trim())
    .filter(Boolean)

export function parseProductsCsv(text: string): ImportPlan {
  const plan: ImportPlan = { products: [], errors: [], orphanVariations: [], totalRows: 0, truncated: false }
  if (text.length > CSV_MAX_BYTES * 2) {
    plan.errors.push({ line: 0, message: 'The file is too large.' })
    return plan
  }
  const parsed = parseCsv(text, { maxRows: CSV_MAX_DATA_ROWS + 1 })
  plan.truncated = parsed.truncated
  const [header, ...dataRows] = parsed.rows
  if (!header) {
    plan.errors.push({ line: 0, message: 'The file is empty.' })
    return plan
  }
  const columns = new Map<string, number>()
  header.forEach((name, i) => columns.set(name.trim().toLowerCase(), i))
  if (!columns.has('sku') && !columns.has('name')) {
    plan.errors.push({ line: 1, message: 'The header needs at least a "SKU" or "Name" column.' })
    return plan
  }
  if (parsed.truncated) plan.errors.push({ line: 0, message: `Only the first ${CSV_MAX_DATA_ROWS} rows are read; the file has more.` })
  plan.totalRows = dataRows.length

  const bySku = new Map<string, ImportedProduct>()
  // Variation rows are attached after every row is read, so a variation may come before its parent in the file.
  const variationRows: Array<{ parentSku: string; variation: VariationRow & { line: number } }> = []
  const typeColumn = columns.has('type')
  const seenSkus = new Set<string>()
  const cell = (row: string[], column: string): string => {
    const at = columns.get(column.toLowerCase())
    return at === undefined ? '' : unprotectCell(row[at] ?? '')
  }

  dataRows.forEach((row, i) => {
    const line = i + 2
    const errorsBefore = plan.errors.length
    const type = cell(row, 'Type').trim().toLowerCase() || 'simple'
    const sku = clip(cell(row, 'SKU').trim(), 100)
    const parentSku = clip(cell(row, 'Parent SKU').trim(), 100)
    const isVariation = type === 'variation'

    if (!isVariation && !PRODUCT_TYPES.includes(type as (typeof PRODUCT_TYPES)[number])) {
      plan.errors.push({ line, message: `Unknown type "${clip(type, 30)}". Use simple, variable, grouped, external or variation.` })
      return
    }
    if (sku) {
      const key = sku.toLowerCase()
      if (seenSkus.has(key)) {
        plan.errors.push({ line, message: `SKU "${sku}" appears more than once in the file.` })
        return
      }
      seenSkus.add(key)
    }

    const regular = parseNumber(cell(row, 'Regular price'), 'Regular price', line, plan.errors)
    const sale = parseNumber(cell(row, 'Sale price'), 'Sale price', line, plan.errors)
    const stock = parseNumber(cell(row, 'Stock'), 'Stock', line, plan.errors, { integer: true, allowNegative: true })
    const low = parseNumber(cell(row, 'Low stock threshold'), 'Low stock threshold', line, plan.errors, { integer: true })
    const weight = parseNumber(cell(row, 'Weight'), 'Weight', line, plan.errors)
    const length = parseNumber(cell(row, 'Length'), 'Length', line, plan.errors)
    const width = parseNumber(cell(row, 'Width'), 'Width', line, plan.errors)
    const height = parseNumber(cell(row, 'Height'), 'Height', line, plan.errors)
    const from = parseDate(cell(row, 'Sale from'), 'Sale from', line, plan.errors)
    const to = parseDate(cell(row, 'Sale to'), 'Sale to', line, plan.errors)
    if (typeof regular === 'number' && typeof sale === 'number' && sale >= regular) plan.errors.push({ line, message: 'Sale price must be lower than the regular price.' })
    const backorders = cell(row, 'Backorders').trim().toLowerCase()
    if (backorders && !BACKORDERS.includes(backorders as (typeof BACKORDERS)[number])) plan.errors.push({ line, message: `Backorders must be no, notify or yes (got "${clip(backorders, 20)}").` })
    const stockStatus = cell(row, 'Stock status').trim().toLowerCase()
    if (stockStatus && !STOCK_STATUSES.includes(stockStatus as (typeof STOCK_STATUSES)[number])) plan.errors.push({ line, message: `Stock status must be instock, outofstock or onbackorder (got "${clip(stockStatus, 20)}").` })
    const taxClass = cell(row, 'Tax class').trim()
    if (taxClass.length > 60) plan.errors.push({ line, message: 'Tax class is too long.' })

    if (isVariation) {
      if (!parentSku) {
        plan.errors.push({ line, message: 'A variation row needs a Parent SKU.' })
        return
      }
      const pairs: Record<string, string> = {}
      for (let n = 1; n <= MAX_ATTRIBUTE_COLUMNS; n++) {
        const name = cell(row, `Attribute ${n} name`).trim()
        const value = cell(row, `Attribute ${n} value(s)`).trim()
        if (name && value) pairs[clip(name, 60)] = clip(value, 60)
      }
      if (Object.keys(pairs).length === 0) {
        plan.errors.push({ line, message: 'A variation row needs at least one attribute name and value.' })
        return
      }
      // Blank cells stay undefined: on an update they leave the stored value alone, and the importer fills the
      // defaults (not managed, backorders no, in stock, enabled) only when it creates the variation.
      const variation: VariationRow & { line: number } = {
        line,
        attributeValues: encodeAttributeValues(pairs),
        sku: sku || undefined,
        gtin: cell(row, 'GTIN').trim() || undefined,
        priceInAUD: regular,
        salePrice: sale,
        saleFrom: from,
        saleTo: to,
        manageStock: parseFlag(cell(row, 'Manage stock')),
        stockQty: stock,
        backorders: (backorders as VariationRow['backorders']) || undefined,
        stockStatus: (stockStatus as VariationRow['stockStatus']) || undefined,
        weight,
        length,
        width,
        height,
        enabled: parseFlag(cell(row, 'Enabled')),
      }
      const imageId = parseNumber(cell(row, 'Image ID'), 'Image ID', line, plan.errors, { integer: true })
      if (typeof imageId === 'number') variation.image = imageId
      if (plan.errors.length > errorsBefore) return
      variationRows.push({ parentSku, variation })
      return
    }

    if (!sku) {
      plan.errors.push({ line, message: 'Every product row needs a SKU (used to match existing products).' })
      return
    }
    const attributes: ProductAttributeRow[] = []
    for (let n = 1; n <= MAX_ATTRIBUTE_COLUMNS; n++) {
      const name = cell(row, `Attribute ${n} name`).trim()
      if (!name) continue
      attributes.push({
        name: clip(name, 60),
        values: splitValues(cell(row, `Attribute ${n} value(s)`)).join(' | '),
        forVariations: parseFlag(cell(row, `Attribute ${n} variation`)) ?? false,
        visible: parseFlag(cell(row, `Attribute ${n} visible`)) ?? true,
      })
    }
    const published = parseFlag(cell(row, 'Published'))
    const product: ImportedProduct = {
      line,
      sku,
      data: {
        title: cell(row, 'Name').trim() ? clip(cell(row, 'Name').trim(), 200) : undefined,
        slug: cell(row, 'Slug').trim() ? clip(cell(row, 'Slug').trim().toLowerCase(), 200) : undefined,
        // Only when the file has a Type column with a value: a file without one must not turn products into simple ones.
        productType: typeColumn && cell(row, 'Type').trim() ? (type as (typeof PRODUCT_TYPES)[number]) : undefined,
        published,
        shortDescription: cell(row, 'Short description') ? clip(cell(row, 'Short description'), 2000) : undefined,
        category: cell(row, 'Category').trim() || undefined,
        priceInAUD: regular,
        salePrice: sale,
        saleFrom: from,
        saleTo: to,
        manageStock: parseFlag(cell(row, 'Manage stock')),
        stockQty: stock,
        backorders: (backorders as ImportedProduct['data']['backorders']) || undefined,
        lowStockThreshold: low,
        stockStatus: (stockStatus as ImportedProduct['data']['stockStatus']) || undefined,
        gtin: cell(row, 'GTIN').trim() || undefined,
        weight,
        length,
        width,
        height,
        taxClass: taxClass || undefined,
        externalUrl: cell(row, 'External URL').trim() || undefined,
        buttonText: cell(row, 'Button text').trim() || undefined,
      },
      shippingClassSlug: cell(row, 'Shipping class').trim() || undefined,
      attributes,
      variations: [],
      crossSellSkus: parseList(cell(row, 'Cross-sells')),
      upsellSkus: parseList(cell(row, 'Upsells')),
      groupedSkus: parseList(cell(row, 'Grouped products')),
    }
    if (product.data.category && !['apparel', 'digital', 'physical'].includes(product.data.category)) {
      plan.errors.push({ line, message: `Category must be apparel, digital or physical (got "${clip(product.data.category, 30)}").` })
    }
    if (product.data.externalUrl && !/^https?:\/\//i.test(product.data.externalUrl)) plan.errors.push({ line, message: 'External URL must start with http:// or https://.' })
    if (plan.errors.length > errorsBefore) return
    bySku.set(sku.toLowerCase(), product)
    plan.products.push(product)
  })
  for (const { parentSku, variation } of variationRows) {
    const parent = bySku.get(parentSku.toLowerCase())
    if (parent) parent.variations.push(variation)
    else plan.orphanVariations.push({ parentSku, variation })
  }
  return plan
}
