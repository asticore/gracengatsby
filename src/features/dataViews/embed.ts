import { toCsv } from '@/lib/spreadsheet/csv'

import { parseNumber, rawCell } from './format'
import { DATA_ENDPOINT_PREFIX, EMBED_PATH_PREFIX, RESIZE_MESSAGE_TYPE } from './slugs'
import type { DataViewModel } from './types'

/**
 * Everything about getting a view out of the site: the share link, the iframe snippet with its
 * auto-resize script, the shortcode forms, and the CSV and JSON bodies. Pure.
 */

/** The identifier used in links: the slug when there is one, otherwise the id. */
export const refOf = (view: { id: number; slug: string | null }): string => view.slug || String(view.id)

export const embedPath = (ref: string): string => `${EMBED_PATH_PREFIX}${ref}`
export const csvPath = (ref: string): string => `${DATA_ENDPOINT_PREFIX}${ref}.csv`
export const jsonPath = (ref: string): string => `${DATA_ENDPOINT_PREFIX}${ref}.json`

/** The two text forms an editor can paste into any text field: [data-view ...] and {{data-view:...}}. */
export const shortcodeFor = (ref: string): string => `[data-view ${/^\d+$/.test(ref) ? 'id' : 'slug'}="${ref}"]`
export const mergeTagFor = (ref: string): string => `{{data-view:${ref}}}`

const escapeAttr = (value: string): string => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * The iframe an editor copies. The small script after it listens for the height the embedded page
 * posts and resizes this one iframe only (it matches the message to the frame by its source window).
 */
export function iframeSnippet(origin: string, ref: string, options: { title: string; height?: number }): string {
  const src = `${origin.replace(/\/$/, '')}${embedPath(ref)}`
  const height = Math.max(120, Math.min(2000, Math.round(options.height ?? 400)))
  const id = `eg-dv-${ref.replace(/[^a-z0-9-]/gi, '')}`
  return [
    `<iframe id="${escapeAttr(id)}" src="${escapeAttr(src)}" title="${escapeAttr(options.title)}" width="100%" height="${height}" style="border:0;max-width:100%" loading="lazy"></iframe>`,
    `<script>window.addEventListener('message',function(e){var d=e.data;if(!d||d.type!=='${RESIZE_MESSAGE_TYPE}')return;var f=document.getElementById('${id}');if(f&&f.contentWindow===e.source&&typeof d.height==='number')f.style.height=Math.ceil(d.height)+'px';});</script>`,
  ].join('\n')
}

/** What the embedded page runs to tell its parent how tall it is. Posts the height only, to any origin. */
export const RESIZE_SCRIPT = `(function(){function send(){var h=Math.ceil(document.documentElement.scrollHeight);try{parent.postMessage({type:'${RESIZE_MESSAGE_TYPE}',height:h},'*')}catch(e){}}if(parent===window)return;window.addEventListener('load',send);window.addEventListener('resize',send);if('ResizeObserver' in window){new ResizeObserver(send).observe(document.body)}send()})();`

/** Spreadsheet programs run text that starts with = + - @ as a formula; such text gets a leading apostrophe. */
export function guardFormula(value: string): string {
  // Leading whitespace and control characters (\x00-\x20, \x7f-\x9f,  / ) are skipped before the check.
  if (!/^[\s\x00-\x20\x7f-\x9f]*[=+\-@]/.test(value)) return value
  // A plain number such as -12.5 is not a formula.
  return parseNumber(value) !== null && /^-?[\d.,]+$/.test(value) ? value : `'${value}`
}

export function toCsvBody(model: DataViewModel): string {
  const header = model.data.columns.map((column) => guardFormula(column.label))
  const rows = model.data.rows.map((row) => model.data.columns.map((_, ci) => guardFormula(rawCell(row[ci] ?? null))))
  return toCsv([header, ...rows])
}

export function toJsonBody(model: DataViewModel): { id: number; title: string; kind: string; columns: { key: string; label: string; type: string }[]; rows: Record<string, string | number | boolean | null>[]; truncated: boolean } {
  return {
    id: model.view.id,
    title: model.view.title,
    kind: model.view.kind,
    columns: model.data.columns.map((column) => ({ key: column.key, label: column.label, type: column.type })),
    rows: model.data.rows.map((row) => Object.fromEntries(model.data.columns.map((column, ci) => [column.key, row[ci] ?? null]))),
    truncated: model.data.truncated,
  }
}
