/** Helpers shared by the readers, the planner and the importer. */

import type { ImportItem, ItemStatus } from './types'

/** Lower-case address made of letters, digits and single hyphens. Accents are folded to plain letters. */
export function cleanSlug(input: string): string {
  let text = input
  try {
    text = decodeURIComponent(input)
  } catch {
    text = input
  }
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

/** The address an item will get: its slug, or its title when the slug is empty. */
export function itemSlug(item: Pick<ImportItem, 'slug' | 'title'>): string {
  return cleanSlug(item.slug || item.title) || 'untitled'
}

/** ISO date-time from "YYYY-MM-DD HH:MM:SS" (WordPress GMT format) or an ISO-like date. Null when not usable. */
export function parseDate(raw: string): string | null {
  const text = raw.trim()
  if (!text || text.startsWith('0000')) return null
  const match = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?/.exec(text)
  if (!match) return null
  const time = match[2] ? (match[2].length === 5 ? `${match[2]}:00` : match[2]) : '00:00:00'
  const iso = `${match[1]}T${time}Z`
  return Number.isNaN(new Date(iso).getTime()) ? null : iso
}

/** WordPress status to the two states this import uses. Only "publish" stays published. */
export function statusFromWordPress(raw: string): ItemStatus {
  return raw.trim().toLowerCase() === 'publish' ? 'published' : 'draft'
}