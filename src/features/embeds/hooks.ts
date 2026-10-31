import { resolveEmbedShortLinks } from './shortLinks'

/**
 * Collection beforeChange hook: stores the canonical address of any short embed link in the blocks, so the synchronous
 * embed render never has to fetch. A failed resolution keeps the link as typed (it then shows as a link card).
 */
export const embedShortLinksBeforeChange = async ({ data }: { data?: Record<string, unknown> | null }) => {
  if (!data || typeof data !== 'object' || data.blocks === undefined || data.blocks === null) return data
  const { value } = await resolveEmbedShortLinks(data.blocks)
  return { ...data, blocks: value }
}
