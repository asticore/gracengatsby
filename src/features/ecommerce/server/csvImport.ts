/**
 * Applies a parsed product CSV (see ../csv.ts) to the catalogue. Matching is by SKU: a row whose SKU
 * exists updates that product (only the cells that were filled in), any other row creates one.
 * `dryRun` does every lookup and check but writes nothing, so the preview matches the real run.
 */

import { exportProductsCsv, parseProductsCsv, type ExportProduct, type ImportedProduct, type ImportError } from '../csv'
import { slugify } from '../slugify'
import { MAX_GENERATED_VARIATIONS, variationKey, type VariationRow } from '../variations'

type Doc = Record<string, unknown> & { id: number }
type EngineLike = {
  find: (args: Record<string, unknown>) => Promise<{ docs: Doc[] }>
  create: (args: Record<string, unknown>) => Promise<Doc>
  update: (args: Record<string, unknown>) => Promise<Doc>
}

export type ImportRow = { line: number; sku: string; action: 'create' | 'update' | 'error' }
export type ImportReport = {
  dryRun: boolean
  created: number
  updated: number
  failed: number
  rows: ImportRow[]
  errors: ImportError[]
  totalRows: number
  truncated: boolean
}

const SCAN_LIMIT = 5000
/** One import runs inside a single Worker request; more rows than this would be cut short, so the file must be split. */
export const IMPORT_MAX_ROWS = 300

const defined = <T extends object>(row: T): Partial<T> => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== null && value !== undefined)) as Partial<T>
/** Defaults apply to a NEW variation only. */
const withVariationDefaults = (row: VariationRow): VariationRow => ({ manageStock: false, backorders: 'no', stockStatus: 'instock', enabled: true, ...defined(row) })
const idOf = (value: unknown): number | null => (typeof value === 'number' ? value : value && typeof value === 'object' && 'id' in value ? Number((value as { id: number }).id) : null)

async function loadAll(engine: EngineLike): Promise<Doc[]> {
  const { docs } = await engine.find({ collection: 'products', limit: SCAN_LIMIT, depth: 0, overrideAccess: true, draft: false, pagination: false })
  return docs
}

/** Product rows for the exporter: shipping class slugs and linked product SKUs are looked up here. */
export async function exportCatalogueCsv(engine: EngineLike): Promise<string> {
  const products = await loadAll(engine)
  const classes = await engine.find({ collection: 'shipping-classes', limit: 500, depth: 0, overrideAccess: true })
  const slugOf = new Map(classes.docs.map((doc) => [doc.id, String(doc.slug ?? '')]))
  const skuOf = new Map(products.map((doc) => [doc.id, typeof doc.sku === 'string' ? doc.sku : '']))
  const link = (value: unknown) =>
    ((Array.isArray(value) ? value : []) as unknown[]).map((entry) => {
      const id = idOf(entry)
      return { id: id ?? 0, sku: id ? skuOf.get(id) || null : null }
    })
  const rows = products.map((doc) => ({
    ...doc,
    shippingClass: (() => {
      const id = idOf(doc.shippingClass)
      return id ? { id, slug: slugOf.get(id) ?? null } : null
    })(),
    crossSells: link(doc.crossSells),
    upsells: link(doc.upsells),
    groupedProducts: link(doc.groupedProducts),
  }))
  return exportProductsCsv(rows as unknown as ExportProduct[])
}

