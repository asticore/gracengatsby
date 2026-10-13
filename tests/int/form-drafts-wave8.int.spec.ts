// @vitest-environment node
// Save and continue for forms: the pure rules (tokens, hashing, expiry, what may be saved, the link) and the
// HTTP handler, run against an in-memory engine with the email sender replaced.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const sendEmail = vi.fn(async (_args: { to: string; subject: string; text?: string }) => ({ ok: true }))
vi.mock('@/features/email', () => ({ sendEmail: (args: { to: string; subject: string; text?: string }) => sendEmail(args) }))

import {
  DRAFT_TTL_MS,
  MAX_DRAFT_TEXT,
  MAX_DRAFT_JSON_CHARS,
  cleanDraftEmail,
  cleanDraftPage,
  draftExpiry,
  hashDraftToken,
  isDraftExpired,
  isDraftToken,
  newDraftToken,
  parseDraftValues,
  readResumeToken,
  resumeLink,
  sanitiseDraftValues,
  serialiseDraftValues,
} from '@/features/forms/drafts'
import { discardDraftByToken, findDraftByToken } from '@/features/forms/draftStore'
import { handleDraftRequest, type DraftRouteEngine } from '@/features/forms/draftRequest'
import type { FormFieldDef } from '@/features/forms/types'

const FIELDS = [
  { type: 'text', name: 'first', label: 'First name' },
  { type: 'email', name: 'email', label: 'Email' },
  { type: 'file', name: 'cv', label: 'CV' },
  { type: 'signature', name: 'sig', label: 'Signature' },
  { type: 'payment', name: 'pay', label: 'Pay' },
  { type: 'calculation', name: 'total', label: 'Total' },
] as unknown as FormFieldDef[]

describe('drafts: tokens and hashing', () => {
  it('makes a 32 hex character token from the supplied bytes', () => {
    const token = newDraftToken((bytes) => bytes.fill(0xab))
    expect(token).toBe('ab'.repeat(16))
    expect(isDraftToken(token)).toBe(true)
  })

  it('gives different tokens by default', () => {
    expect(newDraftToken()).not.toBe(newDraftToken())
  })

  it('accepts only lower-case 32 hex characters as a token', () => {
    expect(isDraftToken('0'.repeat(32))).toBe(true)
    expect(isDraftToken('A'.repeat(32))).toBe(false)
    expect(isDraftToken('0'.repeat(31))).toBe(false)
    expect(isDraftToken(undefined)).toBe(false)
  })

  it('hashes with SHA-256 (known vector) and never returns the token itself', async () => {
    expect(await hashDraftToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const token = newDraftToken()
    const hash = await hashDraftToken(token)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hash).not.toContain(token)
  })
})

