/**
 * Reads every row a find matches, a page at a time, up to a ceiling.
 *
 * Used by the routes for the RSVP CSV and the guest total. The ceiling is the
 * bound: a popular event must not turn one request into an unbounded read.
 */

export type FindArgs = {
  collection: string
  where?: unknown
  sort?: string
  page?: number
  limit?: number
  depth?: number
  user?: unknown
}

export type FindEngine = {
  find(args: FindArgs): Promise<{ docs: unknown[]; hasNextPage?: boolean }>
}

const SCAN_PAGE_SIZE = 500

export async function collectRows(
  engine: FindEngine,
  args: Omit<FindArgs, 'page' | 'limit'>,
  max: number,
): Promise<{ docs: Record<string, unknown>[]; truncated: boolean }> {
  const docs: Record<string, unknown>[] = []
  for (let page = 1; ; page++) {
    const result = await engine.find({ ...args, page, limit: SCAN_PAGE_SIZE })
    for (const doc of result.docs) docs.push(doc as Record<string, unknown>)
    if (!result.hasNextPage) return { docs, truncated: false }
    if (docs.length >= max) return { docs: docs.slice(0, max), truncated: true }
  }
}
