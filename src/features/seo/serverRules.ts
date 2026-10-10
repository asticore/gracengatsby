import { parseBlockedPaths, parseResponseHeaders } from './siteFiles'

/**
 * The two Site files rules the request middleware enforces: extra response
 * headers and blocked paths.
 *
 * Read the same way as the security settings (features/security/settings.ts):
 * a single D1 row, held in isolate memory for a minute, failing open to "no
 * rules". The middleware runs on every request, so this module must not import
 * the engine or anything else heavy. Only the pure parsers are imported.
 */

export type ServerRules = {
  headers: [string, string][]
  blockedPaths: string[]
}

export const EMPTY_SERVER_RULES: ServerRules = { headers: [], blockedPaths: [] }

const CACHE_TTL_MS = 60_000
/** After a failed read, the previous rules are kept and the read is retried this soon. */
const RETRY_MS = 10_000
const SETTINGS_TABLE = 'eg_seo_settings'

let cached: { expiresAt: number; value: ServerRules } | null = null

/** Same binding lookup the security reader uses; absent outside the Worker. */
async function getD1(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const context = await getCloudflareContext({ async: true })
    return context?.env?.D1 ?? null
  } catch {
    return null
  }
}

export async function readServerRules(): Promise<ServerRules> {
  const now = Date.now()
  if (cached && now < cached.expiresAt) return cached.value

  let value: ServerRules
  try {
    const db = await getD1()
    if (db) {
      const row = await db
        .prepare(
          `SELECT site_files_server_response_headers AS headers, site_files_server_blocked_paths AS blocked FROM \`${SETTINGS_TABLE}\` LIMIT 1`,
        )
        .first<{ headers: string | null; blocked: string | null }>()
      value = {
        headers: parseResponseHeaders(row?.headers).headers,
        blockedPaths: parseBlockedPaths(row?.blocked).paths,
      }
    }
  } catch {
    // Fails open: a missing column or a D1 blip must not block the site. The
    // last good rules are kept when there are any, otherwise no rules is the
    // shipped default. The read is retried after RETRY_MS rather than after the
    // full minute, so a bad read does not hold a wrong answer for long.
    const fallback = cached?.value ?? EMPTY_SERVER_RULES
    cached = { expiresAt: now + RETRY_MS, value: fallback }
    return fallback
  }

  cached = { expiresAt: now + CACHE_TTL_MS, value }
  return value
}

/** Drops this isolate's copy. Other isolates pick up a change within a minute. */
export function invalidateServerRulesCache(): void {
  cached = null
}
