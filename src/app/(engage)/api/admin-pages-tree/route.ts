import { NextResponse } from 'next/server'
import { getAdminContext } from '@/admin/auth'
import { createEngine } from '@/localapi/engine'
import { planMoves, type TreePage, type MoveInput } from '@/features/pagesTree/plan'
import { purgeCache } from '@/features/speed/purge'
import { invalidateRedirectsCache } from '@/features/redirects'
import type { TypedUser } from '@/engine'

export const dynamic = 'force-dynamic'

/**
 * GET: Load all pages and return as TreePage[]
 * Returns: { pages: TreePage[] }
 *
 * POST: Plan and optionally apply page moves
 * Body: { moves: MoveInput[], mode: 'preview' | 'commit', createRedirects?: boolean }
 * Returns on preview: { plan }
 * Returns on commit: { ok: true, applied: number, redirects: { created: number, skipped: [...], available: boolean }, purged: number }
 * Returns on error: 400 { errors } or 409 { error, failed }
 *
 * Admin only.
 */

async function loadAllPages(engine: any): Promise<TreePage[]> {
  const { docs } = await engine.find({
    collection: 'pages',
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })

  return (docs as any[]).map((doc) => ({
    id: doc.id,
    title: doc.title,
    slug: doc.slug,
    parent: doc.parent ? (typeof doc.parent === 'object' ? doc.parent.id : doc.parent) : null,
    sortOrder: doc.sortOrder ?? 0,
    isHomepage: doc.isHomepage ?? false,
    status: doc._status ?? 'published',
  }))
}

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const engine = createEngine()
    const pages = await loadAllPages(engine)

    return NextResponse.json({ pages }, { status: 200 })
  } catch (error) {
    console.error('admin-pages-tree GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const context = await getAdminContext()
    if (!context.isAdmin) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
    }

    const body: unknown = await request.json().catch((): null => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { moves, mode, createRedirects } = body as {
      moves?: unknown
      mode?: unknown
      createRedirects?: unknown
    }

    // Validate moves
    if (!Array.isArray(moves)) {
      return NextResponse.json({ error: 'moves must be an array' }, { status: 400 })
    }

    if (moves.length > 500) {
      return NextResponse.json({ error: 'moves array max 500 items' }, { status: 400 })
    }

    // Validate each move
    for (const move of moves) {
      if (typeof move !== 'object' || move === null) {
        return NextResponse.json({ error: 'Each move must be an object' }, { status: 400 })
      }
      const m = move as any
      if (!Number.isInteger(m.id) || m.id <= 0) {
        return NextResponse.json({ error: 'move.id must be a positive integer' }, { status: 400 })
      }
      if (m.parent !== null && (!Number.isInteger(m.parent) || m.parent <= 0)) {
        return NextResponse.json({ error: 'move.parent must be null or a positive integer' }, { status: 400 })
      }
      if (!Number.isInteger(m.sortOrder) || m.sortOrder < 0) {
        return NextResponse.json({ error: 'move.sortOrder must be a non-negative integer' }, { status: 400 })
      }
    }

    // Validate mode
    if (mode !== 'preview' && mode !== 'commit') {
      return NextResponse.json({ error: 'mode must be "preview" or "commit"' }, { status: 400 })
    }

    // Load pages
    const engine = createEngine()
    const pages = await loadAllPages(engine)

    // Plan moves
    const typedMoves: MoveInput[] = moves.map((m: any) => ({
      id: m.id,
      parent: m.parent ?? null,
      sortOrder: m.sortOrder ?? 0,
    }))

    const planResult = planMoves(pages, typedMoves)

    if (!planResult.ok) {
      const errorResult = planResult as { ok: false; errors: any[] }
      return NextResponse.json({ errors: errorResult.errors }, { status: 400 })
    }

    const okResult = planResult as { ok: true; moves: any[]; changedCount: number }

    // Create a map of page status for later
    const pageStatusMap = new Map(pages.map((p) => [p.id, p.status]))

    // Preview mode: return plan without applying
    if (mode === 'preview') {
      return NextResponse.json({ plan: okResult }, { status: 200 })
    }

    // Commit mode: apply moves
    const pageMap = new Map(pages.map((p) => [p.id, p]))
    const user = context.user as TypedUser
    const appliedMoves: number[] = []
    let remainingMoves = Array.from(typedMoves)
    let passes = 0
    const maxPasses = 5
    const failures: { id: number; message: string }[] = []

    // Retry loop: apply pending moves, retry failures after others succeed
    while (remainingMoves.length > 0 && passes < maxPasses) {
      passes++
      const nextBatch = remainingMoves
      remainingMoves = []

      for (const move of nextBatch) {
        try {
          const page = pageMap.get(move.id)
          if (!page) {
            failures.push({ id: move.id, message: 'Page not found' })
            continue
          }

          const status = pageStatusMap.get(move.id) ?? 'published'
          await engine.update({
            collection: 'pages',
            id: move.id,
            data: {
              parent: move.parent,
              sortOrder: move.sortOrder,
              _status: status,
            },
            overrideAccess: true,
            user,
          })
          appliedMoves.push(move.id)
        } catch (err: any) {
          // If it fails, keep it in the queue for retry
          remainingMoves.push(move)
          if (passes === maxPasses) {
            // Final attempt failed
            failures.push({
              id: move.id,
              message: err?.message || 'Failed to apply move',
            })
          }
        }
      }
    }

    // If there are failures, rollback all applied moves
    if (failures.length > 0) {
      // Rollback applied moves with same retry logic
      const toRollback = appliedMoves
      let rollbackRemaining = toRollback
      passes = 0

      while (rollbackRemaining.length > 0 && passes < maxPasses) {
        passes++
        const batch = rollbackRemaining
        rollbackRemaining = []

        for (const moveId of batch) {
          try {
            const originalMove = typedMoves.find((m) => m.id === moveId)!
            const page = pageMap.get(moveId)!

            const status = pageStatusMap.get(moveId) ?? 'published'
            await engine.update({
              collection: 'pages',
              id: moveId,
              data: {
                parent: page.parent,
                sortOrder: page.sortOrder,
                _status: status,
              },
              overrideAccess: true,
              user,
            })
          } catch (err: any) {
            rollbackRemaining.push(moveId)
            if (passes === maxPasses) {
              // Log but don't fail - we tried
              console.error(`Failed to rollback move ${moveId}:`, err)
            }
          }
        }
      }

      return NextResponse.json(
        {
          error: 'Could not apply all moves; nothing was changed.',
          failed: failures,
        },
        { status: 409 }
      )
    }

    // Collect paths of all moved pages and descendants
    const oldPaths: string[] = []
    const newPaths: string[] = []

    for (const move of okResult.moves) {
      oldPaths.push(move.oldPath)
      newPaths.push(move.newPath)
      for (const desc of move.descendants) {
        oldPaths.push(desc.oldPath)
        newPaths.push(desc.newPath)
      }
    }

    const allPathsToPurge = [...new Set([...oldPaths, ...newPaths])]

    // Purge cache
    let purgedCount = 0
    try {
      const purgeResult = await purgeCache(allPathsToPurge)
      purgedCount = purgeResult.edgeEvicted.length + purgeResult.revalidated.length
    } catch (err) {
      console.error('purgeCache error:', err)
      // Don't fail the request, just log
    }

    // Create redirects if requested
    let redirectsCreated = 0
    const redirectsSkipped: { path: string; reason: string }[] = []
    let redirectsAvailable = true

    if (createRedirects) {
      try {
        // Check if redirects collection is available
        try {
          await engine.find({ collection: 'redirects', limit: 1, depth: 0, overrideAccess: true })
        } catch {
          redirectsAvailable = false
        }

        if (redirectsAvailable) {
          for (const move of planResult.moves) {
            // Create redirect for the page itself if path changed and status is published and oldPath is not '/'
            const moveStatus = pageStatusMap.get(move.id)
            if (move.pathChanged && move.oldPath !== '/' && moveStatus === 'published') {
              try {
                await engine.create({
                  collection: 'redirects',
                  data: {
                    fromPath: move.oldPath,
                    toPath: move.newPath,
                    redirectType: '301',
                    note: 'Created when pages were moved in the tree',
                  },
                  overrideAccess: true,
                  user,
                })
                redirectsCreated++
              } catch (err: any) {
                redirectsSkipped.push({
                  path: move.oldPath,
                  reason: err?.message || 'Failed to create redirect',
                })
              }
            }

            // Create redirects for descendants if they changed
            for (const desc of move.descendants) {
              if (desc.oldPath !== desc.newPath && desc.oldPath !== '/') {
                // Check the descendant page status
                const descStatus = pageStatusMap.get(desc.id)
                if (descStatus === 'published') {
                  try {
                    await engine.create({
                      collection: 'redirects',
                      data: {
                        fromPath: desc.oldPath,
                        toPath: desc.newPath,
                        redirectType: '301',
                        note: 'Created when pages were moved in the tree',
                      },
                      overrideAccess: true,
                      user,
                    })
                    redirectsCreated++
                  } catch (err: any) {
                    redirectsSkipped.push({
                      path: desc.oldPath,
                      reason: err?.message || 'Failed to create redirect',
                    })
                  }
                }
              }
            }
          }

          // Invalidate redirects cache after creating redirects
          try {
            await invalidateRedirectsCache()
          } catch (err) {
            console.error('invalidateRedirectsCache error:', err)
          }
        }
      } catch (err) {
        console.error('Redirect creation error:', err)
        // Don't fail the request
      }
    }

    return NextResponse.json(
      {
        ok: true,
        applied: appliedMoves.length,
        redirects: {
          created: redirectsCreated,
          skipped: redirectsSkipped,
          available: redirectsAvailable,
        },
        purged: purgedCount,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('admin-pages-tree POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
