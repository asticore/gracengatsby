import { slugClaimsConflict } from './scope'

/**
 * Slug uniqueness for collections whose slug is unique across the whole table (posts, products). Pages check their own
 * slug under a parent in their collection validate. Returns true when another document with this slug already answers on
 * one of the domains `incoming` (or, on an update that omits the field, the stored list) is scoped to.
 */
type SlugEngine = {
  find: (args: { collection: string; where: unknown; limit: number; depth: number; overrideAccess: boolean }) => Promise<{ docs: unknown[] }>
  findByID: (args: { collection: string; id: string | number; depth: number; overrideAccess: boolean }) => Promise<unknown>
}

export async function slugClashes(args: {
  engine: SlugEngine
  collection: 'posts' | 'products'
  slug: string
  incoming: unknown
  id?: string | number | null
}): Promise<boolean> {
  const { engine, collection, slug, id } = args
  let incoming = args.incoming
  if (incoming === undefined && id) {
    const stored = (await engine.findByID({ collection, id, depth: 0, overrideAccess: true }).catch((): null => null)) as { availableDomains?: unknown } | null
    incoming = stored?.availableDomains ?? null
  }
  const { docs } = await engine.find({
    collection,
    where: { and: [{ slug: { equals: slug } }, ...(id ? [{ id: { not_equals: id } }] : [])] },
    limit: 0,
    depth: 0,
    overrideAccess: true,
  })
  return docs.some((doc) => slugClaimsConflict((doc as { availableDomains?: unknown }).availableDomains, incoming ?? null))
}

/** A field `validate` for a slug unique per domain on one collection (see slugClashes). */
export function domainSlugValidate(collection: 'posts' | 'products', label: string) {
  return async (value: unknown, args: { req?: { engine?: unknown }; data?: Record<string, unknown>; id?: unknown }): Promise<true | string> => {
    const slug = typeof value === 'string' ? value.trim() : ''
    if (!slug || !args.req?.engine) return true
    const clash = await slugClashes({
      engine: args.req.engine as SlugEngine,
      collection,
      slug,
      incoming: args.data?.availableDomains,
      id: (args.id as string | number | undefined) ?? null,
    })
    return clash ? `Another ${label} with this slug already exists on one of these domains. Choose a different slug or domain.` : true
  }
}
