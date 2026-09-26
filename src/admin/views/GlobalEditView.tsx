import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getGlobalConfig } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { EditForm } from './EditForm'

/** Generic edit view for any global - a global always exists (real Payload creates it lazily on first read), so there is no create/blank branch here, unlike EditView. */
export async function GlobalEditView({ globalSlug }: { globalSlug: string }) {
  const context = await getAdminContext()
  if (!context.isAdmin) redirect('/admin/login')

  const global = getGlobalConfig(context.engine, globalSlug)
  if (!global) notFound()
  if (!context.permissions.globals?.[globalSlug]?.read) {
    return <p>You don&apos;t have access to {globalSlug}.</p>
  }

  const doc = await context.engine.findGlobal({ slug: globalSlug, user: context.user })
  const label = typeof global.label === 'string' ? global.label : globalSlug

  return (
    <div className="global-edit">
      <h1>{label}</h1>
      <EditForm doc={doc} fields={sanitizeFieldsForClient(global.fields)} globalSlug={globalSlug} />
    </div>
  )
}

export default GlobalEditView
