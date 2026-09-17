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
 *
 * ---------------------------------------------------------------------------
 * How this module is structured
 * ---------------------------------------------------------------------------
 * Four public functions - `login`, `resetPassword`, `forgotPassword`,
 * `verifyAuth` - each a straight-line port of one real Payload operation's
 * real step order for the `users`-only, default-config case. Each takes:
 *   - a `db: AuthDbOps` parameter - the tiny slice of
 *     `src/cms/db/collections/users.ts`'s exports (`findUserAuthRowsPaginated`
 *     wrapped into a by-email lookup, `findUserAuthRowByID`,
 *     `updateUserAuthRow`, plus one lookup the suggested shape for this stage
 *     didn't originally include - see "Deviation from the suggested
 *     `AuthDbOps` shape" below) this module actually calls. A real call site
 *     builds this object once, e.g.
 *     `{ findByEmail: (email) => findUserAuthRowsPaginated({ where: { email:
 *     { equals: email } }, limit: 1 }).then((r) => r.docs[0] ?? null), findByID:
 *     findUserAuthRowByID, updateByID: updateUserAuthRow, findByResetToken:
 *     ... }` - not hardcoded inside this file, so this module has zero
 *     build-time dependency on `src/cms/db` and can be driven entirely by a
 *     mock in tests.
 *   - the real args each real operation takes (`email`/`password`,
 *     `token`/`password`, `email`/`expirationMs`, `headers`), plus `secret`
 *     where a JWT is signed or verified (real Payload gets this from
 *     `req.payload.secret` - this module takes it as a plain argument since
 *     it has no `payload` singleton to read it from).
 *
 * Also exported: the four crypto primitives (`hashPassword`, `verifyPassword`,
 * `signJWT`, `verifyJWT`) as standalone functions, per this stage's brief,
 * since they need direct unit testing independent of the higher-level
 * operations that call them.
 *
 * ---------------------------------------------------------------------------
 * GROUND TRUTH, confirmed by reading real Payload 3.88.0 source directly
 * ---------------------------------------------------------------------------
 *
 * 1. CONFIG VALUES - `maxLoginAttempts = 5`, `lockTime = 600_000` (ms),
 *    `tokenExpiration = 7200` (seconds), `useSessions = true`
 *    (`payload/dist/collections/config/defaults.js:124-129` sets these as the
 *    literal defaults baked into `authDefaults`, and `:138-143`
 *    (`sanitizeCollection`) applies them with `??`, i.e. only when the
 *    collection's own `auth` object doesn't set the key). `Users.auth` is the
 *    bare boolean `true` (confirmed reading `src/collections/Users.ts`
 *    directly), which Payload's own collection sanitizer normalizes to `{}`
 *    before applying these defaults - so EVERY one of these four values is
 *    real Payload's actual default for this app's actual `users` collection
 *    TODAY, not a simplification. They are hardcoded as named constants
 *    below (`MAX_LOGIN_ATTEMPTS`, `LOCK_TIME_MS`, `TOKEN_EXPIRATION_SECONDS`,
 *    `USE_SESSIONS`) rather than read from this app's own
 *    `loginProtectionAuth()` (`src/features/security/loginProtection.ts` or
 *    wherever it lives) - that helper's env-driven numbers feed a completely
 *    different, unrelated session-COOKIE mechanism (checked separately, not
 *    Payload's own `auth` config at all) and have never been wired into
 *    `Users.auth`. A future engineer must NOT "fix" these constants to read
 *    from that helper without first confirming Payload's collection sanitizer
 *    would actually pick them up - doing so today would be a silent BEHAVIOR
 *    CHANGE from what real Payload does in production right now, not a
 *    cleanup.
 *
 * 2. LOGIN'S REAL STEP ORDER (`payload/dist/auth/operations/login.js`,
 *    `loginOperation`, plus its own `checkLoginPermission` at :21-28):
 *      - sanitize email: `unsanitizedEmail.toLowerCase().trim()` (:49) - this
 *        app never enables `loginWithUsername`, so the username branches
 *        (:48, :50-91, :110-143) are dead code for `users` and are not
 *        reimplemented here; only the plain `whereConstraint = emailConstraint`
 *        branch (:139-140) applies.
 *      - find the user by that email (:150-154, `payload.db.findOne`) - this
 *        module takes that lookup as `db.findByEmail`, already normalized by
 *        the caller (see `findByEmail`'s doc comment on `AuthDbOps` below).
 *      - `checkLoginPermission` (:155-159, defined :21-28): throws
 *        `AuthenticationError` if no user was found, else throws
 *        `LockedAuth` if `isUserLocked(new Date(user.lockUntil))` - i.e. a
 *        locked account is rejected BEFORE the password is ever checked.
 *      - `authenticateLocalStrategy` (:162-165, real file:
 *        `auth/strategies/local/authenticate.js`, see point 3 below).
 *      - on a WRONG password (:168-183): `incrementLoginAttempts` (see point
 *        4), then `checkLoginPermission` is called AGAIN using the just-
 *        updated `user.lockUntil` (:176-180) - if the increment just tripped
 *        the lock, this second check is what makes the failing 5th attempt
 *        throw `LockedAuth` instead of a second `AuthenticationError`. Only
 *        THEN does the function throw `AuthenticationError` (:182) - meaning
 *        a wrong password on an attempt that trips the lock throws
 *        `LockedAuth`, not `AuthenticationError`.
 *      - on a CORRECT password (:189 onward): mints a session
 *        (`addSessionToUser`, :222-227, see point 5), THEN resets
 *        `loginAttempts`/`lockUntil` as a SEPARATE write
 *        (`resetLoginAttempts`, :233-240, see point 6), THEN signs the JWT
 *        (`jwtSign`, :254-258, see point 7).
 *      - real Payload also re-fetches `lockUntil`/`loginAttempts` from the DB
 *        immediately before minting the session (:196-216) to catch a lock
 *        that a PARALLEL request's failed attempt applied in the gap between
 *        this request's own password check and session mint. This module
 *        does not reproduce that re-fetch - see "Skipped: cross-request race
 *        guards" below, same reasoning as `incrementLoginAttempts`'s own
 *        skipped race branch (point 4).
 *      - `user.collection = collectionConfig.slug` / `user._strategy =
 *        'local-jwt'` (:160-161, :44) and every `beforeLogin`/`afterLogin`/
 *        `afterRead`-field/`afterRead`-collection hook (:244-304) are real
 *        Payload behavior this app never exercises: `Users` declares no
 *        `beforeLogin`/`afterLogin` hook (grepped `src/collections/Users.ts`),
 *        and the returned user's SHAPE is handled directly by this module's
 *        own `toAuthUserDoc` rather than by running the generic field
 *        traversal - see point 8 below for why.
 *
 * 3. PASSWORD VERIFICATION (`authenticateLocalStrategy`,
 *    `auth/strategies/local/authenticate.js:1-26`): PBKDF2-HMAC-SHA256, 25000
 *    iterations, 512-byte derived key (`crypto.pbkdf2(password, salt, 25000,
 *    512, 'sha256', ...)`, :8), compared via `crypto.timingSafeEqual` against
 *    `Buffer.from(storedHash, 'hex')` - guarded by a length check FIRST
 *    (`hashBuffer.length === storedHashBuffer.length && ...`, :13) because
 *    `timingSafeEqual` throws (not "returns false") on a length mismatch
 *    rather than comparing. `verifyPassword` below reproduces this exact
 *    guard-then-compare shape. Real Payload's own hash GENERATION (for a
 *    brand-new/reset password) is a separate file,
 *    `auth/strategies/local/generatePasswordSaltHash.js:38-41`: a fresh
 *    32-byte random salt (`crypto.randomBytes(32)`, hex-encoded), same PBKDF2
 *    params, hash ALSO hex-encoded for storage (`hashRaw.toString('hex')`,
 *    :41) - `hashPassword` below reproduces this. Both real functions use the
 *    ASYNC, callback-based `crypto.pbkdf2`/promisified wrapper; this module
 *    uses the SYNCHRONOUS `crypto.pbkdf2Sync` instead - a deliberate,
 *    behavior-neutral simplification (bit-identical output for identical
 *    inputs; Node's docs guarantee the sync and async PBKDF2 implementations
 *    share one native binding), not a security-relevant deviation, made
 *    because nothing in this module's own call graph needs the non-blocking
 *    behavior real Payload's request-handling context wants.
 *
 * 4. INCREMENT-LOGIN-ATTEMPTS (`auth/strategies/local/
 *    incrementLoginAttempts.js`, full file read): if `user.lockUntil` is set
 *    but ALREADY EXPIRED (`user.lockUntil && !isUserLocked(...)`, :9), this
 *    failed attempt is treated as a FRESH START: write `{ lockUntil: null,
 *    loginAttempts: 1 }` directly (:11-22), not an increment of the (now
 *    stale) old count. Otherwise (:26-49): `newCount = (user.loginAttempts ??
 *    0) + 1`; if `newCount >= maxLoginAttempts` (5), ALSO set `lockUntil =
 *    new Date(currentTime + lockTime).toISOString()` in the SAME write
 *    (:32-37). `incrementAndCheckLock` below reproduces exactly these two
 *    branches via a single plain-object `db.updateByID` call each - matching
 *    this stage's brief that `updateUserAuthRow` is already a plain
 *    field-overwrite `updateByID`, not an atomic-`{$inc}` endpoint, so there
 *    is no marker shape to reproduce here (that mechanism lives one layer
 *    down, in `src/cms/db/generic.ts`'s `applyAtomicIncrements`, already
 *    tested by `tests/int/localapi-operations.int.spec.ts` and
 *    `tests/int/cms-db-users.int.spec.ts`'s own `{ $inc: 1 }` case).
 *    SKIPPED (real file's own :50-111): the "recheck after a possible
 *    parallel update, and if 99 racing wrong attempts and 1 racing correct
 *    attempt fought over the lock, retroactively purge sessions created in
 *    the last 20 seconds" branch. That entire branch exists to patch over
 *    races BETWEEN CONCURRENT REQUESTS in Payload's own transaction model -
 *    it is not part of the single-request lockout logic this stage's brief
 *    asks for, and reproducing it faithfully would require this module to
 *    know about request concurrency it has no visibility into from a plain
 *    `db: AuthDbOps` parameter. Documented as a real gap, not invented away.
 *
 * 5. RESET-LOGIN-ATTEMPTS (`auth/strategies/local/resetLoginAttempts.js`,
 *    full file): a no-op unless `lockUntil` is currently a string OR
 *    `loginAttempts` is a nonzero number (:2-4) - i.e. it mirrors
 *    `incrementLoginAttempts`'s policy of never writing when there is
 *    nothing to reset. When it does run, it writes `{ lockUntil: null,
 *    loginAttempts: 0 }` (:8-11) as its OWN separate `updateOne`, distinct
 *    from the session-mint write.
 *
 * 6. SESSION MINTING (`auth/sessions.js`): `addSessionToUser` (:14-50)
 *    generates `sid = uuid()` (real Payload uses the `uuid` npm package's
 *    `v4()` - this module uses Node's built-in `crypto.randomUUID()` instead,
 *    which produces an equivalent RFC 4122 v4 UUID string with zero new
 *    dependency, per this directory's established policy), builds `session =
 *    { id: sid, createdAt: now, expiresAt: now + tokenExpiration*1000 }`
 *    (:19-26), PRUNES expired sessions via `removeExpiredSessions` (:4-10,
 *    strict `expiry > now`) before appending the new one (:31-34), then sets
 *    `user.updatedAt = null` (:36) specifically to suppress the normal
 *    timestamp bump on a session-only write, before writing the WHOLE
 *    mutated `user` object back (:37-43, `data: user`) - confirmed as a real,
 *    load-bearing mechanic (not a quirk to "fix") by
 *    `tests/int/cms-db-users.int.spec.ts`'s own session-write test using this
 *    exact `updateUserAuthRow(id, { ...rest, sessions: [...], updatedAt: null
 *    })` pattern against the real DB layer. `revokeSession` (:51-62) removes
 *    a session by id - not called anywhere in this module (nothing here
 *    implements logout), included in this citation only for completeness.
 *
 * 7. JWT SIGNING/CLAIMS (`auth/jwt.js` + `auth/getFieldsToSign.js`): real
 *    Payload signs with the `jose` package's `SignJWT`
 *    (`.setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuedAt(iat)
 *    .setExpirationTime(iat + tokenExpiration).sign(secretKey)`, `jwt.js:2-14`)
 *    over claims built by `getFieldsToSign` (`id`, `collection`, `email`,
 *    and `sid` when sessions are used - `getFieldsToSign.js:115-131`; the
 *    `saveToJWT` field-traversal machinery at :17-114 only matters for
 *    collections with `saveToJWT` fields, and `Users` declares none - grepped
 *    `src/collections/Users.ts`, confirmed). THIS MODULE DOES NOT IMPORT
 *    `jose` - see "Zero-new-dependency JWT" below for the from-scratch HS256
 *    compact-JWS implementation (`signJWT`/`verifyJWT`) that reproduces the
 *    exact wire format instead.
 *
 * 8. THE RETURNED USER SHAPE - real Payload's `sanitizeInternalFields`
 *    (`utilities/sanitizeInternalFields.js`, called at `login.js:166`) does
 *    NOT strip `hash`/`salt`/`sessions`/`resetPasswordToken`/
 *    `resetPasswordExpiration` - it only renames a MongoDB `_id` to `id` and
 *    drops `__v`, neither of which applies to this app's SQL-backed users
 *    table. The actual removal of those sensitive fields from what
 *    `login`/`resetPassword` return happens later, inside the generic
 *    afterRead FIELD traversal (`fields/hooks/afterRead/promise.js`'s
 *    hidden-field stripping, `login.js:277-290`) - those columns are
 *    auto-added by Payload for any `auth: true` collection with `hidden:
 *    true`, and a hidden field is deleted from the doc during afterRead
 *    unless `showHiddenFields` is set. This module does not run that generic
 *    field-traversal machinery (it would need this module to know the full
 *    Users field config, which is exactly the kind of collection-specific
 *    coupling the registry design avoids) - instead, `toAuthUserDoc` below
 *    picks the same narrow, already-established `UserDoc` shape
 *    (`src/cms/db/collections/users.ts`) directly, by field name. Same
 *    OUTCOME (a caller never sees a hash/salt/session/reset-token), different
 *    MECHANISM (an explicit field pick-list here vs. a generic
 *    hidden-field-stripping traversal in real Payload) - documented because a
 *    future reader diffing this file against `login.js` line-by-line would
 *    otherwise wonder where the stripping went.
 *
 * 9. `resetPassword` (`auth/operations/resetPassword.js`, full file):
 *      - explicit PRESENCE check for both `token` and `password` via
 *        `Object.prototype.hasOwnProperty.call` (:16-18) - NOT a truthiness
 *        check (an empty-string password is "present"), throwing a plain
 *        error with the exact message `'Missing required data.'` (matched
 *        verbatim below).
 *      - looks the user up by `resetPasswordToken === token AND
 *        resetPasswordExpiration > now`, both conditions in the SAME query
 *        (:38-51, `greater_than: new Date().toISOString()` alongside
 *        `resetPasswordToken: { equals: data.token }`) - there is no separate
 *        "found but expired" branch; a token that matches but has expired is
 *        indistinguishable from a token that never existed. On no match,
 *        throws with the exact message `'Token is either invalid or has
 *        expired.'` (:53, matched verbatim below as `InvalidResetToken`).
 *      - hashes the new password with the SAME `generatePasswordSaltHash` as
 *        account creation (:56-62, fresh random salt).
 *      - writes `{ salt, hash, resetPasswordExpiration: new
 *        Date().toISOString() }` in ONE update (:61-91) - this EXPIRES the
 *        token immediately (by moving its expiration to "now", so the
 *        `resetPasswordExpiration > now` half of the lookup query above can
 *        never match it again) rather than clearing `resetPasswordToken`
 *        itself, which is deliberately left on the row untouched. This first
 *        write also naturally bumps `updatedAt` (real Payload sets it
 *        explicitly at :85; this module's underlying `updateUserAuthRow`
 *        auto-bumps it whenever the caller does NOT pass `updatedAt: null` -
 *        confirmed in `src/cms/db/generic.ts:1140-1143` - so this module
 *        does not need to set it by hand).
 *      - mints a session via the SAME `addSessionToUser` as login's success
 *        path (:101-110) - a SECOND, separate write that sets `sessions` and
 *        `updatedAt: null` (point 6 above), meaning the net effect on
 *        `updatedAt` after BOTH of resetPassword's writes is the
 *        session-write's suppression winning, not the password-write's bump
 *        - a real, if slightly surprising, consequence of real Payload's own
 *        two-separate-`updateOne`-calls design that this module reproduces
 *        faithfully rather than "fixing".
 *      - signs a JWT with the SAME claim shape as login (:96-100, :126-130),
 *        using `user.email` AS STORED ON THE ROW (there is no user-supplied
 *        email in this operation's args, so there is nothing to
 *        lowercase/trim here, unlike login's own `sanitizedEmail`).
 *      - returns `{ token, user }` - note NO `exp` (:161-164) - a confirmed,
 *        real asymmetry with login's `{ exp, token, user }` (:305-309), not
 *        an oversight to "fix" by adding one.
 *      - never touches `loginAttempts`/`lockUntil` (grepped the whole file -
 *        no reference to either identifier anywhere in it) - a password reset
 *        does not clear an existing lock.
 *
 * 10. `forgotPassword` (`auth/operations/forgotPassword.js`, full file):
 *      - looks the user up by email (:46-70); ON NOT FOUND, returns `null`
 *        (:74-77) - a deliberate silent failure (the file's own comment,
 *        :71-73: "We don't want to indicate specifically that an email was
 *        not found... prefer to fail silently") so a caller can't enumerate
 *        registered emails via this endpoint. NOT an error to throw.
 *      - `token = crypto.randomBytes(20).toString('hex')` (:42).
 *      - `resetPasswordExpiration = new Date(Date.now() +
 *        (collectionConfig.auth?.forgotPassword?.expiration ?? expiration ??
 *        3600000)).toISOString()` (:78) - a THREE-WAY precedence chain: a
 *        collection-level override, then the local-API CALLER's own
 *        `expiration` option, then a hardcoded 1-hour fallback. `Users` sets
 *        no collection-level override (grepped `src/collections/Users.ts` -
 *        no `auth.forgotPassword` key at all), so for this app the caller's
 *        own value ALWAYS wins in practice - which is why this module makes
 *        `expirationMs` a REQUIRED argument rather than hardcoding Payload's
 *        1-hour default: this app's one real call site
 *        (`src/features/accounts/emails.ts` / wherever forgotPassword is
 *        invoked from) always supplies its own 30-minute value today, and
 *        silently falling back to Payload's unrelated 1-hour default if a
 *        future caller forgot to pass one would be a real behavior
 *        regression this module should not make easy to introduce by
 *        omission.
 *      - writes `{ resetPasswordToken: token, resetPasswordExpiration }`
 *        (:79-87) and returns the plain token string (:148) - `disableEmail`
 *        (used at :88) is not modeled here at all: this app's real call site
 *        always operates in the equivalent of `disableEmail: true` (it sends
 *        its own email via `src/features/accounts/emails.ts` entirely
 *        separately), so this module never sends email and has no
 *        `disableEmail` parameter to toggle - there being nothing to
 *        disable.
 *
 * 11. TOKEN VERIFICATION - `auth({ headers })`
 *     (`auth/strategies/jwt.js`'s `JWTAuthentication` + `auth/extractJWT.js`):
 *      - `extractJWT` (`extractJWT.js`, full file) tries, IN THIS ORDER
 *        (`payload.config.auth.jwtOrder`, defaulted at
 *        `config/defaults.js:35-39` to exactly `['JWT', 'Bearer', 'cookie']`,
 *        confirmed not overridden anywhere in `src/engage.config.ts` -
 *        grepped): (a) `Authorization: JWT <token>` (:151-158), (b)
 *        `Authorization: Bearer <token>` (:115-122), (c) a cookie named
 *        `${cookiePrefix}-token` (:123-150) - `cookiePrefix` defaults to
 *        `'payload'` (`config/defaults.js:43`, also not overridden - grepped)
 *        so the real cookie name is `payload-token`, matched literally below.
 *      - the cookie extraction method ALSO gates on an `Origin`/CSRF-allowlist
 *        check (:130-149) - SKIPPED here entirely: this app configures
 *        `csrf: []` (the default - `config/defaults.js`'s own `csrf: []`,
 *        confirmed not overridden), and reading the real logic line by line
 *        shows `payload.config.csrf.length === 0` short-circuits BOTH the
 *        "Origin present" branch (:133, `csrf.length === 0 ||
 *        csrf.includes(origin)` - true unconditionally) and the "no Origin"
 *        branch (:139, `if (csrf.length === 0) return cookieToken`) to always
 *        return the cookie token regardless of Origin - i.e. this gate is
 *        confirmed inert for this app's real config today, not assumed away.
 *      - on no token found, `JWTAuthentication` returns `{ user: null }`
 *        (:60-63) - never throws.
 *      - verifies via `jose`'s `jwtVerify(token, secretKey)` (:65) - this
 *        module verifies the equivalent HS256 compact JWS by hand instead
 *        (see "Zero-new-dependency JWT" below), timing-safe, checking `exp`.
 *        ANY failure anywhere in the whole try block - bad signature,
 *        malformed structure, non-JSON payload, `findByID` throwing, an
 *        unverified email, anything - is caught by the OUTER `catch (ignore)`
 *        (:99-110) and returns `{ user: null }`; this is deliberate,
 *        documented real behavior (a strategy's own errors are swallowed and
 *        treated as "did not authenticate", not surfaced), not this module
 *        carelessly hiding a real bug - see `executeAuthStrategies`'s own
 *        try/catch-and-log-as-no-match wrapper one layer up in real Payload,
 *        which this module's own `verifyAuth` mirrors by never throwing.
 *      - on successful verify, looks the user up by `decodedPayload.id`
 *        (:67-71, `payload.findByID`) - not found means `{ user: null }`
 *        (implicit: `user` stays undefined, the `if (user && ...)` at :72
 *        fails, falls to the `else` at :87 which - since `DisableAutologin`
 *        is never set true anywhere in this app, grepped - would attempt
 *        `autoLogin`; see "Skipped: admin auto-login" below for why that
 *        whole branch is irrelevant here and correctly omitted).
 *      - since `Users.auth.useSessions` is always `true` for this app
 *        (point 1), the SESSION-ID branch always applies (:73-81): the
 *        decoded `sid` claim must still be found by `id` in the freshly
 *        fetched user's CURRENT `sessions` array - `!existingSession ||
 *        !decodedPayload.sid` (:75) returns `{ user: null }` for either "no
 *        sid claim at all" or "sid claim present but no longer in the
 *        array" (a revoked or pruned session invalidating an otherwise
 *        cryptographically valid, unexpired JWT) - this is an id-membership
 *        check only, NOT a re-check of that session's own `expiresAt` (that
 *        is a separate concern, already handled by `login`'s own
 *        prune-on-next-login behavior, not re-derived here).
 *      - otherwise returns `{ user }` (:84-86) - PLUS, in real Payload,
 *        `permissions`/`responseHeaders` from the wider `auth` LOCAL API
 *        wrapper (not `JWTAuthentication` itself, which only ever returns
 *        `{ user }` - the wrapper around it in `auth/operations/me.js`-
 *        adjacent code adds those). This module's own `verifyAuth` returns
 *        only `{ user }`, matching `JWTAuthentication`'s OWN real return
 *        shape exactly, and omitting the wrapper-level
 *        `permissions`/`responseHeaders` deliberately: EVERY real call site
 *        in this app (`src/app/(engage)/api/internal-email-test/route.ts`,
 *        `internal-backup-run/route.ts`, `internal-backup-restore/route.ts`,
 *        `internal-backup-list/route.ts`, `src/features/courses/queries.ts`,
 *        `src/features/cleanup/guard.ts`, `src/features/accounts/session.ts`
 *        - all seven grepped directly) destructures ONLY `{ user }` from the
 *        result and never reads `permissions`/`responseHeaders` at all, so
 *        implementing them here would be speculative surface area with zero
 *        real consumer.
 *
 * ---------------------------------------------------------------------------
 * Zero-new-dependency JWT (`signJWT`/`verifyJWT` below)
 * ---------------------------------------------------------------------------
 * Real Payload signs/verifies with the `jose` npm package (point 7/11
 * above). This directory's one hard rule is "no `payload` import", but the
 * spirit of the whole removal effort - confirmed by every prior stage
 * (`validators.ts`, `access.ts`, `hooks.ts`, `operations.ts`,
 * `read-operations.ts`) never adding a new runtime dependency to reproduce
 * something Node's own standard library already does - extends to not
 * pulling in `jose` either just to sign an HS256 JWT. `signJWT`/`verifyJWT`
 * below implement the standard compact JWS format directly with Node's
 * built-in `crypto`: header `{"alg":"HS256","typ":"JWT"}` and the claims
 * object are each JSON-stringified and base64url-encoded, joined with `.`,
 * and HMAC-SHA256'd (`crypto.createHmac('sha256', secret)`) over that joined
 * string; the signature is itself base64url-encoded and appended as a third
 * `.`-joined segment. This is the real, standard JWS compact serialization
 * (RFC 7515) `jose`'s `SignJWT`/`jwtVerify` themselves implement - not a
 * simplified or non-standard format - so a token signed here is byte-for-byte
 * the same shape a `jose`-based verifier would accept, and vice versa; the
 * deviation is purely "which code writes the bytes", not "what the bytes
 * are". `verifyJWT` recomputes the HMAC over the received `header.payload`
 * and compares with `crypto.timingSafeEqual` (guarding a length mismatch
 * first, same reasoning as `verifyPassword` - point 3 above), then checks
 * `exp` against the current time - returning `null` (never throwing) on ANY
 * failure: bad structure (not exactly 3 `.`-separated segments), invalid
 * base64url, a signature that doesn't match, non-JSON or non-object payload
 * JSON, or an expired/missing `exp`.
 *
 * ---------------------------------------------------------------------------
 * Skipped: cross-request race guards
 * ---------------------------------------------------------------------------
 * Real Payload's login/incrementLoginAttempts both re-fetch fresh state from
 * the DB mid-operation specifically to catch another CONCURRENT request
 * having changed `loginAttempts`/`lockUntil`/`sessions` in the gap (point 2's
 * `:196-216` re-fetch-before-session-mint, and point 4's skipped
 * `:50-111` branch). This module does not reproduce either: it operates only
 * on the single `AuthUserRow` snapshot `db.findByEmail`/`db.findByID` handed
 * it at the start of the call, exactly as this stage's own brief directs
 * ("a real DB doesn't need risk-of-races handling in this from-scratch
 * module the way `generic.ts`'s own `applyAtomicIncrements` already does at
 * the layer BELOW auth.ts"). A genuine two-concurrent-request race is a
 * real, if narrow, behavioral gap versus Payload today - documented here
 * rather than silently narrowed, per this whole directory's own standing
 * policy on documented simplifications.
 *
 * ---------------------------------------------------------------------------
 * Skipped: admin auto-login
 * ---------------------------------------------------------------------------
 * `strategies/jwt.js`'s `autoLogin` (its own file, :3-43) logs a request in
 * as `payload.config.admin.autoLogin`'s configured email/username when NO
 * token was found (or verification failed) and auto-login isn't disabled.
 * This app never configures `admin.autoLogin` (grepped `src/engage.config.ts`
 * - no matches), so `autoLogin` is real dead code for this app today and is
 * not reimplemented; `verifyAuth` below simply returns `{ user: null }`
 * wherever real Payload would have called into `autoLogin` and found nothing
 * configured to do.
 *
 * ---------------------------------------------------------------------------
 * Deviation from the suggested `AuthDbOps` shape
 * ---------------------------------------------------------------------------
 * This stage's brief suggested `AuthDbOps` with exactly
 * `findByEmail`/`findByID`/`updateByID`. `resetPassword`'s real lookup key
 * (point 9 above) is neither an email nor an id - it is
 * `resetPasswordToken === token AND resetPasswordExpiration > now`, a
 * fundamentally different query shape `findByEmail`/`findByID` cannot
 * express. `AuthDbOps` below adds one more method, `findByResetToken`, for
 * exactly this lookup - documented here because a design that stuck rigidly
 * to the suggested three methods would have to fake a token+expiry lookup out
 * of `findByEmail`/`findByID`, which is not honest about what real Payload's
 * query is (a single combined condition, point 9), not two.
 *
 * ---------------------------------------------------------------------------
 * Design constraints (same as validators.ts/access.ts/hooks.ts/operations.ts/
 * read-operations.ts)
 * ---------------------------------------------------------------------------
 * No `import ... from 'payload'` anywhere in this file - every type here is
 * hand-rolled. This module is intentionally NOT wired into `@/engine`/
 * `engage.config.ts` yet; it stands alone, exercised only by
 * `tests/int/localapi-auth.int.spec.ts`, so it can be proven correct against
 * real Payload behavior before anything is cut over.
 */

import crypto from 'crypto'

/* -------------------------------------------------------------------------- */
/* Config constants                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload default (`payload/dist/collections/config/defaults.js:126`),
 * confirmed as `Users`' actual, unoverridden value - see ground-truth point 1
 * above. Do NOT read this from `loginProtectionAuth()` or any other
 * env-driven source without first re-confirming Payload's own collection
 * sanitizer would apply it to `Users.auth` - it currently would not, since
 * `Users.auth` is the bare boolean `true`.
 */
export const MAX_LOGIN_ATTEMPTS = 5

/** Real Payload default, milliseconds (`defaults.js:124`). See `MAX_LOGIN_ATTEMPTS`'s doc comment - same provenance and same warning. */
export const LOCK_TIME_MS = 600_000

/** Real Payload default, seconds (`defaults.js:127`). See `MAX_LOGIN_ATTEMPTS`'s doc comment - same provenance and same warning. */
export const TOKEN_EXPIRATION_SECONDS = 7200

/**
 * Real Payload default (`defaults.js:128`). Always `true` for `Users` today -
 * kept as an exported constant (rather than inlined) purely so a reader
 * scanning this file's exports sees all four confirmed-default auth knobs in
 * one place, matching `MAX_LOGIN_ATTEMPTS`/`LOCK_TIME_MS`/
 * `TOKEN_EXPIRATION_SECONDS` above. This module does not behave differently
 * for `useSessions: false` - see the file header, "How this module is
 * structured": session-based auth is baked into `login`/`resetPassword`/
 * `verifyAuth` directly, not gated behind this flag, because there is no real
 * call site in this app that would ever need the alternative.
 */
export const USE_SESSIONS = true

const PBKDF2_ITERATIONS = 25_000
const PBKDF2_KEY_LENGTH = 512
const PBKDF2_DIGEST = 'sha256'

/* -------------------------------------------------------------------------- */
/* Errors                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Stands in for real Payload's `AuthenticationError`
 * (`payload/dist/errors/AuthenticationError.js`) for the same reason
 * `access.ts`'s `Forbidden`/`operations.ts`'s `NotFound`/`ValidationError`
 * stand in for their own real counterparts - no `payload` import, no i18n
 * `t()` lookup (this app never configured a second admin-UI locale, same
 * finding every prior stage made). Thrown for "no such user" (ground-truth
 * point 2, `checkLoginPermission`) and for a plain wrong password that did
 * NOT trip the lock (point 2, `login.js:182`).
 */
export class AuthenticationError extends Error {
  constructor(message = 'The email or password provided is incorrect.') {
    super(message)
    this.name = 'AuthenticationError'
  }
}

/**
 * Stands in for real Payload's `LockedAuth`
 * (`payload/dist/errors/LockedAuth.js`) - same reasoning as
 * `AuthenticationError` above. Thrown when `lockUntil` is already in the
 * future BEFORE a password is even checked (ground-truth point 2,
 * `checkLoginPermission`), and also when a wrong-password attempt is the one
 * that JUST tripped the lock (point 2, `login.js:176-182` - the re-check
 * after `incrementLoginAttempts`).
 */
export class LockedAuth extends Error {
  constructor(message = 'This user is locked due to having too many failed login attempts.') {
    super(message)
    this.name = 'LockedAuth'
  }
}

/**
 * `resetPassword`'s "no such token, or it expired" case. Real Payload throws
 * a generic `APIError('Token is either invalid or has expired.', 403)`
 * here (`resetPassword.js:53`) rather than a token-specific error class -
 * this stage's brief explicitly says a plain, distinguishable message is
 * enough ("this module doesn't need Payload's exact APIError class
 * hierarchy"). This module still gives it its own named class, matching
 * every other error in this directory's own convention of a nameable,
 * `instanceof`-checkable error - but note it is NOT a mirror of any specific
 * real Payload error class the way `AuthenticationError`/`LockedAuth` are;
 * it is this module's own affordance, carrying real Payload's exact message
 * text for parity.
 */
export class InvalidResetToken extends Error {
  constructor(message = 'Token is either invalid or has expired.') {
    super(message)
    this.name = 'InvalidResetToken'
  }
}

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

/** One entry in a user's `sessions` array - mirrors `UserAuthRow['sessions']`'s element shape (`src/cms/db/collections/users.ts`), itself mirroring real Payload's session object (`auth/sessions.js:22-26`). */
export type AuthSession = { id: string; createdAt?: string | null; expiresAt: string }

/**
 * The FULL row this module needs to see for an existing user - every column
 * `login`/`resetPassword`/`forgotPassword`/`verifyAuth` read or write.
 * Structurally narrower than `src/cms/db/collections/users.ts`'s own
 * `UserAuthRow` (which also carries `twoFactorEnabled`/`twoFactorSecret`/
 * `twoFactorConfirmedAt`/`twoFactorLastUsedStep` - two-factor is a separate
 * concern this module's ground truth never mentions, see
 * `src/features/security/twoFactor.ts`), but deliberately NOT an import of
 * it - same "hand-rolled structural mirror, not an alias" contract every
 * sibling module in this directory establishes for its own real-shape types.
 * A real `UserAuthRow` is assignable to this type as-is (it only has MORE
 * fields, all optional or unrelated), which is what lets a real call site
 * wire `findUserAuthRowByID`/`updateUserAuthRow` straight into `AuthDbOps`
 * below with no adapter shim.
 */
export type AuthUserRow = {
  id: number
  email: string
  roles?: string[] | null
  salt?: string | null
  hash?: string | null
  loginAttempts?: number | null
  lockUntil?: string | null
  resetPasswordToken?: string | null
  resetPasswordExpiration?: string | null
  sessions?: AuthSession[] | null
  updatedAt: string
  createdAt: string
}

/**
 * What `login`/`resetPassword`/`verifyAuth` actually RETURN to a caller -
 * every sensitive column stripped. By construction this is exactly
 * `src/cms/db/collections/users.ts`'s own `UserDoc` shape (`id`, `email`,
 * `roles?`, `updatedAt`, `createdAt`) - see ground-truth point 8 for why that
 * is the right shape and how real Payload arrives at the same outcome via a
 * different mechanism.
 */
export type AuthUserDoc = Omit<AuthUserRow, 'salt' | 'hash' | 'loginAttempts' | 'lockUntil' | 'resetPasswordToken' | 'resetPasswordExpiration' | 'sessions'>

/**
 * The tiny slice of `src/cms/db/collections/users.ts`'s exports this module
 * actually calls - the same "generic executor, caller supplies the real
 * collection-specific pieces" shape `operations.ts`'s `CollectionDbOps`/
 * `GlobalDbOps` and `read-operations.ts`'s `ReadRegistry` already establish
 * for writes/reads. See the file header's "Deviation from the suggested
 * `AuthDbOps` shape" for why `findByResetToken` exists alongside the
 * originally-suggested three methods.
 */
export type AuthDbOps = {
  /**
   * Look up a user by exact, already-normalized email match. A real call
   * site wires this to `findUserAuthRowsPaginated({ where: { email: {
   * equals: email } }, limit: 1 }).docs[0] ?? null` - the auth-row
   * equivalent of real Payload's own `payload.db.findOne({ where:
   * emailConstraint })` (ground-truth point 2). This module always passes an
   * already-lowercased/trimmed email in (see `login`/`forgotPassword`
   * below), so an implementation does not need to normalize again, though
   * doing so would be harmless.
   */
  findByEmail: (email: string) => Promise<AuthUserRow | null>
  /** A real call site wires this straight to `findUserAuthRowByID`. Used by `verifyAuth` to re-fetch the current row (and its live `sessions` array) for a decoded JWT's `id` claim. */
  findByID: (id: number) => Promise<AuthUserRow | null>
  /**
   * Look up a user whose `resetPasswordToken` equals `token` AND whose
   * `resetPasswordExpiration` is still in the future - BOTH conditions in
   * one query, exactly matching real Payload's own combined `where`
   * (ground-truth point 9). An implementation that checked these as two
   * separate steps (e.g. find-by-token then check-expiry-in-memory) would
   * observably differ from real Payload only in a vanishingly narrow window,
   * but the combined-query contract is what this type declares so a real
   * implementation has no reason to split it.
   */
  findByResetToken: (token: string) => Promise<AuthUserRow | null>
  /** A real call site wires this straight to `updateUserAuthRow` - a plain field-overwrite `updateByID`, not an atomic-increment endpoint (see ground-truth point 4). */
  updateByID: (id: number, data: Record<string, unknown>) => Promise<AuthUserRow | null>
}

/** Anything with a `.get(name)` method a real `Headers`/`ReadonlyHeaders` (Next.js) satisfies - same "structural, not the real type" philosophy as `access.ts`'s `LocalReq`, so a plain test double (`{ get: (k) => map[k] ?? null }`) works without importing any web-platform lib types. */
export type HeadersLike = { get: (name: string) => string | null | undefined }

export type LoginArgs = { email: string; password: string; secret: string }
export type LoginResult = { user: AuthUserDoc; token: string; exp: number }

export type ResetPasswordArgs = { token: string; password: string; secret: string }
export type ResetPasswordResult = { user: AuthUserDoc; token: string }

export type ForgotPasswordArgs = { email: string; expirationMs: number }

export type VerifyAuthArgs = { headers: HeadersLike; secret: string }
export type VerifyAuthResult = { user: AuthUserDoc | null }

/** The decoded, verified claims a real `sid`-bearing JWT for this app carries - see `getFieldsToSign` in ground-truth point 7. */
export type JWTClaims = { id: number; collection: 'users'; email: string; sid: string; iat: number; exp: number }

export type LogoutArgs = { headers: HeadersLike; secret: string; allSessions?: boolean }
export type LogoutResult = { message: string }

export type RefreshTokenArgs = { headers: HeadersLike; secret: string }
export type RefreshTokenResult = { exp: number; token: string; user: AuthUserDoc; setCookie: true }

export type UnlockArgs = { email: string }

/* -------------------------------------------------------------------------- */
/* Crypto primitives                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Hashes a NEW password for storage - mirrors real Payload's
 * `generatePasswordSaltHash` (`auth/strategies/local/
 * generatePasswordSaltHash.js:38-41`; see ground-truth point 3): a fresh
 * random 32-byte salt, hex-encoded, then PBKDF2-HMAC-SHA256 (25000
 * iterations, 512-byte key), also hex-encoded. Used by `resetPassword`
 * below (real Payload also uses this same function for initial account
 * creation via the `password` field's own `beforeChange` hook - out of
 * scope here, since this module never creates a user, only authenticates
 * and resets an existing one).
 */
export function hashPassword(password: string): { salt: string; hash: string } {
  const salt = crypto.randomBytes(32).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST).toString('hex')
  return { salt, hash }
}

/**
 * Verifies a candidate password against a stored salt+hash - mirrors real
 * Payload's `authenticateLocalStrategy`
 * (`auth/strategies/local/authenticate.js:3-26`; see ground-truth point 3):
 * recompute the PBKDF2 hash with the STORED salt, then timing-safe compare
 * the raw derived-key bytes against the stored hash's bytes (decoded from
 * hex) - guarding a length mismatch BEFORE calling `timingSafeEqual`, since
 * it throws on differing buffer lengths rather than returning `false`. A
 * length mismatch is treated as "does not match", never as a crash.
 */
export function verifyPassword(password: string, salt: string, storedHashHex: string): boolean {
  const candidate = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
  let stored: Buffer
  try {
    stored = Buffer.from(storedHashHex, 'hex')
  } catch {
    return false
  }
  if (candidate.length !== stored.length) return false
  return crypto.timingSafeEqual(candidate, stored)
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, 'base64url')
}

/**
 * Signs an HS256 compact JWS - see the file header's "Zero-new-dependency
 * JWT" for why this is hand-rolled with Node's `crypto` rather than the
 * `jose` package real Payload uses (ground-truth point 7), and why the
 * output is nonetheless a standard, real-`jose`-compatible token, not a
 * simplified format. `claims` should be the payload WITHOUT `iat`/`exp` -
 * this function adds both (`iat = now`, `exp = iat + tokenExpirationSeconds`)
 * the same way real Payload's `jwtSign` does (`auth/jwt.js:4-5`).
 */
export function signJWT(claims: Record<string, unknown>, secret: string, tokenExpirationSeconds: number = TOKEN_EXPIRATION_SECONDS): { token: string; iat: number; exp: number } {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + tokenExpirationSeconds
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = { ...claims, iat, exp }
  const headerB64 = base64UrlEncode(JSON.stringify(header))
  const payloadB64 = base64UrlEncode(JSON.stringify(payload))
  const signingInput = `${headerB64}.${payloadB64}`
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest()
  return { token: `${signingInput}.${base64UrlEncode(signature)}`, iat, exp }
}

/**
 * Verifies an HS256 compact JWS signed by `signJWT` (or any standard-
 * conforming HS256 JWS, including a real `jose`-signed one). Mirrors
 * `JWTAuthentication`'s own "any failure means no match, never throw"
 * contract (ground-truth point 11): malformed structure (not exactly 3
 * `.`-separated segments), invalid base64url, a signature that doesn't
 * timing-safe-match (length-guarded first, same reasoning as
 * `verifyPassword` above), non-JSON or non-object payload, or an
 * expired/missing `exp` claim - ALL return `null`, never throw.
 */
export function verifyJWT(token: string, secret: string): (Record<string, unknown> & { exp?: number }) | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, signatureB64] = parts
    const expectedSignature = crypto.createHmac('sha256', secret).update(`${headerB64}.${payloadB64}`).digest()
    const actualSignature = base64UrlDecode(signatureB64)
    if (expectedSignature.length !== actualSignature.length) return null
    if (!crypto.timingSafeEqual(expectedSignature, actualSignature)) return null

    const payload: unknown = JSON.parse(base64UrlDecode(payloadB64).toString('utf8'))
    if (typeof payload !== 'object' || payload === null) return null

    const claims = payload as Record<string, unknown> & { exp?: number }
    if (typeof claims.exp !== 'number' || claims.exp < Math.floor(Date.now() / 1000)) return null

    return claims
  } catch {
    return null
  }
}

/* -------------------------------------------------------------------------- */
/* Internal helpers                                                            */
/* -------------------------------------------------------------------------- */

/** Mirrors real Payload's `isUserLocked` (`auth/isUserLocked.js:1-6`) exactly: no lock date at all means "not locked"; otherwise locked only while the lock date is still in the future. */
function isLocked(lockUntil: string | null | undefined, now: number): boolean {
  if (!lockUntil) return false
  return new Date(lockUntil).getTime() > now
}

/** Mirrors real Payload's `checkLoginPermission` (`auth/operations/login.js:21-28`): no user found -> `AuthenticationError`; user found but currently locked -> `LockedAuth`. Locked is checked BEFORE any password comparison happens. */
function checkLoginPermission(row: AuthUserRow | null, now: number): asserts row is AuthUserRow {
  if (!row) throw new AuthenticationError()
  if (isLocked(row.lockUntil, now)) throw new LockedAuth()
}

/** Mirrors real Payload's `removeExpiredSessions` (`auth/sessions.js:4-10`): strict `expiresAt > now`, so a session expiring at exactly `now` is dropped, not kept. */
function pruneExpiredSessions(sessions: AuthSession[] | null | undefined, now: number): AuthSession[] {
  return (sessions ?? []).filter((session) => new Date(session.expiresAt).getTime() > now)
}

/** Mirrors real Payload's `resetLoginAttempts` (`auth/strategies/local/resetLoginAttempts.js:2-4`): a no-op unless there's actually something to reset. */
function needsAttemptsReset(row: Pick<AuthUserRow, 'loginAttempts' | 'lockUntil'>): boolean {
  return typeof row.lockUntil === 'string' || (typeof row.loginAttempts === 'number' && row.loginAttempts !== 0)
}

/**
 * Mirrors real Payload's `incrementLoginAttempts` core logic (ground-truth
 * point 4) - the "expired lock restarts the count" branch and the "increment,
 * lock if the new count reaches the max" branch, MINUS the cross-request race
 * guard (see the file header's "Skipped: cross-request race guards").
 * Returns the row as the DB update actually left it, so the caller can
 * re-check the lock against the UPDATED `lockUntil`, not the stale one.
 */
async function incrementAndCheckLock(db: AuthDbOps, row: AuthUserRow, now: number): Promise<AuthUserRow> {
  let updated: AuthUserRow | null
  if (typeof row.lockUntil === 'string' && !isLocked(row.lockUntil, now)) {
    updated = await db.updateByID(row.id, { loginAttempts: 1, lockUntil: null })
  } else {
    const nextAttempts = (row.loginAttempts ?? 0) + 1
    const data: Record<string, unknown> = { loginAttempts: nextAttempts }
    if (nextAttempts >= MAX_LOGIN_ATTEMPTS) {
      data.lockUntil = new Date(now + LOCK_TIME_MS).toISOString()
    }
    updated = await db.updateByID(row.id, data)
  }
  // Mirrors incrementLoginAttempts.js:50-52's own guard - a null return here means the row vanished mid-request, which this module treats the same way real Payload does: a hard failure, not a silent "not locked".
  if (!updated) throw new Error('Failed to update login attempts for user')
  return updated
}

/**
 * Mints a new session for `row` and writes the FULL updated auth row back -
 * mirrors real Payload's `addSessionToUser` (`auth/sessions.js:14-50`, see
 * ground-truth point 6): prune expired sessions, append the new one, and set
 * `updatedAt: null` on this write specifically to suppress the normal
 * timestamp bump (confirmed load-bearing by
 * `tests/int/cms-db-users.int.spec.ts`'s own session-write test using this
 * exact pattern against the real DB layer). Returns the minted `sid` and
 * whatever the DB update actually returned (falling back to a manually
 * merged row if the mock/adapter returns `null`, so callers always get a
 * consistent shape to build the JWT/response from).
 */
async function mintSession(db: AuthDbOps, row: AuthUserRow, now: number): Promise<{ sid: string; row: AuthUserRow }> {
  const sid = crypto.randomUUID()
  const session: AuthSession = { id: sid, createdAt: new Date(now).toISOString(), expiresAt: new Date(now + TOKEN_EXPIRATION_SECONDS * 1000).toISOString() }
  const newSessions = [...pruneExpiredSessions(row.sessions, now), session]

  const { id, createdAt: _createdAt, ...authRowRest } = row
  const updated = await db.updateByID(id, { ...authRowRest, sessions: newSessions, updatedAt: null })

  return { sid, row: updated ?? { ...row, sessions: newSessions } }
}

/** Picks the narrow, sensitive-field-free shape `login`/`resetPassword`/`verifyAuth` return - see ground-truth point 8 for why this is a direct field pick-list rather than a generic hidden-field-stripping traversal. */
export function toAuthUserDoc(row: AuthUserRow): AuthUserDoc {
  const { salt: _salt, hash: _hash, loginAttempts: _loginAttempts, lockUntil: _lockUntil, resetPasswordToken: _resetPasswordToken, resetPasswordExpiration: _resetPasswordExpiration, sessions: _sessions, ...doc } = row
  return doc
}

/* -------------------------------------------------------------------------- */
/* login                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload's `loginOperation` (`auth/operations/login.js`), `users`-only,
 * default-config case - see ground-truth point 2 for the full real step
 * order this reproduces (email sanitize -> find -> lock check -> password
 * check -> [increment+recheck+throw] or [mint session + reset attempts +
 * sign JWT]).
 */
export async function login(db: AuthDbOps, args: LoginArgs): Promise<LoginResult> {
  const now = Date.now()
  const normalizedEmail = args.email.toLowerCase().trim()

  const row = await db.findByEmail(normalizedEmail)
  checkLoginPermission(row, now)

  const passwordOk = typeof row.salt === 'string' && typeof row.hash === 'string' && verifyPassword(args.password, row.salt, row.hash)

  if (!passwordOk) {
    const updated = await incrementAndCheckLock(db, row, now)
    if (isLocked(updated.lockUntil, now)) throw new LockedAuth()
    throw new AuthenticationError()
  }

  const { sid, row: rowAfterSession } = await mintSession(db, row, now)

  let finalRow = rowAfterSession
  if (needsAttemptsReset(row)) {
    const reset = await db.updateByID(row.id, { loginAttempts: 0, lockUntil: null })
    if (reset) finalRow = { ...finalRow, ...reset }
  }

  const { token, exp } = signJWT({ id: row.id, collection: 'users', email: normalizedEmail, sid }, args.secret, TOKEN_EXPIRATION_SECONDS)

  return { user: toAuthUserDoc(finalRow), token, exp }
}

/* -------------------------------------------------------------------------- */
/* resetPassword                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload's `resetPasswordOperation` (`auth/operations/
 * resetPassword.js`) - see ground-truth point 9 for the full real step
 * order this reproduces (presence check -> combined token+expiry lookup ->
 * hash new password -> expire the token -> mint a session -> sign a JWT with
 * NO `exp` in the return).
 */
export async function resetPassword(db: AuthDbOps, args: ResetPasswordArgs): Promise<ResetPasswordResult> {
  if (!Object.prototype.hasOwnProperty.call(args, 'token') || !Object.prototype.hasOwnProperty.call(args, 'password')) {
    throw new Error('Missing required data.')
  }

  const now = Date.now()
  const row = await db.findByResetToken(args.token)
  if (!row) throw new InvalidResetToken()

  const { salt, hash } = hashPassword(args.password)
  const afterPasswordWrite = await db.updateByID(row.id, { salt, hash, resetPasswordExpiration: new Date(now).toISOString() })
  const rowAfterPasswordWrite = afterPasswordWrite ?? { ...row, salt, hash, resetPasswordExpiration: new Date(now).toISOString() }

  const { sid, row: rowAfterSession } = await mintSession(db, rowAfterPasswordWrite, now)

  const { token } = signJWT({ id: row.id, collection: 'users', email: row.email, sid }, args.secret, TOKEN_EXPIRATION_SECONDS)

  return { user: toAuthUserDoc(rowAfterSession), token }
}

/* -------------------------------------------------------------------------- */
/* forgotPassword                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload's `forgotPasswordOperation` (`auth/operations/
 * forgotPassword.js`) - see ground-truth point 10. Returns the plain token
 * string, or `null` for an unknown email (never throws for "not found" - a
 * deliberate silent failure, real Payload's own words: "we don't want to
 * indicate specifically that an email was not found"). Sends no email itself
 * - this app's real caller always operates in the equivalent of
 * `disableEmail: true` and sends its own via `src/features/accounts/
 * emails.ts` separately.
 */
export async function forgotPassword(db: AuthDbOps, args: ForgotPasswordArgs): Promise<string | null> {
  const normalizedEmail = (args.email || '').toLowerCase().trim()
  if (!normalizedEmail) throw new Error('Missing email.')

  const row = await db.findByEmail(normalizedEmail)
  if (!row) return null

  const token = crypto.randomBytes(20).toString('hex')
  const resetPasswordExpiration = new Date(Date.now() + args.expirationMs).toISOString()
  await db.updateByID(row.id, { resetPasswordToken: token, resetPasswordExpiration })

  return token
}

/* -------------------------------------------------------------------------- */
/* verifyAuth                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Extracts a JWT from `headers` in real Payload's default `jwtOrder`
 * (`['JWT', 'Bearer', 'cookie']` - ground-truth point 11): an
 * `Authorization: JWT <token>` header, then `Authorization: Bearer <token>`,
 * then a `payload-token` cookie. Returns `null` if none is present - never
 * throws.
 */
function extractToken(headers: HeadersLike): string | null {
  const authorization = headers.get('Authorization')
  if (authorization?.startsWith('JWT ')) return authorization.slice(4)
  if (authorization?.startsWith('Bearer ')) return authorization.slice(7)
  return extractCookieToken(headers)
}

/**
 * Mirrors real Payload's `parseCookies` (`utilities/parseCookies.js:1-18`)
 * closely enough for this module's one real use (finding `payload-token`):
 * splits on `;`, splits each pair on the FIRST `=` (so a value itself
 * containing `=` survives), and - matching a `Map`'s "last `set()` for a key
 * wins" semantics - the LAST `payload-token` pair in the header wins if the
 * header somehow contains more than one. Skips (rather than throwing on) a
 * pair whose value fails to decode, same as the real function's own
 * try/catch around `decodeURI`. Deliberately does NOT replicate
 * `extractJWT.js`'s Origin/CSRF-allowlist gate on this cookie - see the file
 * header's ground-truth point 11 for why that gate is confirmed inert for
 * this app's real (empty) `csrf` config.
 */
function extractCookieToken(headers: HeadersLike): string | null {
  const raw = headers.get('Cookie')
  if (!raw) return null

  let found: string | null = null
  for (const part of raw.split(';')) {
    const eqIdx = part.indexOf('=')
    const key = (eqIdx === -1 ? part : part.slice(0, eqIdx)).trim()
    if (key !== 'payload-token') continue
    const rawValue = eqIdx === -1 ? '' : part.slice(eqIdx + 1)
    try {
      found = decodeURI(rawValue)
    } catch {
      // Same as parseCookies.js's own try/catch - ignore an undecodable value.
    }
  }
  return found
}

/**
 * Real Payload's `JWTAuthentication` (`auth/strategies/jwt.js`) - see
 * ground-truth point 11 for the full real step order this reproduces
 * (extract -> verify signature+expiry -> look up by id -> confirm `sid` is
 * still a live session -> return the narrow user shape). NEVER throws - any
 * failure anywhere returns `{ user: null }`, matching real Payload's own
 * "a strategy's own errors mean no match" contract.
 */
export async function verifyAuth(db: AuthDbOps, args: VerifyAuthArgs): Promise<VerifyAuthResult> {
  const token = extractToken(args.headers)
  if (!token) return { user: null }

  const decoded = verifyJWT(token, args.secret)
  if (!decoded) return { user: null }

  const id = decoded.id
  if (typeof id !== 'number') return { user: null }

  const row = await db.findByID(id)
  if (!row) return { user: null }

  const sid = decoded.sid
  const sessionStillLive = typeof sid === 'string' && (row.sessions ?? []).some((session) => session.id === sid)
  if (!sessionStillLive) return { user: null }

  return { user: toAuthUserDoc(row) }
}

/* -------------------------------------------------------------------------- */
/* logout                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload's `logoutOperation` (`auth/operations/logout.js`) - removes
 * the session matching the caller's own `sid` claim from the user's
 * `sessions` array (or clears every session when `allSessions` is true),
 * writes it back with `updatedAt: null` (same "don't bump updatedAt for a
 * session-only write" suppression `mintSession`/`refreshToken` use), and
 * returns a success message. This extracts and verifies the token itself
 * (like `verifyAuth`) rather than trusting a caller-supplied user, since the
 * only thing logout needs from the token is its `sid` claim, and
 * re-verifying is cheap and avoids a second, easily-desynced source of truth
 * for "which session is this request". Never throws for "already logged
 * out" - a missing/invalid/expired token is a no-op success, matching the
 * only thing a client actually cares about (it wanted to not be logged in
 * any more, and now isn't).
 */
export async function logout(db: AuthDbOps, args: LogoutArgs): Promise<LogoutResult> {
  const token = extractToken(args.headers)
  if (!token) return { message: 'Logged out successfully.' }

  const decoded = verifyJWT(token, args.secret)
  const id = decoded?.id
  if (typeof id !== 'number') return { message: 'Logged out successfully.' }

  const row = await db.findByID(id)
  if (!row) return { message: 'Logged out successfully.' }

  const sid = decoded?.sid
  const remaining = args.allSessions ? [] : (row.sessions ?? []).filter((session) => session.id !== sid)

  const { id: _id, createdAt: _createdAt, ...rest } = row
  await db.updateByID(id, { ...rest, sessions: remaining, updatedAt: null })

  return { message: 'Logged out successfully.' }
}

/* -------------------------------------------------------------------------- */
/* refreshToken                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload's `refreshOperation` (`auth/operations/refresh.js`) - unlike
 * `login`/`resetPassword`, this does NOT mint a new session: it extends the
 * EXISTING session (matched by the current token's `sid` claim) to a fresh
 * `expiresAt`, prunes any other expired sessions, writes that back with
 * `updatedAt: null`, then signs a brand-new JWT carrying the SAME `sid`.
 * Throws `AuthenticationError` for a missing/invalid token or a `sid` that
 * no longer has a live session (real Payload throws `Forbidden` there - this
 * module reuses its own single authentication-failure error class rather
 * than adding a second one for a distinction no real call site needs to
 * make).
 */
export async function refreshToken(db: AuthDbOps, args: RefreshTokenArgs): Promise<RefreshTokenResult> {
  const token = extractToken(args.headers)
  if (!token) throw new AuthenticationError()

  const decoded = verifyJWT(token, args.secret)
  const id = decoded?.id
  const sid = decoded?.sid
  if (typeof id !== 'number' || typeof sid !== 'string') throw new AuthenticationError()

  const row = await db.findByID(id)
  if (!row) throw new AuthenticationError()

  const now = Date.now()
  const existing = (row.sessions ?? []).find((session) => session.id === sid)
  if (!existing) throw new AuthenticationError()

  const refreshed: AuthSession = { ...existing, expiresAt: new Date(now + TOKEN_EXPIRATION_SECONDS * 1000).toISOString() }
  const newSessions = [...pruneExpiredSessions(row.sessions, now).filter((session) => session.id !== sid), refreshed]

  const { id: _id, createdAt: _createdAt, ...rest } = row
  const updated = await db.updateByID(id, { ...rest, sessions: newSessions, updatedAt: null })
  const finalRow = updated ?? { ...row, sessions: newSessions }

  const { token: newToken, exp } = signJWT({ id, collection: 'users', email: finalRow.email, sid }, args.secret, TOKEN_EXPIRATION_SECONDS)

  return { exp, token: newToken, user: toAuthUserDoc(finalRow), setCookie: true }
}

/* -------------------------------------------------------------------------- */
/* unlock                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Real Payload's `unlockOperation` (`auth/operations/unlock.js`), email-only
 * case (this app has no `loginWithUsername` - see file header). Resets
 * `loginAttempts` to 0 and clears `lockUntil` for the user matched by email.
 * Throws `AuthenticationError` for an unknown email - real Payload throws
 * `Forbidden` there, same "reuse this module's one auth-failure class"
 * reasoning as `refreshToken` above. Returns `true` on success, matching
 * real Payload's own boolean result.
 */
export async function unlockUser(db: AuthDbOps, args: UnlockArgs): Promise<boolean> {
  const normalizedEmail = (args.email || '').toLowerCase().trim()
  if (!normalizedEmail) throw new Error('Missing email.')

  const row = await db.findByEmail(normalizedEmail)
  if (!row) throw new AuthenticationError()

  await db.updateByID(row.id, { loginAttempts: 0, lockUntil: null })
  return true
}
