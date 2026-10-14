import { describe, expect, it } from 'vitest'

import { checkClientReport } from '@/features/errors/clientReport'
import { fingerprintFor, topFrame } from '@/features/errors/fingerprint'
import {
  decideDedupe,
  DEDUPE_WINDOW_MS,
  dedupeCutoff,
  ERROR_LOG_CAP,
  housekeepingDue,
  planTrim,
  resolvedCutoff,
  type TrimCandidate,
} from '@/features/errors/policy'
import { cleanForStorage, clipText, EMAIL_MARKER, REDACTED, scrubText, stripQuery } from '@/features/errors/scrub'

const NOW = Date.parse('2026-10-14T12:00:00.000Z')
const iso = (ms: number): string => new Date(ms).toISOString()

describe('scrubText', () => {
  it('removes query strings from URLs and keeps the path', () => {
    expect(scrubText('Failed at https://shop.example.com/cart?token=abc123&x=1 now')).toBe('Failed at https://shop.example.com/cart now')
    expect(scrubText('see https://a.test/x?email=bob@example.com')).toBe('see https://a.test/x')
  })

  it('replaces e-mail addresses', () => {
    expect(scrubText('Could not send to jane.doe+news@example.org today')).toBe(`Could not send to ${EMAIL_MARKER} today`)
  })

  it('replaces Bearer credentials', () => {
    expect(scrubText('Authorization: Bearer eyJhbGciOi.payload-part~x')).toBe(`Authorization: Bearer ${REDACTED}`)
    expect(scrubText('bearer sk_live_abc')).toBe(`Bearer ${REDACTED}`)
  })

  it('replaces the value of password, token and key pairs', () => {
    expect(scrubText('password=hunter2 other')).toBe(`password=${REDACTED} other`)
    expect(scrubText('{"api_key": "xyz789"}')).toBe(`{"api_key": "${REDACTED}"}`)
    expect(scrubText('token: qwe')).toBe(`token: ${REDACTED}`)
  })

  it('replaces long hex strings', () => {
    const hash = 'a'.repeat(20) + '0123456789abcdef' + '9f'
    expect(scrubText(`hash ${hash} end`)).toBe(`hash ${REDACTED} end`)
  })

  it('replaces long random-looking tokens that mix letters and digits', () => {
    expect(scrubText('key rk_test_4eC39HqLyjWDarjtT1zdp7dc12345 used')).toBe(`key ${REDACTED} used`)
  })

  it('leaves long plain words and short values alone', () => {
    const word = 'SomeVeryLongFunctionNameThatHasNoDigitsAtAllInIt'
    expect(scrubText(`in ${word} at line`)).toBe(`in ${word} at line`)
    expect(scrubText('order 1234 not found')).toBe('order 1234 not found')
  })

  it('handles empty input', () => {
    expect(scrubText('')).toBe('')
    expect(scrubText(null)).toBe('')
    expect(scrubText(undefined)).toBe('')
  })
})

describe('stripQuery', () => {
  it('drops query strings and fragments from a path', () => {
    expect(stripQuery('/shop/tee?utm_source=x')).toBe('/shop/tee')
    expect(stripQuery('/a#top')).toBe('/a')
    expect(stripQuery('/plain')).toBe('/plain')
    expect(stripQuery(null)).toBe('')
  })
})

describe('clipText and cleanForStorage', () => {
  it('cuts long text with an ellipsis', () => {
    expect(clipText('abcdef', 6)).toBe('abcdef')
    expect(clipText('abcdefgh', 6)).toBe('abc...')
    expect(clipText('abcdefgh', 2)).toBe('ab')
  })

  it('scrubs before it cuts, so a secret cut in half is still removed', () => {
    const out = cleanForStorage('password=supersecretvalue', 12)
    expect(out).not.toContain('supersecret')
    expect(out.length).toBeLessThanOrEqual(12)
  })
})

describe('topFrame', () => {
  it('returns the first code frame without line and column numbers', () => {
    const stack = 'TypeError: boom\n    at handler (/app/src/route.ts:42:9)\n    at next (/app/node_modules/x.js:1:1)'
    expect(topFrame(stack, 'boom')).toBe('at handler (/app/src/route.ts)')
  })

  it('returns an empty string when there is no stack', () => {
    expect(topFrame('', 'boom')).toBe('')
    expect(topFrame(null, 'boom')).toBe('')
  })
})

describe('fingerprintFor', () => {
  it('is 16 hex characters', () => {
    expect(fingerprintFor('client', 'Oops')).toMatch(/^[0-9a-f]{16}$/)
  })

  it('is the same for the same source, message and frame', () => {
    const stack = 'Error: x\n    at f (a.ts:1:2)'
    expect(fingerprintFor('client', 'x', stack)).toBe(fingerprintFor('client', 'x', stack))
  })

  it('ignores line numbers in the stack', () => {
    expect(fingerprintFor('client', 'x', 'Error: x\n    at f (a.ts:10:2)')).toBe(fingerprintFor('client', 'x', 'Error: x\n    at f (a.ts:99:7)'))
  })

  it('differs when the source, the message or the frame differs', () => {
    const base = fingerprintFor('client', 'Oops', 'Error: Oops\n    at f (a.ts:1:1)')
    expect(fingerprintFor('form-submit', 'Oops', 'Error: Oops\n    at f (a.ts:1:1)')).not.toBe(base)
    expect(fingerprintFor('client', 'Other', 'Error: Other\n    at f (a.ts:1:1)')).not.toBe(base)
    expect(fingerprintFor('client', 'Oops', 'Error: Oops\n    at g (a.ts:1:1)')).not.toBe(base)
  })
})

