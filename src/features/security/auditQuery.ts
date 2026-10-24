import { AUDIT_TABLE, AUTH_AUDIT_ACTIONS } from './auditLog'

/**
 * The query behind the admin review screen (/security/audit). Pure: it builds
 * the SQL and its bound values, and the page does the reading. Kept apart so
 * the filters can be tested without a database.
 *
 * Only account-security actions are listed. The table also holds content
 * edits and consent records, which belong to other screens.
 */

export const AUDIT_PAGE_SIZE = 50

export type AuditFilter = {
  /** One of AUTH_AUDIT_ACTIONS, or null for every auth event. */
  action: string | null
  /** An address (substring match) or a numeric account id. */
  user: string | null
  /** 1-based. */
  page: number
}

type SearchParams = Record<string, string | string[] | undefined>

const first = (value: string | string[] | undefined): string => {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' ? raw.trim() : ''
}

export function parseAuditFilter(search: SearchParams): AuditFilter {
  const action = first(search.action)
  const user = first(search.user).slice(0, 255)
  const page = Number.parseInt(first(search.page), 10)
  return {
    action: (AUTH_AUDIT_ACTIONS as readonly string[]).includes(action) ? action : null,
    user: user.length > 0 ? user : null,
    page: Number.isInteger(page) && page > 0 ? Math.min(page, 100_000) : 1,
  }
}

/** Escapes LIKE wildcards so a typed `_` or `%` is searched for literally. */
const likeEscape = (value: string): string => value.replace(/[\\%_]/g, (match) => `\\${match}`)

export type AuditSelect = { sql: string; binds: unknown[] }

/**
 * Newest first, with one extra row fetched so the caller knows whether a next
 * page exists without a count query.
 */
export function buildAuditSelect(filter: AuditFilter, pageSize = AUDIT_PAGE_SIZE): AuditSelect {
  const where: string[] = [`action IN (${AUTH_AUDIT_ACTIONS.map(() => '?').join(', ')})`]
  const binds: unknown[] = [...AUTH_AUDIT_ACTIONS]

  if (filter.action) {
    where.push('action = ?')
    binds.push(filter.action)
  }

  if (filter.user) {
    if (/^\d+$/.test(filter.user)) {
      where.push('(actor_id = ? OR actor_email LIKE ? ESCAPE \'\\\')')
      binds.push(Number(filter.user), `%${likeEscape(filter.user)}%`)
    } else {
      where.push('actor_email LIKE ? ESCAPE \'\\\'')
      binds.push(`%${likeEscape(filter.user)}%`)
    }
  }

  const offset = (Math.max(1, filter.page) - 1) * pageSize
  binds.push(pageSize + 1, offset)

  return {
    sql: `SELECT id, action, actor_id, actor_email, collection_slug, document_id, ip, user_agent, detail, created_at
          FROM \`${AUDIT_TABLE}\`
          WHERE ${where.join(' AND ')}
          ORDER BY created_at DESC, id DESC
          LIMIT ? OFFSET ?`,
    binds,
  }
}

/** Query string for a link to another page, keeping the filters the reader set. */
export function auditPageHref(filter: AuditFilter, page: number): string {
  const params = new URLSearchParams()
  if (filter.action) params.set('action', filter.action)
  if (filter.user) params.set('user', filter.user)
  if (page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `?${query}` : '?'
}
