/**
 * From-scratch replacement for `@payloadcms/next/layouts`'s `RootLayout` +
 * `handleServerFunctions`.
 *
 * Mounted at `src/app/(engage)/layout.tsx` - unmodified, see that file's own
 * header - which is the root layout for the WHOLE `(engage)` route group.
 * That group holds only `admin/` and `api/` (confirmed: `src/app/(engage)`
 * has no other subdirectory - the storefront lives entirely under the
 * sibling `(frontend)` route group with its own separate root layout), and
 * `api/` routes never render a layout at all, so in practice this component
 * only ever renders for a real `/admin/*` navigation - it can safely always
 * call `getAdminContext()` and always render the full `<html>/<body>`
 * document shell real Payload's own admin `RootLayout` also owns (this
 * route group has no other root layout to supply it).
 *
 * Nav visibility is driven by `context.isAdmin`, not the URL: an anonymous
 * or non-admin visitor - which includes anyone on `/admin/login` itself,
 * since they are by definition not yet signed in as an admin - gets no nav
 * chrome around whatever RootPage renders (the login form fills the whole
 * page); once signed in, every subsequent request has `isAdmin: true` and
 * gets the real sidebar. This sidesteps needing this layout to know the
 * current pathname at all (Next's App Router root layouts aren't handed the
 * page's own dynamic segments), while still matching the one place that
 * genuinely needs no chrome.
 */

import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/nav/AdminNav'
import { DocumentEventsProvider, NavProvider } from '@/admin/context'
import { getAdminContext } from '@/admin/auth'

export async function RootLayout({ children }: { children: ReactNode; config?: unknown; importMap?: unknown; serverFunction?: unknown }) {
  const context = await getAdminContext()

  return (
    <html lang="en">
      <body>
        <DocumentEventsProvider>
          <NavProvider>
            {context.isAdmin && (
              <AdminNav i18n={context.i18n} payload={context.engine} permissions={context.permissions} visibleEntities={context.visibleEntities} />
            )}
            <main className={context.isAdmin ? 'admin-main' : undefined}>{children}</main>
          </NavProvider>
        </DocumentEventsProvider>
      </body>
    </html>
  )
}

/**
 * Real Payload's own React-Server-Action bridge for `@payloadcms/ui`'s
 * client components (saving nav preferences, running admin-panel document
 * actions, etc. via a `'use server'` RPC rather than a REST call). Grepped
 * every consumer of `useServerFunctions`/`serverFunction`/
 * `handleServerFunctions` in `src/` directly (excluding this file and the
 * `layout.tsx` that wires it in): none exist - this from-scratch admin's
 * own client components (FieldRenderer/EditForm/ListView/LoginView/AdminNav/
 * Logout/SettingsRefresh) all call the REST API or the engine directly
 * instead, matching this project's own established "reproduce the real wire
 * behavior, not the vendor's internal RPC plumbing" approach. `layout.tsx`
 * still builds and passes a `serverFunction` prop (unmodified, matching this
 * file's own header on why that file is left alone), so this still needs to
 * exist and type-check - it throws rather than silently no-op, so a future
 * client component that DOES start depending on it fails loudly in
 * development instead of a confusing silent no-op in production.
 */
export async function handleServerFunctions(..._args: unknown[]): Promise<never> {
  throw new Error(
    'handleServerFunctions is not implemented - this admin has no client component left that calls it (see this file\'s header). If something new needs it, it needs a real REST/engine-backed implementation, not this stub.',
  )
}
