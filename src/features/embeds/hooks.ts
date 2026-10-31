import { resolveEmbedShortLinks } from './shortLinks'

/**
 * Builds a collection or global beforeChange hook that stores the canonical address of any short embed link in one
 * block field (`blocks`, `introBlocks`, `layout`, `content`, ...). A failed resolution keeps the link as typed (it then
 * shows as a link card).
 */
export const embedShortLinksFor =
  (field: string) =>
  async ({ data }: { data?: Record<string, unknown> | null }) => {
    if (!data || typeof data !== 'object' || data[field] === undefined || data[field] === null) return data
    const { value } = await resolveEmbedShortLinks(data[field])
    return { ...data, [field]: value }
  }

/** Collection beforeChange hook for the `blocks` field, the shape most page-building collections use. */
export const embedShortLinksBeforeChange = embedShortLinksFor('blocks')
