// @vitest-environment node
import { beforeAll, describe, expect, it } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'


describe('pages: switching the homepage', () => {
  let engine: Engine
  let admin: TypedUser
  const uid = () => Math.random().toString(36).slice(2, 8)

  beforeAll(async () => {
    await ensureMigratedLocalDb()
    engine = createEngine()
    admin = (await engine.create({
      collection: 'users',
      data: { email: `home-admin-${Date.now()}@example.com`, password: 'TestPassword123!', roles: ['admin'] },
      overrideAccess: true,
    })) as unknown as TypedUser
  }, 180_000)

  it('lets an admin make another page the homepage, keeping the old homepage published', async () => {
    const first = (await engine.create({
      collection: 'pages',
      data: { title: 'First home', slug: `first-${uid()}`, isHomepage: true, _status: 'published' },
      overrideAccess: true,
      user: admin,
    })) as unknown as { id: number }

    // Same access as the real admin request: no overrideAccess, the signed-in admin as user.
    const second = (await engine.create({
      collection: 'pages',
      data: { title: 'Second home', slug: `second-${uid()}`, isHomepage: true, _status: 'published' },
      overrideAccess: false,
      user: admin,
    })) as unknown as { id: number }

    const a = (await engine.findByID({ collection: 'pages', id: first.id, overrideAccess: true })) as unknown as {
      isHomepage: boolean
      _status: string
    }
    const b = (await engine.findByID({ collection: 'pages', id: second.id, overrideAccess: true })) as unknown as {
      isHomepage: boolean
    }
    expect(b.isHomepage).toBe(true)
    expect(a.isHomepage).toBe(false)
    expect(a._status).toBe('published')
  }, 120_000)

  it('keeps a draft old homepage a draft', async () => {
    const first = (await engine.create({
      collection: 'pages',
      data: { title: 'Draft home', slug: `draft-${uid()}`, isHomepage: true, _status: 'draft' },
      overrideAccess: true,
      user: admin,
    })) as unknown as { id: number }
    await engine.create({
      collection: 'pages',
      data: { title: 'Next home', slug: `next-${uid()}`, isHomepage: true, _status: 'published' },
      overrideAccess: false,
      user: admin,
    })
    const a = (await engine.findByID({ collection: 'pages', id: first.id, overrideAccess: true })) as unknown as {
      isHomepage: boolean
      _status: string
    }
    expect(a.isHomepage).toBe(false)
    expect(a._status).toBe('draft')
  }, 120_000)
})
