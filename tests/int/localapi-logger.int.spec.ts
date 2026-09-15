// @vitest-environment node
// See tests/int/cms-db-faqs.int.spec.ts for why: server-only suite (jsdom
// breaks wrangler's bundled esbuild), and @/engage.config must be the side
// entering the @/engine <-> @/engage.config circular import.
//
// Proves src/localapi/logger.ts's consoleLogger produces byte-identical JSON
// lines to this app's REAL, already-shipping logger (cloudflareLogger,
// src/engage.config.ts - exported specifically so this file can import it
// directly) for the exact call shapes this app's own 37 real `.logger.` call
// sites use - the "write-both-ways" proof for this stage, same discipline as
// every other localapi module's own *-parity.int.spec.ts, just against this
// app's own hand-rolled logger rather than real Payload (there is nothing of
// Payload's own logger behavior to compare against here: this app already
// replaced Payload's default logger in production with cloudflareLogger, and
// this module's job is to describe/replace THAT, not Payload's pino
// instance).
//
// `cloudflareLogger`'s own `createLog` helper builds each method as
// `createLog(level, console.log)` etc. - it reads `console.log` ONCE, at
// module-evaluation time, and closes over that captured function reference
// forever after. A plain `vi.spyOn(console, 'log')` called from inside a test
// body runs AFTER `@/engage.config` has already evaluated (ordinary ES import
// statements are hoisted above all other module code, `vi.spyOn` calls
// included), so it can never intercept what `cloudflareLogger` actually
// writes to. `vi.hoisted` is the sanctioned escape hatch: Vitest's transform
// moves its callback above the hoisted imports themselves, so swapping
// `console.log`/`warn`/`error` for capturing functions there runs BEFORE
// `@/engage.config` builds `cloudflareLogger`, and `createLog` captures our
// functions instead of Node's real ones.
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const { calls, realConsole } = vi.hoisted(() => {
  const calls = { log: [] as string[], warn: [] as string[], error: [] as string[] }
  const realConsole = { log: console.log, warn: console.warn, error: console.error }
  console.log = (line: string) => { calls.log.push(line) }
  console.warn = (line: string) => { calls.warn.push(line) }
  console.error = (line: string) => { calls.error.push(line) }
  return { calls, realConsole }
})

import '@/engage.config'

import { cloudflareLogger } from '@/engage.config'
import { consoleLogger } from '@/localapi/logger'

function resetCaptures(): void {
  calls.log.length = 0
  calls.warn.length = 0
  calls.error.length = 0
}

describe('localapi/logger - consoleLogger vs the real, shipping cloudflareLogger', () => {
  beforeEach(() => {
    resetCaptures()
  })

  afterAll(() => {
    console.log = realConsole.log
    console.warn = realConsole.warn
    console.error = realConsole.error
  })

  it('a plain string message produces byte-identical JSON on both, for info/warn/error', () => {
    for (const level of ['info', 'warn', 'error'] as const) {
      resetCaptures()
      ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>)[level]('a plain message')
      const realLine = calls[level === 'info' ? 'log' : level][0]

      resetCaptures()
      consoleLogger[level]('a plain message')
      const oursLine = calls[level === 'info' ? 'log' : level][0]

      expect(oursLine).toBe(realLine)
      expect(JSON.parse(oursLine)).toEqual({ level, msg: 'a plain message' })
    }
  })

  it('an (obj, msg) call merges the object and uses the explicit msg on both - matching the real app\'s own form-submit/email call shape', () => {
    ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>).error({ err: 'boom', form: 42 }, 'A form entry could not be stored')
    const realLine = calls.error[0]

    resetCaptures()
    consoleLogger.error({ err: 'boom', form: 42 }, 'A form entry could not be stored')
    const oursLine = calls.error[0]

    expect(oursLine).toBe(realLine)
    expect(JSON.parse(oursLine)).toEqual({ level: 'error', err: 'boom', form: 42, msg: 'A form entry could not be stored' })
  })

  it('an object with its own msg property and no explicit msg argument falls back to that property, identically on both', () => {
    ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>).warn({ reason: 'spam', msg: 'discarded' })
    const realLine = calls.warn[0]

    resetCaptures()
    consoleLogger.warn({ reason: 'spam', msg: 'discarded' })
    const oursLine = calls.warn[0]

    expect(oursLine).toBe(realLine)
    expect(JSON.parse(oursLine)).toEqual({ level: 'warn', reason: 'spam', msg: 'discarded' })
  })

  it('an object with neither an explicit msg nor its own msg property omits msg on both (JSON.stringify drops an undefined value)', () => {
    ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>).info({ some: 'context' })
    const realLine = calls.log[0]

    resetCaptures()
    consoleLogger.info({ some: 'context' })
    const oursLine = calls.log[0]

    expect(oursLine).toBe(realLine)
    expect(JSON.parse(oursLine)).toEqual({ level: 'info', some: 'context' })
  })

  it('writes info/warn/error to console.log/console.warn/console.error respectively, on both', () => {
    ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>).info('x')
    ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>).warn('y')
    ;(cloudflareLogger as Record<string, (...args: unknown[]) => void>).error('z')
    expect(calls.log).toHaveLength(1)
    expect(calls.warn).toHaveLength(1)
    expect(calls.error).toHaveLength(1)

    resetCaptures()
    consoleLogger.info('x')
    consoleLogger.warn('y')
    consoleLogger.error('z')
    expect(calls.log).toHaveLength(1)
    expect(calls.warn).toHaveLength(1)
    expect(calls.error).toHaveLength(1)
  })
})
