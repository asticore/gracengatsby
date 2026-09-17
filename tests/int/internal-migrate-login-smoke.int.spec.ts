// @vitest-environment node
// wrangler's getPlatformProxy() shells out to its bundled esbuild, which
// breaks under jsdom's separate vm realm (see tests/int/cms-db-faqs.int.spec.ts
// for the full explanation) - this suite is server-only and needs no DOM.
//
// END-TO-END CREATE/LOGIN SMOKE FLOW, AGAINST A THROWAWAY FRESH D1.
//
// Every other fresh-install proof in this directory stops at "the tables
// exist and are writable". This suite goes one step further and proves the
// actual Local API auth flow (`@/localapi/auth`'s `login`) works end to end
// against a database that `setupFreshInstall()` (this route's real deploy
// sequence) just created from nothing: hash a password the same way a real
// signup would, insert a user row directly (nothing in this app creates the
// FIRST user any other way - a real deploy seeds one via `deploy:seed`,
// out of scope here), then call the REAL `login()`/`verifyJWT()` from
// `@/localapi/auth` and confirm a session round-trips through `eg_users`/
// `eg_users_sessions`.
//
// `src/cms/db/collections/users.ts`'s own `findUserAuthRowByID`/
// `updateUserAuthRow`/etc are NOT usable here - they're built via
// `createCollectionOps(...)`, hard-bound to the shared persistent dev D1
// through `getDb()`/`getCloudflareContext()`, with no way to redirect to an
// arbitrary D1 binding per call (same constraint already established for
// `createEngine()`/`getEngine()` elsewhere in this project). So this suite
// hand-builds a minimal `AuthDbOps` directly against `rawDb` with plain SQL -
// the smallest possible adapter satisfying `@/localapi/auth`'s own contract -
// rather than reimplementing anything `login()` itself is responsible for.
import { describe, expect, it } from 'vitest'
import { getPlatformProxy } from 'wrangler'

import type { AuthDbOps, AuthSession, AuthUserRow } from '@/localapi/auth'
import { hashPassword, login, verifyJWT } from '@/localapi/auth'

import { setupFreshInstall } from './helpers/freshInstall'

type UsersRow = {
  id: number
  email: string
  salt: string | null
  hash: string | null
  login_attempts: number | null
  lock_until: string | null
  reset_password_token: string | null
  reset_password_expiration: string | null
  updated_at: string
  created_at: string
}

type SessionRow = { id: string; created_at: string; expires_at: string }

