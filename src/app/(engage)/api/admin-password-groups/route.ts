import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { getDb } from '@/cms/db/connect'
import {
  MAX_GROUP_NAME,
  createPasswordGroup,
  deletePasswordGroup,
  getPasswordGroup,
  listPasswordGroups,
  updatePasswordGroup,
} from '@/cms/db/passwordGroups'
import { hashPassword } from '@/features/visibility/password'

export const dynamic = 'force-dynamic'

const MIN_PASSWORD_LENGTH = 4

/**
 * Shared password groups. Site-wide, so only an administrator may read or change
 * them. Hashes are never returned.
 *
 * GET                       -> { groups: [{ id, name, updatedAt, memberCount }] }
 * POST  { name, password }  -> { id }
 * PUT   { id, name?, password? } -> { ok }
 * DELETE ?id=               -> { ok }   (refused while any item uses the group)
 */

const isAdmin = async (): Promise<boolean> => {
  const context = await getAdminContext()
  return Boolean(context.isAdmin)
}

const unauthorised = () => NextResponse.json({ error: 'unauthorised' }, { status: 401 })

const validName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > MAX_GROUP_NAME) return null
  return trimmed
}

const validPassword = (value: unknown): string | null =>
  typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH ? value : null

const passwordsNeedSecret = (): NextResponse | null =>
  process.env.ENGAGE_SECRET
    ? null
    : NextResponse.json(
        { error: 'Password protection is unavailable: the server is missing ENGAGE_SECRET. Ask your developer to set it.' },
        { status: 503 },
      )

/** Drizzle wraps the D1 error, so the constraint text can sit on the cause. */
const isUniqueViolation = (error: unknown): boolean => {
  let current: unknown = error
  for (let depth = 0; current && depth < 5; depth += 1) {
    const message = current instanceof Error ? current.message : String(current)
    if (/UNIQUE constraint failed/i.test(message)) return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) return unauthorised()
  try {
    const db = await getDb()
    return NextResponse.json({ groups: await listPasswordGroups(db) }, { status: 200 })
  } catch (error) {
    console.error('admin-password-groups GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!(await isAdmin())) return unauthorised()
  let body: { name?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const name = validName(body.name)
  if (!name) return NextResponse.json({ error: `Group name is required (max ${MAX_GROUP_NAME} characters)` }, { status: 400 })
  const password = validPassword(body.password)
  if (!password) return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
  const unavailable = passwordsNeedSecret()
  if (unavailable) return unavailable

  try {
    const db = await getDb()
    const id = await createPasswordGroup(db, name, await hashPassword(password))
    return NextResponse.json({ id }, { status: 200 })
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: 'A group with that name already exists' }, { status: 409 })
    console.error('admin-password-groups POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: Request): Promise<Response> {
  if (!(await isAdmin())) return unauthorised()
  let body: { id?: unknown; name?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const id = typeof body.id === 'number' && Number.isInteger(body.id) && body.id > 0 ? body.id : null
  if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const changes: { name?: string; hash?: string } = {}
  if (body.name !== undefined) {
    const name = validName(body.name)
    if (!name) return NextResponse.json({ error: `Group name is required (max ${MAX_GROUP_NAME} characters)` }, { status: 400 })
    changes.name = name
  }
  if (body.password !== undefined) {
    const password = validPassword(body.password)
    if (!password) return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` }, { status: 400 })
    const unavailable = passwordsNeedSecret()
    if (unavailable) return unavailable
    changes.hash = await hashPassword(password)
  }

  try {
    const db = await getDb()
    if (!(await getPasswordGroup(db, id))) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    await updatePasswordGroup(db, id, changes)
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    if (isUniqueViolation(error)) return NextResponse.json({ error: 'A group with that name already exists' }, { status: 409 })
    console.error('admin-password-groups PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!(await isAdmin())) return unauthorised()
  const id = Number(new URL(request.url).searchParams.get('id'))
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const db = await getDb()
    const result = await deletePasswordGroup(db, id)
    if (result === 'in-use') {
      return NextResponse.json(
        { error: 'This group still protects items. Give those items their own password, or remove their protection, before deleting it.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error) {
    console.error('admin-password-groups DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
