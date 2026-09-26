/**
 * From-scratch reimplementation of Payload 3.88.0's Local API AUTH surface -
 * `login`, `resetPassword`, `forgotPassword`, and the `auth({ headers })`
 * token-verification operation - built the same way every other module in
 * this directory is: hand-rolled types mirroring Payload's real shapes, zero
 * `import ... from 'payload'`, and a registry-shaped executor (a `db:
 * AuthDbOps` parameter, exactly like `operations.ts`'s `CollectionDbOps`/
 * `GlobalDbOps` and `read-operations.ts`'s `ReadRegistry`) so this module has
 * no hardcoded dependency on `src/cms/db` and stays testable with a plain
 * in-memory mock (see `tests/int/localapi-auth.int.spec.ts`).
 *
 * Unlike `operations.ts`/`read-operations.ts`, which are written to handle
 * ANY collection a caller wires up, this module is deliberately narrower:
 * this app has exactly ONE collection with `auth` enabled - `users`
 * (`src/collections/Users.ts`, `auth: true` as a bare boolean, confirmed by
 * reading that file directly - no `loginWithUsername`, no `verify`, no
 * `disableLocalStrategy`, no `maxLoginAttempts`/`lockTime`/`tokenExpiration`/
 * `useSessions` overrides) - so every branch real Payload's auth operations
 * have for a DIFFERENT auth configuration (username login, email
 * verification, API keys, a disabled local strategy, per-collection
 * attempt/lock/expiration overrides) is out of scope and not implemented,
 * not silently working "by coincidence". Each such omission is called out
 * below, not left for a future reader to rediscover by diffing against real
 * Payload.
 *
 * This is the most security-sensitive module in the from-scratch Local API
 * (payload-removal-plan.md project doc): it is what stands between a bad
 * password guess and a minted session token. Every citation below was
 * confirmed by reading this repo's actual installed
 * `node_modules/payload@3.88.0/dist/**` source directly, not paraphrased
 * from memory or from Payload's public docs (which do not document several
 * of the behaviors here - the lockout-recheck-after-increment race guard,
 * the `updatedAt: null` session-write suppression, and the asymmetric
 * `login`/`resetPassword` return shapes are all things only the real source
 * reveals).