export async function runProductImport(engine: EngineLike, text: string, opts: { dryRun: boolean }): Promise<ImportReport> {
  const plan = parseProductsCsv(text)
  const report: ImportReport = { dryRun: opts.dryRun, created: 0, updated: 0, failed: 0, rows: [], errors: [...plan.errors], totalRows: plan.totalRows, truncated: plan.truncated }
  if (plan.totalRows > IMPORT_MAX_ROWS) {
    // Refuse up front: applying only part of a file leaves the catalogue half-updated.
    report.errors.push({ line: 0, message: `This file has ${plan.totalRows} rows; one import handles at most ${IMPORT_MAX_ROWS}. Split the file into smaller parts and import them one at a time. Nothing was changed.` })
    return report
  }
  if (plan.products.length === 0 && plan.orphanVariations.length === 0) return report

  const existing = await loadAll(engine)
  const bySku = new Map<string, Doc>()
  const skuOwners = new Map<string, number>()
  for (const doc of existing) {
    if (typeof doc.sku === 'string' && doc.sku) bySku.set(doc.sku.toLowerCase(), doc)
    for (const variation of (doc.variations as VariationRow[] | undefined) ?? []) if (variation.sku) skuOwners.set(variation.sku.toLowerCase(), doc.id)
  }
  const slugs = new Set(existing.map((doc) => String(doc.slug ?? '')))
  const classes = await engine.find({ collection: 'shipping-classes', limit: 500, depth: 0, overrideAccess: true })
  const classBySlug = new Map(classes.docs.map((doc) => [String(doc.slug ?? '').toLowerCase(), doc.id]))
  const inFile = new Set(plan.products.map((product) => product.sku.toLowerCase()))
  const fail = (line: number, sku: string, message: string) => {
    report.errors.push({ line, message })
    report.rows.push({ line, sku, action: 'error' })
    report.failed++
  }

  const idsFor = (skus: string[], line: number, label: string, created: Map<string, number>): number[] | null => {
    const out: number[] = []
    for (const sku of skus) {
      const key = sku.toLowerCase()
      const id = bySku.get(key)?.id ?? created.get(key)
      if (id) out.push(id)
      else if (inFile.has(key) && opts.dryRun) continue
      else {
        report.errors.push({ line, message: `${label} SKU "${sku}" matches no product.` })
        return null
      }
    }
    return out
  }

  /** A variation SKU must not belong to another product or another product's variation (its own current SKU is fine). */
  const skuClash = (sku: string, ownerId: number | undefined, currentSku: string | null | undefined): string | null => {
    const key = sku.toLowerCase()
    if (currentSku && currentSku.toLowerCase() === key) return null
    const variationOwner = skuOwners.get(key)
    if (variationOwner !== undefined && variationOwner !== ownerId) return `Variation SKU "${sku}" is already used by another product.`
    const productOwner = bySku.get(key)
    if (productOwner && productOwner.id !== ownerId) return `Variation SKU "${sku}" is already a product SKU.`
    if (inFile.has(key) && !bySku.has(key)) return `Variation SKU "${sku}" is also a product SKU in this file.`
    return null
  }
  const created = new Map<string, number>()
  const pendingLinks: Array<{ id: number; product: ImportedProduct }> = []

  for (const product of plan.products) {
    const match = bySku.get(product.sku.toLowerCase())
    const data: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(product.data)) if (value !== undefined && key !== 'published' && key !== 'slug') data[key] = value
    if (product.attributes.length > 0) data.attributes = product.attributes
    if (product.shippingClassSlug) {
      const id = classBySlug.get(product.shippingClassSlug.toLowerCase())
      if (!id) {
        fail(product.line, product.sku, `Shipping class "${product.shippingClassSlug}" does not exist.`)
        continue
      }
      data.shippingClass = id
    }
    if (product.variations.length > 0) {
      const merged: VariationRow[] = [...(((match?.variations as VariationRow[] | undefined) ?? []))]
      for (const incoming of product.variations) {
        const { line: _line, ...row } = incoming
        const at = merged.findIndex((variation) => variationKey(variation.attributeValues) === variationKey(row.attributeValues))
        const owner = match?.id
        const clash = row.sku ? skuClash(row.sku, owner, at >= 0 ? merged[at].sku : null) : null
        if (clash) {
          report.errors.push({ line: incoming.line, message: clash })
          continue
        }
        if (at >= 0) merged[at] = { ...merged[at], ...defined(row) }
        else merged.push(withVariationDefaults(row))
      }
      if (merged.length > MAX_GENERATED_VARIATIONS) {
        fail(product.line, product.sku, `A product can have at most ${MAX_GENERATED_VARIATIONS} variations.`)
        continue
      }
      data.variations = merged
    }
    const status = product.data.published === undefined ? undefined : product.data.published ? 'published' : 'draft'
    if (status) data._status = status

    if (!match) {
      if (skuOwners.has(product.sku.toLowerCase())) {
        fail(product.line, product.sku, `SKU "${product.sku}" is already used by a variation.`)
        continue
      }
      if (!product.data.title) {
        fail(product.line, product.sku, 'A new product needs a Name.')
        continue
      }
      let slug = product.data.slug || slugify(product.data.title)
      for (let n = 2; slugs.has(slug); n++) slug = `${slugify(product.data.title)}-${n}`
      slugs.add(slug)
      data.slug = slug
      data.sku = product.sku
      data.productType ??= 'simple'
      data._status ??= 'draft'
      if (opts.dryRun) {
        report.rows.push({ line: product.line, sku: product.sku, action: 'create' })
        report.created++
        continue
      }
      try {
        const doc = await engine.create({ collection: 'products', data, overrideAccess: true, draft: false })
        created.set(product.sku.toLowerCase(), doc.id)
        pendingLinks.push({ id: doc.id, product })
        report.rows.push({ line: product.line, sku: product.sku, action: 'create' })
        report.created++
      } catch (error) {
        fail(product.line, product.sku, errorMessage(error))
      }
      continue
    }

    if (product.data.slug && product.data.slug !== match.slug) {
      if (slugs.has(product.data.slug)) {
        fail(product.line, product.sku, `Slug "${product.data.slug}" is already used by another product.`)
        continue
      }
      slugs.add(product.data.slug)
      data.slug = product.data.slug
    }
    if (opts.dryRun) {
      report.rows.push({ line: product.line, sku: product.sku, action: 'update' })
      report.updated++
      pendingLinks.push({ id: match.id, product })
      continue
    }
    try {
      await engine.update({ collection: 'products', id: match.id, data, overrideAccess: true, draft: false })
      pendingLinks.push({ id: match.id, product })
      report.rows.push({ line: product.line, sku: product.sku, action: 'update' })
      report.updated++
    } catch (error) {
      fail(product.line, product.sku, errorMessage(error))
    }
  }

  // Cross-sells, upsells and grouped products can name products created in this same file, so they go in last.
  for (const { id, product } of pendingLinks) {
    const links: Record<string, number[]> = {}
    for (const [field, skus, label] of [
      ['crossSells', product.crossSellSkus, 'Cross-sell'],
      ['upsells', product.upsellSkus, 'Upsell'],
      ['groupedProducts', product.groupedSkus, 'Grouped product'],
    ] as const) {
      if (skus.length === 0) continue
      const ids = idsFor(skus, product.line, label, created)
      if (ids) links[field] = ids.filter((other) => other !== id)
    }
    if (opts.dryRun || Object.keys(links).length === 0) continue
    try {
      await engine.update({ collection: 'products', id, data: links, overrideAccess: true, draft: false })
    } catch (error) {
      report.errors.push({ line: product.line, message: `Could not save linked products: ${errorMessage(error)}` })
    }
  }

  // Variation rows whose parent is not in the file go onto the existing product.
  for (const { parentSku, variation } of plan.orphanVariations) {
    const parent = bySku.get(parentSku.toLowerCase())
    if (!parent) {
      fail(variation.line, variation.sku || parentSku, `Parent SKU "${parentSku}" matches no product.`)
      continue
    }
    const { line, ...row } = variation
    const current = [...(((parent.variations as VariationRow[] | undefined) ?? []))]
    const at = current.findIndex((entry) => variationKey(entry.attributeValues) === variationKey(row.attributeValues))
    const clash = row.sku ? skuClash(row.sku, parent.id, at >= 0 ? current[at].sku : null) : null
    if (clash) {
      fail(line, variation.sku || parentSku, clash)
      continue
    }
    if (at >= 0) current[at] = { ...current[at], ...defined(row) }
    else current.push(withVariationDefaults(row))
    if (current.length > MAX_GENERATED_VARIATIONS) {
      fail(line, variation.sku || parentSku, `A product can have at most ${MAX_GENERATED_VARIATIONS} variations.`)
      continue
    }
    if (!opts.dryRun) {
      try {
        const updated = await engine.update({ collection: 'products', id: parent.id, data: { variations: current }, overrideAccess: true, draft: false })
        parent.variations = (updated.variations as VariationRow[]) ?? current
      } catch (error) {
        fail(line, variation.sku || parentSku, errorMessage(error))
        continue
      }
    } else parent.variations = current
    report.rows.push({ line, sku: variation.sku || parentSku, action: 'update' })
    report.updated++
  }

  report.rows.sort((a, b) => a.line - b.line)
  return report
}

function errorMessage(error: unknown): string {
  const data = (error as { data?: { errors?: Array<{ message?: string }> } }).data
  const first = data?.errors?.[0]?.message
  return (first || (error instanceof Error ? error.message : 'Could not save.')).slice(0, 300)
}