describe('drafts: expiry, email and page', () => {
  it('expires 30 days after the save', () => {
    const now = new Date('2026-10-17T10:00:00.000Z')
    expect(Date.parse(draftExpiry(now)) - now.getTime()).toBe(DRAFT_TTL_MS)
    expect(DRAFT_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  })

  it('treats past, unreadable and missing times as expired', () => {
    const now = new Date('2026-10-17T10:00:00.000Z')
    expect(isDraftExpired('2026-10-16T00:00:00.000Z', now)).toBe(true)
    expect(isDraftExpired('2026-10-18T00:00:00.000Z', now)).toBe(false)
    expect(isDraftExpired('not a date', now)).toBe(true)
    expect(isDraftExpired(undefined, now)).toBe(true)
  })

  it('cleans the address and rejects anything that is not one', () => {
    expect(cleanDraftEmail('  Visitor@Example.COM ')).toBe('visitor@example.com')
    expect(cleanDraftEmail('visitor@example')).toBeNull()
    expect(cleanDraftEmail('two words@example.com')).toBeNull()
    expect(cleanDraftEmail(`${'a'.repeat(250)}@example.com`)).toBeNull()
    expect(cleanDraftEmail(42)).toBeNull()
  })

  it('keeps the page to a whole number from 0 to 99', () => {
    expect(cleanDraftPage(2)).toBe(2)
    expect(cleanDraftPage('3')).toBe(3)
    expect(cleanDraftPage(-1)).toBe(0)
    expect(cleanDraftPage('x')).toBe(0)
    expect(cleanDraftPage(1.5)).toBe(0)
    expect(cleanDraftPage(500)).toBe(99)
  })
})

describe('drafts: what may be saved', () => {
  it('keeps only plain answers for fields the form defines', () => {
    const saved = sanitiseDraftValues(FIELDS, {
      first: 'Ada',
      cv: 'data:application/pdf;base64,AAAA',
      sig: 'data:image/png;base64,AAAA',
      pay: 'card',
      total: 999,
      admin: true,
      price: 0,
    })
    expect(saved).toEqual({ first: 'Ada' })
  })

  it('caps long text, long lists, deep nesting and oversized objects', () => {
    const deep = { a: { b: { c: { d: 'too deep' } } } }
    const list = Array.from({ length: 500 }, (_, index) => index)
    const saved = sanitiseDraftValues(FIELDS, { first: 'x'.repeat(MAX_DRAFT_TEXT + 50), email: list, sig: deep })
    expect((saved.first as string).length).toBe(MAX_DRAFT_TEXT)
    expect((saved.email as number[]).length).toBe(200)
    expect(saved.sig).toBeUndefined()
  })

  it('ignores non-object input and drops values that are not finite numbers', () => {
    expect(sanitiseDraftValues(FIELDS, 'nope')).toEqual({})
    expect(sanitiseDraftValues(FIELDS, [1, 2])).toEqual({})
    expect(sanitiseDraftValues(FIELDS, { first: Number.NaN })).toEqual({})
  })

  it('refuses to store answers over the size limit, and reads back damaged data as empty', () => {
    expect(serialiseDraftValues({ first: 'x'.repeat(MAX_DRAFT_JSON_CHARS) })).toBeNull()
    expect(serialiseDraftValues({ first: 'Ada' })).toBe('{"first":"Ada"}')
    expect(parseDraftValues('{"first":"Ada"}')).toEqual({ first: 'Ada' })
    expect(parseDraftValues('{broken')).toEqual({})
    expect(parseDraftValues('[1]')).toEqual({})
    expect(parseDraftValues(null)).toEqual({})
  })
})

describe('drafts: the resume link', () => {
  const token = 'f'.repeat(32)

  it('returns to the page the form was on, when it is on this site', () => {
    const link = resumeLink({ pageUrl: 'https://site.example/contact?utm=1&resume=old', selfOrigin: 'https://site.example', formAddress: '/embed/forms/x', token })
    expect(link).toBe(`https://site.example/contact?utm=1&resume=${token}`)
  })

  it('falls back to the form embed page for other sites, scripts and junk', () => {
    const fallback = `https://site.example/embed/forms/x?resume=${token}`
    expect(resumeLink({ pageUrl: 'https://evil.example/phish', selfOrigin: 'https://site.example', formAddress: '/embed/forms/x', token })).toBe(fallback)
    expect(resumeLink({ pageUrl: 'javascript:alert(1)', selfOrigin: 'https://site.example', formAddress: '/embed/forms/x', token })).toBe(fallback)
    expect(resumeLink({ pageUrl: 'not a url', selfOrigin: 'https://site.example', formAddress: '/embed/forms/x', token })).toBe(fallback)
    expect(resumeLink({ selfOrigin: 'https://site.example', formAddress: '/embed/forms/x', token })).toBe(fallback)
  })

  it('reads the token from the address bar only when it is well formed', () => {
    expect(readResumeToken(`?resume=${token}`)).toBe(token)
    expect(readResumeToken('?resume=short')).toBeNull()
    expect(readResumeToken('')).toBeNull()
  })
})

// ---- The handler, against an in-memory engine ----

type Row = Record<string, unknown> & { id: number }

function fakeEngine(options: { forms?: boolean; allowSave?: boolean; allowedOrigins?: string[] } = {}) {
  const rows: Row[] = []
  let nextId = 1
  const form = {
    id: 7,
    title: 'Enquiry',
    embedKey: 'enquiry12345',
    formStatus: 'published',
    allowSaveForLater: options.allowSave ?? true,
    formConfig: options.allowedOrigins ? { embed: { allowedOrigins: options.allowedOrigins } } : {},
    fields: FIELDS,
  }
  const matches = (doc: Row, where: Record<string, unknown> | undefined): boolean => {
    if (!where) return true
    if ('and' in where) return (where.and as Record<string, unknown>[]).every((clause) => matches(doc, clause))
    return Object.entries(where).every(([field, condition]) => doc[field] === (condition as { equals: unknown }).equals)
  }
  const engine: DraftRouteEngine = {
    findGlobal: async ({ slug }) => (slug === 'site-settings' ? { features: { forms: options.forms ?? true } } : null),
    findByID: async ({ collection, id }) => (collection === 'forms' && id === form.id ? form : null),
    find: async ({ collection, where }) => {
      if (collection === 'forms') return { docs: [form] }
      return { docs: rows.filter((row) => matches(row, where as Record<string, unknown>)) }
    },
    create: async ({ data }) => {
      const row = { ...(data as Record<string, unknown>), id: nextId++ } as Row
      rows.push(row)
      return row
    },
    delete: async ({ id }) => {
      const index = rows.findIndex((row) => row.id === id)
      if (index >= 0) rows.splice(index, 1)
      return null
    },
  }
  return { engine, rows }
}

const post = (body: unknown, options: { ip?: string; origin?: string } = {}) =>
  new Request('https://site.example/api/form-draft', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'cf-connecting-ip': options.ip ?? '198.51.100.1',
      ...(options.origin ? { origin: options.origin } : {}),
    },
    body: JSON.stringify(body),
  })

const tokenFromEmail = (): string => {
  const text = String(sendEmail.mock.calls.at(-1)?.[0].text ?? '')
  const match = /resume=([0-9a-f]{32})/.exec(text)
  return match ? match[1] : ''
}

beforeEach(() => {
  sendEmail.mockClear()
})

