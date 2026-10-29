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

/**
 * "Available on domains" for pages, posts and products, the "Site (domain)" choice. Empty = All domains (shared). One host = a
 * site-specific document: the same slug on another domain is a separate document (slug uniqueness, scope.ts). Several hosts =
 * shared between those hosts. The earlier multi-domain list needs no migration: a single host is the single-domain case of it.
 * Column: available_domains (version_available_domains on versions).
 */
export const availableDomainsField: Field = domainListField(
  'availableDomains',
  'Available on domains',
  'Site (domain). Leave empty for All domains (shared): shown on every domain. Pick one domain to make this content specific to it, so the same slug can be used on another domain with different content. Pick several to share it between those domains. Other domains answer with not found.',
)

/** "Allowed domains" for users and roles. Empty = every domain. Column: allowed_domains. Limits what the account can read and publish; see access.ts. */
export const allowedDomainsField: Field = domainListField(
  'allowedDomains',
  'Allowed domains',
  'Limit this account to these domains: it can only see and publish content available on them. Leave empty for every domain. A role setting applies when the account has none of its own.',
)
