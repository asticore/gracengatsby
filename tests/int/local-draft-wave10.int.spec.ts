// @vitest-environment node
// Local draft recovery for admin edit screens: the pure rules (keys, what may be kept,
// the size cap, reading a stored copy back, staleness, autosave timing).
import { describe, expect, it } from 'vitest'
import {
  AUTOSAVE_MS,
  DRAFT_VERSION,
  MAX_DRAFT_BYTES,
  draftKey,
  isNewerThanServer,
  parseDraft,
  sanitiseDraftValues,
  serialiseDraft,
  shouldAutosave,
} from '@/features/editScreens/localDraft'

const NOW = Date.parse('2026-10-13T10:00:00.000Z')

describe('draftKey', () => {
  it('scopes a key to site, collection and document', () => {
    expect(draftKey('posts', 12, 'https://example.com')).toBe('eg-edit-draft|https://example.com|posts|12')
  })

  it('uses "new" for a document not yet created, and for an explicit "new"', () => {
    expect(draftKey('pages', undefined, 'https://example.com')).toBe('eg-edit-draft|https://example.com|pages|new')
    expect(draftKey('pages', 'new', 'https://example.com')).toBe('eg-edit-draft|https://example.com|pages|new')
  })

  it('ignores a trailing slash on the origin and keeps different sites apart', () => {
    expect(draftKey('events', 3, 'https://a.test/')).toBe(draftKey('events', 3, 'https://a.test'))
    expect(draftKey('events', 3, 'https://a.test')).not.toBe(draftKey('events', 3, 'https://b.test'))
  })
})

describe('sanitiseDraftValues', () => {
  it('drops password-like and secret-like fields at any depth', () => {
    const out = sanitiseDraftValues({
      title: 'Hello',
      password: 'hunter2',
      apiKey: 'abc',
      seo: { metaSecret: 'x', description: 'kept' },
      auth: { resetToken: 'tok', otp: '1234' },
    })
    expect(out).toEqual({ title: 'Hello', seo: { description: 'kept' }, auth: {} })
  })

  it('drops file and blob values and data: URLs', () => {
    const file = new File(['x'], 'cv.pdf', { type: 'application/pdf' })
    const out = sanitiseDraftValues({
      title: 'Kept',
      upload: file,
      blob: new Blob(['y']),
      bytes: new Uint8Array([1, 2]),
      image: 'data:image/png;base64,AAAA',
      url: 'https://example.com/x.png',
    })
    expect(out).toEqual({ title: 'Kept', url: 'https://example.com/x.png' })
  })

  it('drops functions, non-finite numbers and prototype keys', () => {
    const nested = JSON.parse('{"__proto__":{"polluted":true},"a":null}') as Record<string, unknown>
    const out = sanitiseDraftValues({ fn: () => 1, nan: Number.NaN, ok: 2, nested })
    expect(out).toEqual({ ok: 2, nested: { a: null } })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('returns an empty object for a non-object input', () => {
    expect(sanitiseDraftValues(null)).toEqual({})
    expect(sanitiseDraftValues('text')).toEqual({})
    expect(sanitiseDraftValues([1, 2])).toEqual({})
  })
})

describe('serialiseDraft and parseDraft', () => {
  it('round-trips the values with a timestamp and version', () => {
    const json = serialiseDraft({ title: 'Draft', tags: ['a', 'b'] }, NOW)
    expect(json).not.toBeNull()
    const draft = parseDraft(json)
    expect(draft).toEqual({ savedAt: '2026-10-13T10:00:00.000Z', values: { title: 'Draft', tags: ['a', 'b'] }, version: DRAFT_VERSION })
  })

  it('returns null when there is nothing to keep', () => {
    expect(serialiseDraft({}, NOW)).toBeNull()
    expect(serialiseDraft({ password: 'x' }, NOW)).toBeNull()
  })

  it('returns null when the snapshot is over the 500KB cap', () => {
    const big = 'a'.repeat(MAX_DRAFT_BYTES + 10)
    expect(serialiseDraft({ body: big }, NOW)).toBeNull()
  })

  it('keeps a snapshot just under the cap', () => {
    const fits = 'a'.repeat(MAX_DRAFT_BYTES - 2000)
    expect(serialiseDraft({ body: fits }, NOW)).not.toBeNull()
  })

  it('counts multi-byte characters by their UTF-8 size', () => {
    // Each euro sign is 3 bytes, so this is over the cap even though it is short in characters.
    const euros = String.fromCodePoint(0x20ac).repeat(Math.ceil(MAX_DRAFT_BYTES / 3) + 10)
    expect(euros.length).toBeLessThan(MAX_DRAFT_BYTES)
    expect(serialiseDraft({ body: euros }, NOW)).toBeNull()
  })

  it('never returns a password from a hand-edited stored copy', () => {
    const tampered = JSON.stringify({ savedAt: '2026-10-13T10:00:00.000Z', version: DRAFT_VERSION, values: { title: 'T', password: 'leak' } })
    expect(parseDraft(tampered)?.values).toEqual({ title: 'T' })
  })
})

describe('parseDraft corrupt and stale input', () => {
  const valid = JSON.stringify({ savedAt: '2026-10-13T10:00:00.000Z', version: DRAFT_VERSION, values: { title: 'T' } })

  it('reads a missing or empty value as no draft', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft(undefined)).toBeNull()
    expect(parseDraft('')).toBeNull()
  })

  it('reads corrupt JSON as no draft and does not throw', () => {
    expect(() => parseDraft('{"savedAt": "2026-10-13T10:00')).not.toThrow()
    expect(parseDraft('{"savedAt": "2026-10-13T10:00')).toBeNull()
    expect(parseDraft('not json at all')).toBeNull()
  })

  it('rejects a non-object JSON value', () => {
    expect(parseDraft('[1,2,3]')).toBeNull()
    expect(parseDraft('"text"')).toBeNull()
    expect(parseDraft('null')).toBeNull()
  })

  it('rejects another draft version', () => {
    expect(parseDraft(valid.replace(`"version":${DRAFT_VERSION}`, '"version":99'))).toBeNull()
  })

  it('rejects a missing or unreadable savedAt', () => {
    expect(parseDraft(JSON.stringify({ version: DRAFT_VERSION, values: { title: 'T' } }))).toBeNull()
    expect(parseDraft(JSON.stringify({ savedAt: 'not a date', version: DRAFT_VERSION, values: { title: 'T' } }))).toBeNull()
  })

  it('rejects a stored copy with no usable values', () => {
    expect(parseDraft(JSON.stringify({ savedAt: '2026-10-13T10:00:00.000Z', version: DRAFT_VERSION, values: { password: 'x' } }))).toBeNull()
    expect(parseDraft(JSON.stringify({ savedAt: '2026-10-13T10:00:00.000Z', version: DRAFT_VERSION, values: 'nope' }))).toBeNull()
  })

  it('rejects an oversized stored string without parsing it', () => {
    expect(parseDraft('{"x":"' + 'a'.repeat(MAX_DRAFT_BYTES * 2 + 10) + '"}')).toBeNull()
  })
})

