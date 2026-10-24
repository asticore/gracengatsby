import type { D1Like } from './store'

/**
 * "Visible to members of organisation X": an optional restriction on the
 * protected collections (pages, posts, products, events), kept in its own
 * table so the password feature's files barely change.
 *
 * Semantics. A restricted document is hidden from listings for everyone, like
 * a password-protected one (see excludeProtected.ts), and its page is locked
 * unless the signed-in account is a member of that organisation, whatever
 * their role. The restriction is enforced from the membership rows whether or
 * not customer organisations are switched on, so switching the feature off
 * never exposes content. Every lookup failure locks.
 */

export const ORG_VISIBLE_COLLECTIONS = ['pages', 'posts', 'products', 'events'] as const
export type OrgVisibleCollection = (typeof ORG_VISIBLE_COLLECTIONS)[number]

export const isOrgVisibleCollection = (value: unknown): value is OrgVisibleCollection => typeof value === 'string' && (ORG_VISIBLE_COLLECTIONS as readonly string[]).includes(value)

export async function getOrgVisibility(d1: D1Like, collection: string, docId: number): Promise<string | null> {
  const row = (await d1.prepare('SELECT organization_id FROM `eg_content_org_visibility` WHERE collection = ? AND doc_id = ?').bind(collection, docId).first()) as { organization_id: string } | null
  return row?.organization_id ?? null
}

export async function setOrgVisibility(d1: D1Like, collection: string, docId: number, organizationId: string, at: string): Promise<void> {
  await d1
    .prepare(
      `INSERT INTO \`eg_content_org_visibility\` (collection, doc_id, organization_id, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, doc_id) DO UPDATE SET organization_id = excluded.organization_id, updated_at = excluded.updated_at`,
    )
    .bind(collection, docId, organizationId, at)
    .run()
}

export async function clearOrgVisibility(d1: D1Like, collection: string, docId: number): Promise<void> {
  await d1.prepare('DELETE FROM `eg_content_org_visibility` WHERE collection = ? AND doc_id = ?').bind(collection, docId).run()
}

export async function listOrgRestrictedIds(d1: D1Like, collection: string): Promise<Set<number>> {
  const rows = ((await d1.prepare('SELECT doc_id FROM `eg_content_org_visibility` WHERE collection = ?').bind(collection).all()).results ?? []) as { doc_id: number | string }[]
  return new Set(rows.map((row) => Number(row.doc_id)))
}

/** True when the document has no organisation restriction, or `userId` is a member of the one it names. Throws on a failed lookup; callers lock. */
export async function viewerMayRead(d1: D1Like, collection: string, docId: number, userId: number | null): Promise<boolean> {
  const orgId = await getOrgVisibility(d1, collection, docId)
  if (!orgId) return true
  if (userId === null || !Number.isFinite(userId)) return false
  const member = await d1.prepare('SELECT 1 AS ok FROM `eg_organization_members` WHERE organization_id = ? AND user_id = ? LIMIT 1').bind(orgId, userId).first()
  return Boolean(member)
}

const liveD1 = async (): Promise<D1Like> => {
  const { resolveD1Binding } = await import('@/cms/db/connect')
  return (await resolveD1Binding()) as unknown as D1Like
}

export async function listOrgRestrictedIdsLive(collection: string): Promise<Set<number>> {
  return listOrgRestrictedIds(await liveD1(), collection)
}

/**
 * The page gate's question: is this document locked for the visitor holding this session cookie?
 * The cookie's user is resolved by the engine, never read from the token by hand. Fails closed.
 */
export async function orgGateLocked(collection: string, docId: number, sessionToken: string | undefined): Promise<boolean> {
  try {
    const d1 = await liveD1()
    if (!(await getOrgVisibility(d1, collection, docId))) return false
    if (!sessionToken) return true
    const [{ getEngine }, { SESSION_COOKIE }] = await Promise.all([import('@/lib/engine'), import('@/features/security')])
    const engine = await getEngine()
    const { user } = await engine.auth({ headers: new Headers({ cookie: `${SESSION_COOKIE}=${sessionToken}` }) }).catch((): { user: null } => ({ user: null }))
    const userId = user ? Number((user as { id: number | string }).id) : null
    return !(await viewerMayRead(d1, collection, docId, userId))
  } catch {
    return true
  }
}
