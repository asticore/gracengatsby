// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { pickForHost, slugClaimsConflict } from '@/features/domains/scope'
import { domainSlugValidate } from '@/features/domains/slugs'

describe('slugClaimsConflict (slug uniqueness per domain)', () => {
  it('two shared documents clash: the slug would be taken everywhere', () => {
    expect(slugClaimsConflict(null, null)).toBe(true)
    expect(slugClaimsConflict('', ',')).toBe(true)
  })

  it('a shared document and a site-specific one do not clash: the site-specific one overrides on its domain', () => {
    expect(slugClaimsConflict(null, ',example.com.au,')).toBe(false)
    expect(slugClaimsConflict(',example.com,', null)).toBe(false)
  })

  it('two site-specific documents on different domains do not clash', () => {
    expect(slugClaimsConflict(',example.com,', ',example.com.au,')).toBe(false)
  })

  it('two site-specific documents clash where their domain lists overlap', () => {
    expect(slugClaimsConflict(',example.com,', ',example.com,example.com.au,')).toBe(true)
    expect(slugClaimsConflict(',example.com,example.com.au,', ',example.com.au,')).toBe(true)
  })
})

describe('pickForHost (the one document a domain serves)', () => {
  const list = (doc: { on: unknown }) => doc.on
  const shared: { name: string; on: string | null } = { name: 'shared', on: null }
  const au: { name: string; on: string | null } = { name: 'au', on: ',example.com.au,' }
  const com: { name: string; on: string | null } = { name: 'com', on: ',example.com,' }

  it('prefers the document scoped to the request domain over the shared one', () => {
    expect(pickForHost([shared, au], 'example.com.au', list)?.name).toBe('au')
    expect(pickForHost([au, shared], 'example.com.au', list)?.name).toBe('au')
  })

  it('falls back to the shared document when nothing is scoped to the domain', () => {
    expect(pickForHost([shared, au], 'example.com', list)?.name).toBe('shared')
  })

  it('never serves a document scoped only to another domain on a registered host', () => {
    expect(pickForHost([au], 'example.com', list)).toBeNull()
    expect(pickForHost([com, au], 'example.co.uk', list)).toBeNull()
  })

  it('narrows nothing on an unregistered host: shared first, then the first document', () => {
    expect(pickForHost([au, shared], null, list)?.name).toBe('shared')
    expect(pickForHost([au], null, list)?.name).toBe('au')
    expect(pickForHost<{ on: unknown }>([], null, list)).toBeNull()
  })
})

describe('domainSlugValidate (posts and products)', () => {
  type Row = { id: number; slug: string; availableDomains: string | null }
  const fakeEngine = (rows: Row[]) => ({
    find: async ({ where }: { where: { and: Array<{ slug?: { equals: string }; id?: { not_equals: number } }> } }) => {
      const slug = where.and.find((c) => c.slug)?.slug?.equals
      const not = where.and.find((c) => c.id)?.id?.not_equals
      return { docs: rows.filter((r) => r.slug === slug && r.id !== not) }
    },
    findByID: async ({ id }: { id: number }) => rows.find((r) => r.id === id) ?? null,
  })

  it('allows the same slug on another domain and refuses one already taken there', async () => {
    const validate = domainSlugValidate('posts', 'post')
    const rows: Row[] = [{ id: 1, slug: 'about', availableDomains: ',example.com,' }]
    const engine = fakeEngine(rows)
    expect(await validate('about', { req: { engine }, data: { availableDomains: ',example.com.au,' } })).toBe(true)
    expect(await validate('about', { req: { engine }, data: { availableDomains: ',example.com,' } })).toMatch(/already exists/)
  })

  it('a shared post still clashes with any other shared post, and an update does not clash with itself', async () => {
    const validate = domainSlugValidate('products', 'product')
    const rows: Row[] = [{ id: 1, slug: 'mug', availableDomains: null }]
    const engine = fakeEngine(rows)
    expect(await validate('mug', { req: { engine }, data: {} })).toMatch(/already exists/)
    expect(await validate('mug', { req: { engine }, data: {}, id: 1 })).toBe(true)
  })

  it('on an update that omits the domain list, the stored list decides', async () => {
    const validate = domainSlugValidate('posts', 'post')
    const rows: Row[] = [
      { id: 1, slug: 'news', availableDomains: ',example.com,' },
      { id: 2, slug: 'news', availableDomains: ',example.com.au,' },
    ]
    const engine = fakeEngine(rows)
    expect(await validate('news', { req: { engine }, data: {}, id: 2 })).toBe(true)
  })
})