describe('isNewerThanServer', () => {
  const draftAt = (iso: string) => ({ savedAt: iso, values: { title: 'T' }, version: DRAFT_VERSION })

  it('is true when the draft was saved after the server copy was last written', () => {
    expect(isNewerThanServer(draftAt('2026-10-13T10:05:00.000Z'), '2026-10-13T10:00:00.000Z')).toBe(true)
  })

  it('is false for a stale draft older than the server copy', () => {
    expect(isNewerThanServer(draftAt('2026-10-13T09:00:00.000Z'), '2026-10-13T10:00:00.000Z')).toBe(false)
  })

  it('is false for a draft saved at exactly the server time', () => {
    expect(isNewerThanServer(draftAt('2026-10-13T10:00:00.000Z'), '2026-10-13T10:00:00.000Z')).toBe(false)
  })

  it('counts any draft when there is no server copy (a new document)', () => {
    expect(isNewerThanServer(draftAt('2026-10-13T09:00:00.000Z'), null)).toBe(true)
    expect(isNewerThanServer(draftAt('2026-10-13T09:00:00.000Z'))).toBe(true)
  })

  it('treats an unreadable server time as a newer draft', () => {
    expect(isNewerThanServer(draftAt('2026-10-13T09:00:00.000Z'), 'garbage')).toBe(true)
  })

  it('is false for an unreadable draft time', () => {
    expect(isNewerThanServer(draftAt('garbage'), '2026-10-13T10:00:00.000Z')).toBe(false)
  })
})

describe('shouldAutosave', () => {
  it('is never due when the form has no changes', () => {
    expect(shouldAutosave(false, null, NOW, AUTOSAVE_MS)).toBe(false)
    expect(shouldAutosave(false, NOW - 60_000, NOW, AUTOSAVE_MS)).toBe(false)
  })

  it('is due straight away for the first change', () => {
    expect(shouldAutosave(true, null, NOW, AUTOSAVE_MS)).toBe(true)
  })

  it('waits for the gap after the last save', () => {
    expect(shouldAutosave(true, NOW - 1000, NOW, AUTOSAVE_MS)).toBe(false)
    expect(shouldAutosave(true, NOW - AUTOSAVE_MS, NOW, AUTOSAVE_MS)).toBe(true)
    expect(shouldAutosave(true, NOW - AUTOSAVE_MS - 1, NOW, AUTOSAVE_MS)).toBe(true)
  })
})
