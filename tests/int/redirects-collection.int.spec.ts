// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ensureMigratedLocalDb } from '../helpers/migratedDb'
import { createEngine, type Engine } from '@/localapi/engine'
import type { TypedUser } from '@/engine'

describe('cms/db - redirects', () => {
  let engine: Engine
  let adminUser: TypedUser

  beforeAll(async () => {
    await ensureMigratedLocalDb()
    engine = createEngine()
    // Create an admin user for operations
    adminUser = (await engine.create({
      collection: 'users',
      data: {
        email: `admin-${Date.now()}@example.com`,
        password: 'TestPassword123!',
      },
      overrideAccess: true,
    })) as unknown as TypedUser
  }, 180_000)

  const createdIds: number[] = []

  // The local D1 can carry rows over from an aborted earlier run, and the chain/loop checks look at
  // every stored redirect, so each test starts from an empty table.
  const purgeAll = async () => {
    const { docs } = await engine.find({ collection: 'redirects', limit: 1000, depth: 0, overrideAccess: true })
    for (const doc of docs as unknown as { id: number }[]) {
      await engine.delete({ collection: 'redirects', id: doc.id, overrideAccess: true }).catch((): undefined => undefined)
    }
  }

  beforeEach(purgeAll)

  afterAll(async () => {
    await purgeAll()
  })

  it('creates a redirect and reads it back', async () => {
    const ours = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/old-page',
        toPath: '/new-page',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number; fromPath: string; toPath: string; redirectType: string; enabled: boolean }
    createdIds.push(ours.id)

    const viaOurs = await engine.findByID({
      collection: 'redirects',
      id: ours.id,
      overrideAccess: true,
    })
    expect((viaOurs as any)?.fromPath).toBe('/old-page')
    expect((viaOurs as any)?.toPath).toBe('/new-page')
    expect((viaOurs as any)?.redirectType).toBe('301')
    expect((viaOurs as any)?.enabled).toBe(true)
  })

  it('creates a redirect with optional fields', async () => {
    const ours = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/legacy-path',
        toPath: 'https://example.com/new',
        redirectType: '302',
        enabled: false,
        note: 'Temporary redirect to external site',
        hitCount: 5,
        lastHit: '2026-10-05T12:00:00.000Z',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(ours.id)

    const viaOurs = await engine.findByID({
      collection: 'redirects',
      id: ours.id,
      overrideAccess: true,
    })
    expect((viaOurs as any)?.fromPath).toBe('/legacy-path')
    expect((viaOurs as any)?.toPath).toBe('https://example.com/new')
    expect((viaOurs as any)?.redirectType).toBe('302')
    expect((viaOurs as any)?.enabled).toBe(false)
    expect((viaOurs as any)?.note).toBe('Temporary redirect to external site')
    expect((viaOurs as any)?.hitCount).toBe(5)
    expect((viaOurs as any)?.lastHit).toBe('2026-10-05T12:00:00.000Z')
  })

  it('updates a redirect', async () => {
    const ours = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/outdated-path',
        toPath: '/updated-path',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(ours.id)

    const updated = await engine.update({
      collection: 'redirects',
      id: ours.id,
      data: {
        toPath: '/completely-new-path',
        redirectType: '307',
        note: 'Updated the redirect target',
      },
      overrideAccess: true,
    })
    expect((updated as any)?.toPath).toBe('/completely-new-path')
    expect((updated as any)?.redirectType).toBe('307')
    expect((updated as any)?.note).toBe('Updated the redirect target')
    expect((updated as any)?.fromPath).toBe('/outdated-path')

    const viaOurs = await engine.findByID({
      collection: 'redirects',
      id: ours.id,
      overrideAccess: true,
    })
    expect((viaOurs as any)?.toPath).toBe('/completely-new-path')
  })

  it('rejects a duplicate fromPath', async () => {
    const first = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/unique-path',
        toPath: '/destination-one',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(first.id)

    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/unique-path',
          toPath: '/destination-two',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('finds redirects with pagination', async () => {
    const redirect1 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/paginated-1',
        toPath: '/dest-1',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    const redirect2 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/paginated-2',
        toPath: '/dest-2',
        redirectType: '302',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(redirect1.id, redirect2.id)

    const result = await engine.find({
      collection: 'redirects',
      limit: 10,
      overrideAccess: true,
    })
    expect((result as any).docs.length).toBeGreaterThanOrEqual(2)
  })

  // Validation tests for fromPath
  it('rejects fromPath without leading slash', async () => {
    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: 'no-leading-slash',
          toPath: '/valid-target',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects fromPath starting with /admin/', async () => {
    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/admin/x',
          toPath: '/valid-target',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects fromPath starting with /api/', async () => {
    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/api/x',
          toPath: '/valid-target',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  // Validation tests for toPath
  it('rejects toPath with invalid scheme (ftp://)', async () => {
    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/old-page',
          toPath: 'ftp://example.com/file',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects toPath equal to fromPath', async () => {
    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/same-path',
          toPath: '/same-path',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  // Duplicate fromPath tests
  it('rejects duplicate fromPath (exact match)', async () => {
    const first = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/dup-exact',
        toPath: '/destination-one',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(first.id)

    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/dup-exact',
          toPath: '/destination-two',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects duplicate fromPath with trailing slash variance (/dup vs /dup/)', async () => {
    const first = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/dup-trailing-slash-test',
        toPath: '/destination-one',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(first.id)

    try {
      await engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/dup-trailing-slash-test/',
          toPath: '/destination-two',
          redirectType: '301',
        },
        overrideAccess: true,
      })
      expect.fail('Should have thrown validation error for duplicate fromPath')
    } catch (error) {
      expect((error as any)?.message).toMatch(/already in use/)
    }
  })

  // Chain loop tests
  it('rejects chain loop: A->B then B->A', async () => {
    const a = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/loop-cycle-test-a',
        toPath: '/loop-cycle-test-b',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(a.id)

    try {
      await engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/loop-cycle-test-b',
          toPath: '/loop-cycle-test-a',
          redirectType: '301',
        },
        overrideAccess: true,
      })
      expect.fail('Should have thrown validation error for loop')
    } catch (error) {
      expect((error as any)?.message).toMatch(/loop/)
    }
  })

  it('rejects chain of 6 hops (exceeds max depth)', async () => {
    const r1 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/hop-1',
        toPath: '/hop-2',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(r1.id)

    const r2 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/hop-2',
        toPath: '/hop-3',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(r2.id)

    const r3 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/hop-3',
        toPath: '/hop-4',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(r3.id)

    const r4 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/hop-4',
        toPath: '/hop-5',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(r4.id)

    const r5 = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/hop-5',
        toPath: '/hop-6',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(r5.id)

    // 6th hop should exceed the max chain length
    await expect(
      engine.create({
        collection: 'redirects',
        data: {
          fromPath: '/hop-6',
          toPath: '/hop-7',
          redirectType: '301',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  // Whitespace trimming test
  it('trims whitespace from fromPath and toPath on valid create', async () => {
    const created = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '  /trimmed-from  ',
        toPath: '  /trimmed-to  ',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(created.id)

    const fetched = await engine.findByID({
      collection: 'redirects',
      id: created.id,
      overrideAccess: true,
    })
    expect((fetched as any)?.fromPath).toBe('/trimmed-from')
    expect((fetched as any)?.toPath).toBe('/trimmed-to')
  })

  // Update tests
  it('allows update of a record keeping its own fromPath (selfId excluded from duplicate check)', async () => {
    const original = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/self-update',
        toPath: '/original-target',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(original.id)

    const updated = await engine.update({
      collection: 'redirects',
      id: original.id,
      data: {
        fromPath: '/self-update',
        toPath: '/new-target',
        redirectType: '302',
      },
      overrideAccess: true,
    })

    expect((updated as any)?.fromPath).toBe('/self-update')
    expect((updated as any)?.toPath).toBe('/new-target')
    expect((updated as any)?.redirectType).toBe('302')
  })

  it('rejects update that creates a loop', async () => {
    const a = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/loop-a',
        toPath: '/loop-b',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(a.id)

    const b = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/loop-b',
        toPath: '/loop-c',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(b.id)

    // Try to update b to point back to a, creating a loop: a->b->a
    await expect(
      engine.update({
        collection: 'redirects',
        id: b.id,
        data: {
          toPath: '/loop-a',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('allows editing a disabled record without counting toward loop validation', async () => {
    const disabled = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/disabled-path',
        toPath: '/some-target',
        redirectType: '301',
        enabled: false,
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(disabled.id)

    const loop = (await engine.create({
      collection: 'redirects',
      data: {
        fromPath: '/some-target',
        toPath: '/another-target',
        redirectType: '301',
      },
      overrideAccess: true,
    })) as unknown as { id: number }
    createdIds.push(loop.id)

    // Update the disabled record to point to /another-target
    // This would create a loop if the disabled record were counted,
    // but should succeed because disabled records don't count
    const updated = await engine.update({
      collection: 'redirects',
      id: disabled.id,
      data: {
        toPath: '/another-target',
      },
      overrideAccess: true,
    })

    expect((updated as any)?.toPath).toBe('/another-target')
  })
})
