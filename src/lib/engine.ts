import { getPayload } from 'payload'

import config from '@/engage.config'

/**
 * Returns the initialised CMS engine instance for this request.
 *
 * Everything that reads or writes content server-side goes through here -
 * frontend pages, sitemap/robots, the feature-toggle lookups and the block
 * components that fetch their own data.
 */
export const getEngine = async () => {
  const engineConfig = await config
  return getPayload({ config: engineConfig })
}
