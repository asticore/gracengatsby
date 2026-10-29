import type { Field } from '@/engine'

import { normaliseHost } from './host'

/**
 * Domain list fields. Stored as ",a.com,b.com," (delimited on both ends, so a `contains` on ",host," matches
 * whole hosts only: see access.ts). Empty stores null, which means every domain.
 * Used for "Available on domains" on pages, posts and products, and "Allowed domains" on users and roles.
 */
function domainListField(name: string, label: string, description: string): Field {
  return {
    name,
    type: 'text',
    label,
    admin: {
      position: 'sidebar',
      description,
      components: { Field: '@/features/domains/admin/DomainPicker#DomainPicker' },
    },
    hooks: {
      beforeChange: [
        ({ value }: { value?: unknown }) => {
          if (typeof value !== 'string' || value.trim() === '') return null
          const hosts: string[] = []
          for (const part of value.split(/[\s,;]+/).filter(Boolean)) {
            const result = normaliseHost(part)
            if (result.ok === false) throw new Error(`${label}: ${result.reason}`)
            if (!hosts.includes(result.host)) hosts.push(result.host)
          }
          return hosts.length > 0 ? `,${hosts.join(',')},` : null
        },
      ],
    },
  } as Field
}

/** "Available on domains" for pages, posts and products. Empty = every domain. Column: available_domains (version_available_domains on versions). */
export const availableDomainsField: Field = domainListField(
  'availableDomains',
  'Available on domains',
  'Domains this content is shown on, separated by commas, e.g. example.com, example.com.au. Leave empty to show it on every domain. Other domains answer with not found.',
)

/** "Allowed domains" for users and roles. Empty = every domain. Column: allowed_domains. Limits what the account can read and publish; see access.ts. */
export const allowedDomainsField: Field = domainListField(
  'allowedDomains',
  'Allowed domains',
  'Limit this account to these domains: it can only see and publish content available on them. Leave empty for every domain. A role setting applies when the account has none of its own.',
)