// The tiny hand-rolled adapter `@/localapi/auth`'s `AuthDbOps` contract asks
// for - see that type's own doc comments in src/localapi/auth.ts for exactly
// what each method must do. Column names match `eg_users`/`eg_users_sessions`
// as created by `src/migrations/20250929_111647.ts` (read directly to confirm
// the schema), post-`eg_`-rename.
function makeRawAuthDb(rawDb: D1Database): AuthDbOps {
  const rowToAuthUserRow = async (row: UsersRow): Promise<AuthUserRow> => {
    const sessionsResult = await rawDb
      .prepare(`SELECT id, created_at, expires_at FROM eg_users_sessions WHERE _parent_id = ? ORDER BY _order`)
      .bind(row.id)
      .all()
    const sessions: AuthSession[] = ((sessionsResult.results ?? []) as SessionRow[]).map((s) => ({
      id: s.id,
      createdAt: s.created_at,
      expiresAt: s.expires_at,
    }))

    return {
      id: row.id,
      email: row.email,
      salt: row.salt,
      hash: row.hash,
      loginAttempts: row.login_attempts,
      lockUntil: row.lock_until,
      resetPasswordToken: row.reset_password_token,
      resetPasswordExpiration: row.reset_password_expiration,
      sessions,
      updatedAt: row.updated_at,
      createdAt: row.created_at,
    }
  }

  const findByID = async (id: number): Promise<AuthUserRow | null> => {
    const result = await rawDb.prepare(`SELECT * FROM eg_users WHERE id = ?`).bind(id).all()
    const row = ((result.results ?? []) as UsersRow[])[0]
    return row ? rowToAuthUserRow(row) : null
  }

  return {
    findByEmail: async (email: string): Promise<AuthUserRow | null> => {
      const result = await rawDb.prepare(`SELECT * FROM eg_users WHERE email = ?`).bind(email).all()
      const row = ((result.results ?? []) as UsersRow[])[0]
      return row ? rowToAuthUserRow(row) : null
    },
    findByID,
    findByResetToken: async (token: string): Promise<AuthUserRow | null> => {
      const result = await rawDb
        .prepare(`SELECT * FROM eg_users WHERE reset_password_token = ? AND reset_password_expiration > ?`)
        .bind(token, new Date().toISOString())
        .all()
      const row = ((result.results ?? []) as UsersRow[])[0]
      return row ? rowToAuthUserRow(row) : null
    },
    updateByID: async (id: number, data: Record<string, unknown>): Promise<AuthUserRow | null> => {
      const columnMap: Record<string, string> = {
        email: 'email',
        salt: 'salt',
        hash: 'hash',
        loginAttempts: 'login_attempts',
        lockUntil: 'lock_until',
        resetPasswordToken: 'reset_password_token',
        resetPasswordExpiration: 'reset_password_expiration',
      }

      const setParts: string[] = []
      const values: unknown[] = []
      for (const [key, value] of Object.entries(data)) {
        if (key === 'sessions') continue
        if (key === 'updatedAt') {
          // `mintSession` deliberately passes `updatedAt: null` to suppress
          // the timestamp bump on a session-only write (ground-truth point 6
          // in src/localapi/auth.ts) - only a real, non-null value updates
          // the column.
          if (value === null) continue
          setParts.push('updated_at = ?')
          values.push(value)
          continue
        }
        const column = columnMap[key]
        if (!column) continue
        setParts.push(`${column} = ?`)
        values.push(value)
      }

      if (setParts.length > 0) {
        await rawDb
          .prepare(`UPDATE eg_users SET ${setParts.join(', ')} WHERE id = ?`)
          .bind(...values, id)
          .run()
      }

      if ('sessions' in data) {
        await rawDb.prepare(`DELETE FROM eg_users_sessions WHERE _parent_id = ?`).bind(id).run()
        const sessions = (data.sessions as AuthSession[] | null) ?? []
        for (let index = 0; index < sessions.length; index += 1) {
          const session = sessions[index]
          await rawDb
            .prepare(`INSERT INTO eg_users_sessions (_order, _parent_id, id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
            .bind(index + 1, id, session.id, session.createdAt ?? new Date().toISOString(), session.expiresAt)
            .run()
        }
      }

      return findByID(id)
    },
  }
}

describe('login() - end-to-end create/login smoke flow against a throwaway fresh D1', () => {
  it(
    'creates a user directly on a freshly-migrated D1, then logs in through the real Local API auth flow',
    async () => {
      const proxy = await getPlatformProxy<{ D1: D1Database }>({ persist: false })
      try {
        const rawDb = proxy.env.D1

        const { errorCount } = await setupFreshInstall(rawDb)
        expect(errorCount).toBe(0)

        const email = 'smoke-test@example.com'
        const password = 'correct horse battery staple'
        const { salt, hash } = hashPassword(password)
        const now = new Date().toISOString()

        await rawDb
          .prepare(`INSERT INTO eg_users (email, salt, hash, updated_at, created_at) VALUES (?, ?, ?, ?, ?)`)
          .bind(email, salt, hash, now, now)
          .run()

        const db = makeRawAuthDb(rawDb)
        const secret = 'smoke-test-secret'

        const { user, token, exp } = await login(db, { email, password, secret })

        expect(user.email).toBe(email)
        expect(typeof user.id).toBe('number')
        // The returned doc must never leak the sensitive columns.
        expect(user).not.toHaveProperty('hash')
        expect(user).not.toHaveProperty('salt')
        expect(user).not.toHaveProperty('sessions')

        const claims = verifyJWT(token, secret)
        expect(claims).toBeTruthy()
        expect(claims?.email).toBe(email)
        expect(claims?.id).toBe(user.id)
        expect(claims?.exp).toBe(exp)

        const sessionRows = await rawDb
          .prepare(`SELECT id, expires_at FROM eg_users_sessions WHERE _parent_id = ?`)
          .bind(user.id)
          .all()
        expect(sessionRows.results).toHaveLength(1)
        expect((sessionRows.results?.[0] as { id: string }).id).toBe((claims as { sid?: string })?.sid)

        // A wrong password against the same freshly-created user must fail,
        // not silently succeed - proves the real PBKDF2 verification path
        // (not just a schema/plumbing smoke test).
        await expect(login(db, { email, password: 'definitely wrong', secret })).rejects.toThrow()
      } finally {
        await proxy.dispose()
      }
    },
    60_000,
  )
})
