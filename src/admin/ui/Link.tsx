/**
 * From-scratch replacement for `@payloadcms/ui`'s `Link`.
 *
 * Every call site in this codebase (AdminNavClient.tsx, AdminNav.tsx) already
 * uses it exactly like next/link - href, className, id, prefetch, children -
 * so next/link itself satisfies the contract with no wrapper needed.
 */

export { default as Link } from 'next/link'