describe('form-draft handler', () => {
  it('saves a draft, stores only the token hash and emails a link back to the page', async () => {
    const { engine, rows } = fakeEngine()
    const response = await handleDraftRequest(
      post({ form: 7, email: 'Visitor@Example.com', data: { first: 'Ada', cv: 'x', admin: true }, page: 1, pageUrl: 'https://site.example/contact' }, { ip: '198.51.100.10' }),
      engine,
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ form: 7, email: 'visitor@example.com', page: 1, dataJson: '{"first":"Ada"}' })
    expect(JSON.stringify(rows[0])).not.toContain('admin')

    const token = tokenFromEmail()
    expect(token).toMatch(/^[0-9a-f]{32}$/)
    expect(sendEmail.mock.calls[0][0].to).toBe('visitor@example.com')
    expect(sendEmail.mock.calls[0][0].text).toContain(`https://site.example/contact?resume=${token}`)
    expect(rows[0].tokenHash).toBe(await hashDraftToken(token))
    expect(rows[0].tokenHash).not.toBe(token)
  })

  it('returns the saved answers for a live token, and refuses a wrong or expired one', async () => {
    const { engine, rows } = fakeEngine()
    await handleDraftRequest(post({ form: 7, email: 'loader@example.com', data: { first: 'Grace' }, page: 2 }, { ip: '198.51.100.11' }), engine)
    const token = tokenFromEmail()

    const loaded = await handleDraftRequest(post({ form: 7, token }, { ip: '198.51.100.11' }), engine)
    expect(await loaded.json()).toEqual({ ok: true, values: { first: 'Grace' }, page: 2 })

    const wrong = await handleDraftRequest(post({ form: 7, token: 'e'.repeat(32) }, { ip: '198.51.100.11' }), engine)
    expect(wrong.status).toBe(404)

    rows[0].expiresAt = '2020-01-01T00:00:00.000Z'
    const expired = await handleDraftRequest(post({ form: 7, token }, { ip: '198.51.100.11' }), engine)
    expect(expired.status).toBe(404)
  })

  it('answers a honeypot fill like a real save, but stores and sends nothing', async () => {
    const { engine, rows } = fakeEngine()
    const response = await handleDraftRequest(post({ form: 7, email: 'bot@example.com', data: {}, eg_company_website: 'spam' }, { ip: '198.51.100.12' }), engine)
    expect(response.status).toBe(200)
    expect(rows).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a bad address with a field error and saves nothing', async () => {
    const { engine, rows } = fakeEngine()
    const response = await handleDraftRequest(post({ form: 7, email: 'not-an-email', data: {} }, { ip: '198.51.100.13' }), engine)
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ errors: { email: expect.any(String) } })
    expect(rows).toHaveLength(0)
  })

  it('does nothing for a form that does not allow saving, or when Forms is off', async () => {
    const noSave = fakeEngine({ allowSave: false })
    expect((await handleDraftRequest(post({ form: 7, email: 'a@example.com', data: {} }, { ip: '198.51.100.14' }), noSave.engine)).status).toBe(404)
    const off = fakeEngine({ forms: false })
    expect((await handleDraftRequest(post({ form: 7, email: 'a@example.com', data: {} }, { ip: '198.51.100.15' }), off.engine)).status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('refuses a request from a website that is not on the form allow-list, including its preflight', async () => {
    const { engine, rows } = fakeEngine({ allowedOrigins: ['https://allowed.example'] })
    const blocked = await handleDraftRequest(post({ form: 7, email: 'a@example.com', data: {} }, { ip: '198.51.100.16', origin: 'https://evil.example' }), engine)
    expect(blocked.status).toBe(403)
    expect(rows).toHaveLength(0)

    const preflight = await handleDraftRequest(
      new Request('https://site.example/api/form-draft?form=7', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }),
      engine,
    )
    expect(preflight.status).toBe(403)

    const allowed = await handleDraftRequest(post({ form: 7, email: 'a@example.com', data: {} }, { ip: '198.51.100.17', origin: 'https://allowed.example' }), engine)
    expect(allowed.status).toBe(200)
  })

  it('removes the draft a finished send came from, so its link stops working', async () => {
    const { engine, rows } = fakeEngine()
    await handleDraftRequest(post({ form: 7, email: 'finish@example.com', data: { first: 'Ada' } }, { ip: '198.51.100.18' }), engine)
    const token = tokenFromEmail()
    expect(await findDraftByToken(engine, 7, token)).not.toBeNull()
    await discardDraftByToken(engine, 7, token)
    expect(rows).toHaveLength(0)
  })

  it('replaces the earlier draft when the same person saves again', async () => {
    const { engine, rows } = fakeEngine()
    await handleDraftRequest(post({ form: 7, email: 'again@example.com', data: { first: 'One' } }, { ip: '198.51.100.19' }), engine)
    const first = tokenFromEmail()
    await handleDraftRequest(post({ form: 7, email: 'again@example.com', data: { first: 'Two' } }, { ip: '198.51.100.19' }), engine)
    expect(rows).toHaveLength(1)
    expect(await findDraftByToken(engine, 7, first)).toBeNull()
  })
})
