import { SITE_TEMPLATE_KINDS, type SiteTemplateKind } from '@/collections/SiteTemplates'
import { getElementDef } from '@/lib/elements/registry'
import { parseColumns, walkNodes, type SectionColumn, type SectionNode } from '@/lib/sectionTree'

export const TEMPLATE_IO_FORMAT = 'engage-template'
export const TEMPLATE_IO_VERSION = 1
export const TEMPLATE_IO_MAX_BYTES = 500 * 1024

export type TemplateExport = {
  format: typeof TEMPLATE_IO_FORMAT
  version: typeof TEMPLATE_IO_VERSION
  kind: SiteTemplateKind
  title: string
  conditions: unknown[]
  blocks: SectionNode[]
  priority: number
}

export type TemplateImportResult = { ok: true; template: TemplateExport } | { ok: false; error: string }

const SECRET_KEY = /secret|token|api[-_]?key|password|private[-_]?key|authorization/i
const STRIP_KEYS = new Set(['id', '_id', 'createdAt', 'updatedAt'])

/** Deep copy dropping ids and secret-looking keys. Strings are kept as inert data. */
function clean(value: unknown, depth = 0): unknown {
  if (depth > 40) return null
  if (Array.isArray(value)) return value.map((v) => clean(v, depth + 1))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STRIP_KEYS.has(k) || SECRET_KEY.test(k)) continue
      out[k] = clean(v, depth + 1)
    }
    return out
  }
  return value
}

/** Builds the portable export of a site-templates doc (no ids, no secrets). */
export function buildTemplateExport(doc: { name?: unknown; kind?: unknown; conditions?: unknown; blocks?: unknown; priority?: unknown }): TemplateExport {
  const kind = SITE_TEMPLATE_KINDS.find((k) => k === doc.kind) ?? SITE_TEMPLATE_KINDS[0]
  return {
    format: TEMPLATE_IO_FORMAT,
    version: TEMPLATE_IO_VERSION,
    kind,
    title: typeof doc.name === 'string' ? doc.name : 'Template',
    conditions: Array.isArray(doc.conditions) ? (clean(doc.conditions) as unknown[]) : [],
    blocks: clean(parseColumns([{ blocks: Array.isArray(doc.blocks) ? doc.blocks : [] }])[0]?.blocks ?? []) as SectionNode[],
    priority: typeof doc.priority === 'number' && Number.isFinite(doc.priority) ? doc.priority : 10,
  }
}

const fail = (error: string): TemplateImportResult => ({ ok: false, error })

/** Validates an uploaded template (raw JSON text or parsed value) and normalises its blocks. */
export function validateTemplateImport(input: unknown): TemplateImportResult {
  let data = input
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > TEMPLATE_IO_MAX_BYTES) return fail('File is too large (500KB maximum).')
    try {
      data = JSON.parse(input)
    } catch {
      return fail('File is not valid JSON.')
    }
  } else if (Buffer.byteLength(JSON.stringify(input ?? null), 'utf8') > TEMPLATE_IO_MAX_BYTES) {
    return fail('File is too large (500KB maximum).')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('Not an Engage template file.')
  const d = data as Record<string, unknown>
  if (d.format !== TEMPLATE_IO_FORMAT) return fail('Not an Engage template file.')
  if (d.version !== TEMPLATE_IO_VERSION) return fail(`Unsupported template version: ${String(d.version)}.`)
  const kind = SITE_TEMPLATE_KINDS.find((k) => k === d.kind)
  if (!kind) return fail(`Unknown template kind: ${typeof d.kind === 'string' ? d.kind : 'missing'}.`)
  if (!Array.isArray(d.blocks)) return fail('Template has no blocks list.')
  if (d.conditions !== undefined && !Array.isArray(d.conditions)) return fail('Template conditions must be a list.')
  const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim().slice(0, 200) : 'Imported template'
  const priority = typeof d.priority === 'number' && Number.isFinite(d.priority) && d.priority >= 0 ? d.priority : 10

  const blocks = (clean(parseColumns([{ blocks: d.blocks }])[0]?.blocks ?? []) as SectionNode[])
  const unknown = new Set<string>()
  const wrapper: SectionColumn[] = [{ blocks }]
  walkNodes(wrapper, (node) => {
    if (node.blockType === 'element') {
      const type = typeof node.elementType === 'string' ? node.elementType : ''
      if (!type || !getElementDef(type)) unknown.add(type || '(missing)')
    }
  })
  if (unknown.size) return fail(`Unknown element type${unknown.size > 1 ? 's' : ''}: ${[...unknown].join(', ')}. The file may come from a newer version.`)
  return { ok: true, template: { format: TEMPLATE_IO_FORMAT, version: TEMPLATE_IO_VERSION, kind, title, conditions: clean(d.conditions ?? []) as unknown[], blocks, priority } }
}
