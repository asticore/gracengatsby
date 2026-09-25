import type { Metadata } from 'next'
import type { ComponentType } from 'react'
import { notFound, redirect } from 'next/navigation'
import { CUSTOM_ADMIN_VIEWS } from '@/admin/adminViewRegistry'
import { getAdminContext, getCollectionConfig, getGlobalConfig, type AdminContext } from '@/admin/auth'
import { getEngine } from '@/lib/engine'
import type { AdminViewServerProps } from '@/engine'
import { ListView } from './ListView'
import { EditView } from './EditView'
import { GlobalEditView } from './GlobalEditView'
import { LoginView } from './LoginView'

/**
 * The from-scratch replacement for real Payload's own `RootPage`
 * (`@payloadcms/next/views`) - the single server component every admin URL
 * renders through (`src/app/(engage)/admin/[[...segments]]/page.tsx`, a
 * `[[...segments]]` catch-all - unmodified, see that file's own header:
 * it just calls this function with the same 4 args real Payload's own
 * `RootPage` always took).
 *
 * `config`/`importMap` are accepted for call-site compatibility with that
 * unmodified page.tsx (and `not-found.tsx`, `admin/importMap.js`) but
 * unused here: `importMap` was real Payload's mechanism for resolving an
 * `admin.components.*` override string to a real component at render time -
 * this admin has its own, `@/admin/componentRegistry`'s `resolveComponent`/
 * `CUSTOM_ADMIN_VIEWS`, built and wired into FieldRenderer/this file
 * directly, so the generated `importMap` has nothing left for this file to
 * read from it. `config` is likewise unused - every value this file needs
 * (real per-request auth state, the real collection/global configs) comes
 * from `getAdminContext()`/`getCollectionConfig()`/`getGlobalConfig()`
 * instead of a static build-time config object.
 *
 * ROUTES (matching this admin's own established URL convention - see
 * `src/components/admin/nav/navStructure.ts`'s own doc comment and
 * `AdminNav.tsx`'s `formatAdminURL` calls, both unchanged and already
 * pointing at these exact paths):
 *   - `/admin`                                -> dashboard
 *   - `/admin/login`                          -> LoginView (the only route
 *     reachable without an admin session)
 *   - `/admin/collections/:slug`              -> ListView
 *   - `/admin/collections/:slug/create`       -> EditView (blank)
 *   - `/admin/collections/:slug/:id`          -> EditView (seeded)
 *   - `/admin/globals/:slug`                  -> GlobalEditView
 *   - any `CUSTOM_ADMIN_VIEWS` path (translations/database/ab-test-results/
 *     visual-editor) -> that view's own registered `Component`
 *   - anything else                           -> `notFound()`
 */

type Args = {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | string[]>>
  config?: unknown
  importMap?: unknown
}

/**
 * Matches real Payload's own custom-view path syntax (`:name` for a required
 * param, `:name?` for an optional trailing one - the only param position
 * `CUSTOM_ADMIN_VIEWS`'s one parameterized entry, the visual editor, uses:
 * `/visual-editor/:mode/:slug/:id?`) against a `/`-joined pathname.
 */
function matchCustomViewPath(pattern: string, pathname: string): Record<string, string> | null {
  const patternSegments = pattern.split('/').filter(Boolean)
  const pathSegments = pathname.split('/').filter(Boolean)
  const params: Record<string, string> = {}

  let pathIndex = 0
  for (const segment of patternSegments) {
    const optional = segment.endsWith('?')
    const name = segment.startsWith(':') ? segment.slice(1, optional ? -1 : undefined) : null

    if (pathIndex >= pathSegments.length) {
      if (optional) continue
      return null
    }

    const actual = pathSegments[pathIndex]
    if (name) {
      params[name] = actual
    } else if (segment !== actual) {
      return null
    }
    pathIndex++
  }

  return pathIndex === pathSegments.length ? params : null
}

