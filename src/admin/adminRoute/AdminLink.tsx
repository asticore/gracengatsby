'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'

import { useAdminHref, useAdminRoot } from './AdminRouteProvider'
import { rebaseAdminPath } from '@/features/security/adminPath'

type Props = Omit<ComponentProps<typeof Link>, 'href'> & {
  /** An admin path, relative to the admin root: `path="/content/pages"` links to the configured admin URL. */
  path?: string
  /** An absolute or site href, passed through unchanged. Use `path` for anything inside the admin. */
  href?: ComponentProps<typeof Link>['href']
}

/**
 * next/link for admin screens. `path` is resolved against the configured admin
 * URL (Security > Admin URL), so admin links keep working when that URL is not /admin.
 */
export function AdminLink({ path, href, ...rest }: Props) {
  const adminHref = useAdminHref()
  const root = useAdminRoot()
  // An href built with the default /admin prefix (for example by adminCollectionPath) follows the configured root too.
  const target = path !== undefined ? adminHref(path) : typeof href === 'string' ? rebaseAdminPath(href, root) : (href ?? '/')
  return <Link href={target} {...rest} />
}
