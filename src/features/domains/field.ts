import type { Field } from '@/engine'

import { normaliseHost } from './host'

/**
 * "Available on domains" for pages, posts and products. A comma-separated host list, empty = every domain.
 * The hook refuses an entry that is not a host name, so a typo cannot silently hide content everywhere.
 * Column: available_domains (version_available_domains on the versioned tables). See migration 20261201_100000_content_domains.
 */
export const availableDomainsField: Field = {
  name: 'availableDomains',
  type: 'text',
  label: 'Available on domains',
  admin: {
    position: 'sidebar',
    description:
      'Domains this content is shown on, separated by commas, e.g. example.com, example.com.au. Leave empty to show it on every domain. Other domains answer with not found.',
  },
  hooks: {
    beforeChange: [
      ({ value }: { value?: unknown }) => {
        if (typeof value !== 'string' || value.trim() === '') return null
        const hosts: string[] = []
        for (const part of value.split(/[\s,;]+/).filter(Boolean)) {
          const result = normaliseHost(part)
          if (result.ok === false) throw new Error(`Available on domains: ${result.reason}`)
          if (!hosts.includes(result.host)) hosts.push(result.host)
        }
        return hosts.length > 0 ? hosts.join(', ') : null
      },
    ],
  },
} as Field