describe('decideDedupe', () => {
  it('creates an entry when nothing matches', () => {
    expect(decideDedupe(null, NOW)).toEqual({ action: 'create' })
  })

  it('counts a repeat seen inside the 24-hour window', () => {
    expect(decideDedupe({ id: 7, count: 3, lastSeen: iso(NOW - 60_000) }, NOW)).toEqual({ action: 'increment', id: 7, count: 4 })
  })

  it('counts a repeat exactly at the window edge', () => {
    expect(decideDedupe({ id: 7, count: 1, lastSeen: iso(NOW - DEDUPE_WINDOW_MS) }, NOW).action).toBe('increment')
  })

  it('creates a new entry once the window has passed', () => {
    expect(decideDedupe({ id: 7, count: 9, lastSeen: iso(NOW - DEDUPE_WINDOW_MS - 1) }, NOW)).toEqual({ action: 'create' })
  })

  it('creates a new entry when the last-seen time is unreadable or in the future', () => {
    expect(decideDedupe({ id: 7, count: 1, lastSeen: 'not a date' }, NOW)).toEqual({ action: 'create' })
    expect(decideDedupe({ id: 7, count: 1, lastSeen: iso(NOW + 5_000) }, NOW)).toEqual({ action: 'create' })
  })

  it('treats a missing count as one', () => {
    expect(decideDedupe({ id: 2, count: Number.NaN, lastSeen: iso(NOW) }, NOW)).toEqual({ action: 'increment', id: 2, count: 2 })
  })
})

describe('planTrim', () => {
  const row = (id: number, status: string, minutesAgo: number): TrimCandidate => ({ id, status, lastSeen: iso(NOW - minutesAgo * 60_000) })

  it('removes nothing while the log is at or under the cap', () => {
    expect(planTrim([row(1, 'open', 5)], ERROR_LOG_CAP, ERROR_LOG_CAP)).toEqual([])
    expect(planTrim([], 3, 10)).toEqual([])
  })

  it('removes the excess, oldest first', () => {
    const rows = [row(1, 'open', 1), row(2, 'open', 100), row(3, 'open', 50)]
    expect(planTrim(rows, 13, 10)).toEqual([2, 3, 1])
  })

  it('removes ignored and fixed rows before open ones, even when they are newer', () => {
    const rows = [row(1, 'open', 500), row(2, 'fixed', 5), row(3, 'ignored', 10), row(4, 'open', 900)]
    expect(planTrim(rows, 12, 10)).toEqual([3, 2])
  })

  it('removes open rows only when there are not enough resolved ones', () => {
    const rows = [row(1, 'fixed', 5), row(2, 'open', 900), row(3, 'open', 800)]
    expect(planTrim(rows, 13, 10)).toEqual([1, 2, 3])
  })

  it('removes at most one batch per run', () => {
    const rows = Array.from({ length: 300 }, (_, i) => row(i + 1, 'open', i))
    expect(planTrim(rows, 1500, 1000, 200)).toHaveLength(200)
  })

  it('breaks ties by id so the result is stable', () => {
    const same = iso(NOW)
    const rows: TrimCandidate[] = [
      { id: 9, status: 'fixed', lastSeen: same },
      { id: 4, status: 'fixed', lastSeen: same },
    ]
    expect(planTrim(rows, 11, 10)).toEqual([4])
  })
})

describe('cutoffs and housekeeping timing', () => {
  it('keeps resolved entries for 30 days', () => {
    expect(resolvedCutoff(NOW)).toBe(iso(NOW - 30 * 86_400_000))
  })

  it('counts repeats within the dedupe window', () => {
    expect(dedupeCutoff(NOW)).toBe(iso(NOW - DEDUPE_WINDOW_MS))
  })

  it('runs housekeeping at most every ten minutes', () => {
    expect(housekeepingDue(0, NOW)).toBe(true)
    expect(housekeepingDue(NOW - 9 * 60_000, NOW)).toBe(false)
    expect(housekeepingDue(NOW - 10 * 60_000, NOW)).toBe(true)
  })
})

describe('checkClientReport', () => {
  it('accepts a report with the known fields', () => {
    const result = checkClientReport({ message: 'Boom', digest: 'abc', path: '/shop?x=1' })
    expect(result).toEqual({ ok: true, value: { message: 'Boom', digest: 'abc', stack: undefined, path: '/shop' } })
  })

  it('refuses unknown fields', () => {
    const result = checkClientReport({ message: 'Boom', cookie: 'secret' })
    expect(result.ok).toBe(false)
  })

  it('refuses a missing or blank message', () => {
    expect(checkClientReport({}).ok).toBe(false)
    expect(checkClientReport({ message: '   ' }).ok).toBe(false)
    expect(checkClientReport({ message: 42 }).ok).toBe(false)
  })

  it('refuses non-objects', () => {
    expect(checkClientReport(null).ok).toBe(false)
    expect(checkClientReport('boom').ok).toBe(false)
    expect(checkClientReport(['boom']).ok).toBe(false)
  })

  it('cuts long fields to their limits', () => {
    const result = checkClientReport({ message: 'x'.repeat(5000), stack: 's'.repeat(5000), digest: 'd'.repeat(500) })
    if (!result.ok) throw new Error('expected ok')
    expect(result.value.message).toHaveLength(1000)
    expect(result.value.stack).toHaveLength(1000)
    expect(result.value.digest).toHaveLength(100)
  })
})