function findCustomView(pathname: string): (typeof CUSTOM_ADMIN_VIEWS)[number] | null {
  for (const view of CUSTOM_ADMIN_VIEWS) {
    if (matchCustomViewPath(view.path, pathname)) return view
  }
  return null
}

/**
 * Builds the props real Payload's own admin-view components (Dashboard,
 * TranslationsView, DatabaseView, ABResultsView - every `CUSTOM_ADMIN_VIEWS`
 * entry except the visual editor, which takes no props at all) already
 * destructure (`i18n`/`payload`/`permissions`/`user`/`visibleEntities`/
 * `searchParams` - confirmed by reading each of those 4 files directly; none
 * of them reads anything else off `AdminViewServerProps`). `AdminViewServerProps`
 * is real Payload's own large type (out of this cutover's scope, same as
 * `Access`/`CollectionConfig`/`Field` - see `@/engine`'s own header), so this
 * builds only the real subset those 4 components actually read and casts the
 * rest away, the same established convention `AdminNav.tsx`'s own loosely
 * typed `AdminNavProps` already uses for the same real vendor prop bag.
 */
function buildViewProps(context: AdminContext, searchParams: Record<string, string | string[]>): AdminViewServerProps {
  return {
    i18n: context.i18n,
    payload: context.engine,
    permissions: context.permissions,
    searchParams,
    user: context.user,
    visibleEntities: context.visibleEntities,
  } as unknown as AdminViewServerProps
}

export async function RootPage({ params, searchParams }: Args) {
  const { segments = [] } = await params
  const search = await searchParams

  if (segments[0] === 'login') {
    const context = await getAdminContext()
    if (context.isAdmin) redirect('/admin')
    return <LoginView />
  }

  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const pathname = `/${segments.join('/')}`
  const customView = findCustomView(pathname)
  if (customView) {
    if (customView.key === 'visualEditor') {
      const Component = customView.Component as ComponentType
      return <Component />
    }
    const Component = customView.Component as ComponentType<AdminViewServerProps>
    return <Component {...buildViewProps(context, search)} />
  }

  if (segments[0] === 'collections') {
    const collectionSlug = segments[1]
    if (!collectionSlug) notFound()
    if (!getCollectionConfig(context.engine, collectionSlug)) notFound()

    if (segments.length === 2) return <ListView collectionSlug={collectionSlug} />
    if (segments.length === 3 && segments[2] === 'create') return <EditView collectionSlug={collectionSlug} />
    if (segments.length === 3) {
      const id = Number(segments[2])
      if (!Number.isFinite(id)) notFound()
      return <EditView collectionSlug={collectionSlug} id={id} />
    }
    notFound()
  }

  if (segments[0] === 'globals') {
    const globalSlug = segments[1]
    if (!globalSlug || segments.length !== 2) notFound()
    if (!getGlobalConfig(context.engine, globalSlug)) notFound()
    return <GlobalEditView globalSlug={globalSlug} />
  }

  notFound()
}

export async function NotFoundPage(_args: Args) {
  return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <h1>Not found</h1>
      <p>Nothing here.</p>
    </div>
  )
}

export async function generatePageMetadata({ params }: Args): Promise<Metadata> {
  const { segments = [] } = await params
  const pathname = `/${segments.join('/')}`

  const customView = findCustomView(pathname)
  const customMeta = customView && 'meta' in customView ? customView.meta : undefined
  if (customMeta) return { title: `${customMeta.title} - Admin` }

  if (segments[0] === 'login') return { title: 'Login - Admin' }

  if (segments[0] === 'collections' && segments[1]) {
    const engine = await getEngine()
    const collection = getCollectionConfig(engine, segments[1])
    const label = collection && typeof collection.labels?.plural === 'string' ? collection.labels.plural : segments[1]
    return { title: `${label} - Admin` }
  }

  if (segments[0] === 'globals' && segments[1]) {
    const engine = await getEngine()
    const global = getGlobalConfig(engine, segments[1])
    const label = global && typeof global.label === 'string' ? global.label : segments[1]
    return { title: `${label} - Admin` }
  }

  return { title: 'Admin' }
}
