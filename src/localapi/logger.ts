/**
 * From-scratch reimplementation of the Local API's `.logger` surface - the
 * smallest of the four remaining `@/engine` shims scoped in
 * payload-removal-plan.md's "Full-removal cutover prerequisites" section
 * (logger/config/collections/db.migrate). Real Payload's `Engine.logger` is a
 * real Pino `Logger` instance (`payload/dist/utilities/logger.d.ts`:
 * `export type PayloadLogger = Logger` from the `pino` package, confirmed by
 * reading that file directly) - a large, general-purpose structured logger
 * with `trace`/`debug`/`info`/`warn`/`error`/`fatal`/`silent` levels, child
 * loggers, and a printf-style extra-args overload on every level method.
 *
 * This app uses exactly three of those levels, in exactly two call shapes -
 * grepped every one of the 37 real `.logger.` call sites in `src/` directly
 * (`.info`/`.warn`/`.error` only, never `.debug`/`.trace`/`.fatal`/`.silent`/
 * `.child`, and never with a third "extra format args" argument): a plain
 * string message (`engine.logger.info('...')`), or Pino's own
 * "mergingObject, message" convention (`engine.logger.error({ err, form:
 * form.id }, 'A form entry could not be stored')`). `EngineLogger`/`LogFn`
 * below are hand-rolled to match exactly that real, narrower surface - not
 * Pino's full generic `LogFn` (whose `ParseLogFnArgs<TMsg>` printf-argument
 * machinery this app never exercises) - per this directory's one hard rule of
 * never importing from the `payload` package (and, by the same reasoning
 * applied to `signJWT`/`verifyJWT` in `auth.ts`, not pulling in `pino` either
 * just to describe a shape this app already reimplemented by hand).
 *
 * This app ALREADY has its own from-scratch logger, `cloudflareLogger`
 * (`src/engage.config.ts`) - built because Pino's default transport
 * (`pino-pretty`) needs Node APIs Cloudflare Workers doesn't have (`fs.write
 * is not implemented` - see that file's own comment and the README's "Known
 * constraints" section). It is currently typed `as any` with its own comment
 * saying "Swap to the engine's logger type once it is exported" - this
 * module's `EngineLogger` is that type. `cloudflareLogger`'s existing
 * `createLog` implementation is reproduced below as `jsonLogFn` byte-for-byte
 * (same JSON-line shape, same `msg ?? (objOrMsg as { msg?: string }).msg`
 * fallback), proven identical by `tests/int/localapi-logger.int.spec.ts`'s
 * own parity tests importing the real, exported `cloudflareLogger` directly
 * and comparing outputs line for line - not just asserting this module's
 * behavior in isolation.
 *
 * `consoleLogger` below is the piece that does NOT exist anywhere in this app
 * yet: `engage.config.ts` currently passes `logger: isProduction ?
 * cloudflareLogger : undefined` (`engage.config.ts:1111`), relying on real
 * Payload's own internal default (a real Pino instance with pino-pretty) for
 * local dev when that `undefined` is handed to `getPayload()`. Once `payload`
 * is gone there is no default left to fall back to, so a real `@/engine`
 * cutover needs SOME logger for dev too. `consoleLogger` fills that gap with
 * the exact same plain JSON-line format `cloudflareLogger` already uses in
 * production - deliberately NOT attempting to reproduce `pino-pretty`'s
 * colorized, human-formatted dev console output, since that would mean
 * either a new dependency or a hand-rolled pretty-printer, and dev-only log
 * *formatting* (as opposed to whether logging happens and land-transmits
 * strings) is not a correctness concern this removal project's parity bar
 * covers.
 */

/**
 * Matches every real call shape this app's 37 `.logger.` call sites actually
 * use: a plain string message, or Pino's "mergingObject, message" convention
 * (an object of extra fields plus an optional message - `msg` is optional
 * because a caller can rely on the object's own `msg` property instead, the
 * same fallback `cloudflareLogger`'s real `createLog` already implements).
 */
export type LogFn = (objOrMsg: string | Record<string, unknown>, msg?: string) => void

/** The narrow slice of real Payload's `Logger` (a Pino instance) this app's Local API surface actually calls. */
export type EngineLogger = {
  info: LogFn
  warn: LogFn
  error: LogFn
}

/**
 * Reproduces `engage.config.ts`'s real, exported `cloudflareLogger`'s own
 * `createLog` helper exactly: a string message is wrapped as `{ level, msg }`;
 * an object message has `level` and `msg` merged in, where `msg` falls back
 * to the object's own `msg` property when the caller didn't pass one
 * explicitly (so `logger.error({ msg: 'already has one' })` still logs a
 * `msg`, matching real Pino's own "an object's own `msg` field is the
 * message when none is given" behavior).
 */
function jsonLogFn(level: string, write: (line: string) => void): LogFn {
  return (objOrMsg, msg) => {
    if (typeof objOrMsg === 'string') {
      write(JSON.stringify({ level, msg: objOrMsg }))
    } else {
      write(JSON.stringify({ level, ...objOrMsg, msg: msg ?? (objOrMsg as { msg?: string }).msg }))
    }
  }
}

/**
 * A minimal, dependency-free `EngineLogger` for local/dev use - see this
 * file's header comment for why it exists and why it doesn't attempt
 * `pino-pretty`-style formatting. Writes to the same `console.log`/
 * `console.warn`/`console.error` methods `cloudflareLogger` writes to, so
 * dev output lands on the same streams a developer already expects.
 */
export const consoleLogger: EngineLogger = {
  info: jsonLogFn('info', (line) => console.log(line)),
  warn: jsonLogFn('warn', (line) => console.warn(line)),
  error: jsonLogFn('error', (line) => console.error(line)),
}
