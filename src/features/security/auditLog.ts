import type { SecuritySettings } from './settings'

/**
 * The audit trail: who did what, when, from where.
 *
 * Writes go straight to D1 with bound parameters rather than through the
 * engine, for three reasons. It works from the request middleware, where the
 * engine is not loaded and loading it would cost more than the request it is
 * recording. It cannot recurse - an engine write would fire the very hooks
 * that call this. And it survives the collection below being unregistered,
 * which matters because the log is most valuable in exactly the messy
 * situations where something else is misconfigured.
 *
 * Every function here swallows its own errors. An audit trail that can fail a
 * request is a denial of service with extra steps; a missing entry is bad, a
 * site that will not serve pages because it could not write one is worse. The
 * failure is logged to the console, which is where an operator will look.
 */

export const AUDIT_TABLE = 'eg_audit_log'

export type AuditAction =
  | 'login.success'
  | 'login.failed'
  | 'login.locked'
  | 'logout'
  | 'session.expired'
  | 'create'
  | 'update'
  | 'delete'
  | 'settings.update'
  | 'rate-limit.blocked'
  | 'probe.blocked'
  | 'two-factor.enrolled'
  | 'two-factor.failed'

export type AuditEntry = {
  action: AuditAction
  actorId?: number | string | null
  actorEmail?: string | null
  collectionSlug?: string | null
  documentId?: number | string | null
  ip?: string | null
  userAgent?: string | null
  /** Free text for the one detail that makes the entry worth reading later. */
  detail?: string | null
}

type D1Like = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => { run: () => Promise<unknown>; all: () => Promise<{ results?: unknown[] }> }
    run: () => Promise<unknown>
    all: () => Promise<{ results?: unknown[] }>
  }
}

async function getD1(): Promise<D1Like | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return (context?.env?.D1 as unknown as D1Like) ?? null
  } catch {
    return null
  }
}

/** Keeps one oversized user agent or error message from bloating the table. */
const clip = (value: unknown, max: number): string | null => {
  if (value === null || value === undefined) return null
  const text = String(value)
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export async function recordAuditEvent(entry: AuditEntry, settings: SecuritySettings): Promise<void> {
  if (!settings.featureEnabled || !settings.auditLog.enabled) return

  try {
    const db = await getD1()
    if (!db) return

    const now = new Date().toISOString()

    await db
      .prepare(
        `INSERT INTO \`${AUDIT_TABLE}\`
           (action, actor_id, actor_email, collection_slug, document_id, ip, user_agent, detail, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.action,
        entry.actorId ?? null,
        clip(entry.actorEmail, 255),
        clip(entry.collectionSlug, 64),
        clip(entry.documentId, 64),
        clip(entry.ip, 64),
        clip(entry.userAgent, 255),
        clip(entry.detail, 1000),
        now,
        now,
      )
      .run()
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'Audit entry not written', error: String(error) }))
  }
}

/**
 * Deletes entries past the retention window.
 *
 * Called opportunistically rather than on a schedule - there is no cron here -
 * so it is sampled from the write path (see `maybePruneAuditLog`). That makes
 * pruning proportional to write volume, which is the right shape: a busy site
 * prunes often, an idle one has nothing to prune.
 */
export async function pruneAuditLog(settings: SecuritySettings): Promise<number> {
  if (!settings.featureEnabled || !settings.auditLog.enabled) return 0

  try {
    const db = await getD1()
    if (!db) return 0

    const cutoff = new Date(Date.now() - settings.auditLog.retentionDays * 86_400_000).toISOString()
    await db.prepare(`DELETE FROM \`${AUDIT_TABLE}\` WHERE created_at < ?`).bind(cutoff).run()
    return 1
  } catch (error) {
    console.error(JSON.stringify({ level: 'warn', msg: 'Audit prune failed', error: String(error) }))
    return 0
  }
}

/** One write in every two hundred also prunes. */
const PRUNE_SAMPLE_RATE = 0.005

export async function maybePruneAuditLog(settings: SecuritySettings): Promise<void> {
  if (Math.random() > PRUNE_SAMPLE_RATE) return
  await pruneAuditLog(settings)
}

/** Both together, for the common case at the end of a request. */
export async function audit(entry: AuditEntry, settings: SecuritySettings): Promise<void> {
  await recordAuditEvent(entry, settings)
  await maybePruneAuditLog(settings)
}

/** Pulls the address and agent off a request, in the shape an entry wants. */
export function auditContext(request: Request): Pick<AuditEntry, 'ip' | 'userAgent'> {
  return {
    ip:
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-real-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      null,
    userAgent: request.headers.get('user-agent'),
  }
}
