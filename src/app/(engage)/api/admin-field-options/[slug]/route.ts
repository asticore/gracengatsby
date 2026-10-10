import { NextResponse } from 'next/server'

import { getAdminContext } from '@/admin/auth'
import { isValidOptionSlug, getOptionValues, saveOptionValues } from '@/features/customFields/options'
import { pruneHiddenValues } from '@/features/customFields/conditions'
import { loadFieldGroups } from '@/features/customFields/server'
import { definitionsFor, definedValueKeys, validateFieldValues } from '@/features/customFields/validate'

export const dynamic = 'force-dynamic'

/** Largest request body accepted for a save, in bytes. */
const MAX_OPTIONS_BODY_BYTES = 100 * 1024
/** Most keys accepted in one save. */
const MAX_OPTIONS_KEYS = 200

/**
 * Options pages: site-wide custom field values (see src/features/customFields/options.ts).
 *
 * GET  /api/admin-field-options/<slug>  -> { values, updatedAt, groups }
 * POST /api/admin-field-options/<slug>  body { values } -> validated, hidden values dropped, saved
 *
 * Read needs admin or field-groups:read; write needs admin or field-groups:update.
 */

type Ctx = { params: Promise<{ slug: string }> }

/** Returns a 403 response when the caller may not do this, or null when they may. */
async function denied(write: boolean): Promise<Response | null> {
  const context = await getAdminContext()
  const allowed = write ? context.isAdmin || context.can('field-groups', 'update') : context.isAdmin || context.can('field-groups', 'read')
  return allowed ? null : NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function GET(_request: Request, { params }: Ctx): Promise<Response> {
  try {
    const refusal = await denied(false)
    if (refusal) return refusal
    const { slug } = await params
    if (!isValidOptionSlug(slug)) return NextResponse.json({ error: 'Invalid options page' }, { status: 400 })

    const [{ values, updatedAt }, groups] = await Promise.all([getOptionValues(slug), loadFieldGroups()])
    const applicable = groups.filter((g) => g.location.some((rules) => rules.some((r) => r.param === 'optionsPage' && r.value === slug)))
    return NextResponse.json({ slug, values, updatedAt, groups: applicable }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-field-options GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: Ctx): Promise<Response> {
  try {
    const refusal = await denied(true)
    if (refusal) return refusal
    const { slug } = await params
    if (!isValidOptionSlug(slug)) return NextResponse.json({ error: 'Invalid options page' }, { status: 400 })

    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_OPTIONS_BODY_BYTES) {
      return NextResponse.json({ error: 'Request is too large' }, { status: 413 })
    }
    const body = (() => {
      try {
        return JSON.parse(raw) as { values?: unknown } | null
      } catch {
        return null
      }
    })()
    const incoming = body?.values && typeof body.values === 'object' && !Array.isArray(body.values) ? (body.values as Record<string, unknown>) : null
    if (!incoming) return NextResponse.json({ error: 'values must be an object' }, { status: 400 })
    if (Object.keys(incoming).length > MAX_OPTIONS_KEYS) {
      return NextResponse.json({ error: `Save at most ${MAX_OPTIONS_KEYS} values at a time` }, { status: 400 })
    }

    const groups = await loadFieldGroups()
    const defs = definitionsFor(groups, { optionsPage: slug })
    // Only keys this options page's groups define are kept. Anything else is ignored, not stored.
    const defined = definedValueKeys(defs)
    const known = Object.fromEntries(Object.entries(incoming).filter(([key]) => defined.has(key)))
    const values = pruneHiddenValues(defs, known)
    const problems = validateFieldValues(defs, values)
    if (problems.length > 0) {
      return NextResponse.json({ error: 'invalid', errors: problems.map((p) => ({ path: p.path, message: p.message })) }, { status: 400 })
    }

    const updatedAt = await saveOptionValues(slug, values)
    return NextResponse.json({ ok: true, updatedAt, values }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('admin-field-options POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}