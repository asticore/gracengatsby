/**
 * Reads a CSV file of pages and posts. The first row names the columns.
 * Columns: title (required), slug, content (HTML or plain text), excerpt,
 * status (publish or draft), date (YYYY-MM-DD), type (post or page),
 * parent_slug (pages), categories (separated by |).
 */

import { parseCsv } from '@/lib/spreadsheet/csv'
import { itemSlug, parseDate } from './items'
import { plainTextToHtml } from './htmlToBlocks'
import { IMPORT_MAX_ITEMS, type ImportItem, type ParseResult } from './types'

const KNOWN_COLUMNS = ['title', 'slug', 'content', 'excerpt', 'status', 'date', 'type', 'parent_slug', 'categories']

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

export function parseCsvItems(text: string): ParseResult {
  const result: ParseResult = { format: 'csv', items: [], errors: [], warnings: [], skipped: 0 }
  const parsed = parseCsv(text, { maxRows: IMPORT_MAX_ITEMS + 2 })
  if (parsed.truncated) {
    result.errors.push(`This file has more than ${IMPORT_MAX_ITEMS} rows. One import handles at most ${IMPORT_MAX_ITEMS}; split the file and import the parts one at a time.`)
    return result
  }
  const [header, ...rows] = parsed.rows
  if (!header) {
    result.errors.push('The file is empty.')
    return result
  }
  const columns = header.map(normalizeHeader)
  const at = (name: string) => columns.indexOf(name)
  if (at('title') === -1) {
    result.errors.push('The first row must name a "title" column.')
    return result
  }
  const unknown = columns.filter((name) => name && !KNOWN_COLUMNS.includes(name))
  if (unknown.length) result.warnings.push(`These columns are not used and were ignored: ${unknown.join(', ')}.`)

  rows.forEach((cells, index) => {
    const ref = `row ${index + 2}`
    const cell = (name: string) => (at(name) === -1 ? '' : (cells[at(name)] ?? '').trim())
    const title = cell('title')
    if (!title) {
      result.skipped++
      result.errors.push(`${ref}: no title, so this row was skipped.`)
      return
    }
    const typeWord = (cell('type') || 'post').toLowerCase()
    if (typeWord !== 'post' && typeWord !== 'page') {
      result.skipped++
      result.errors.push(`${ref}: type must be "post" or "page", not "${typeWord}". The row was skipped.`)
      return
    }
    const rawContent = cell('content')
    const rawDate = cell('date')
    const date = parseDate(rawDate)
    if (rawDate && !date) result.warnings.push(`${ref}: the date "${rawDate}" could not be read, so it was ignored.`)
    const item: ImportItem = {
      ref,
      type: typeWord === 'page' ? 'page' : 'post',
      title,
      slug: cell('slug'),
      html: rawContent.includes('<') ? rawContent : plainTextToHtml(rawContent),
      excerpt: cell('excerpt'),
      status: ['publish', 'published'].includes(cell('status').toLowerCase()) ? 'published' : 'draft',
      date,
      parentSlug: typeWord === 'page' && cell('parent_slug') ? itemSlug({ slug: cell('parent_slug'), title: '' }) : null,
      categories: typeWord === 'post' ? cell('categories').split('|').map((name) => name.trim()).filter(Boolean) : [],
    }
    result.items.push(item)
  })
  if (result.items.length === 0 && result.errors.length === 0) result.errors.push('No rows with a title were found.')
  return result
}
