import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { StoreCreditPanel } from '@/features/ecommerce/admin/StoreCreditPanel'

/** /admin/store-credit: look up a customer, then add or deduct store credit with a reason. */
export async function StoreCreditView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!(context.isAdmin || context.can('store-credits', 'read'))) return <p>You do not have access to store credit.</p>
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Add or deduct store credit</h1>
        <p className="settings-page__description">Find a customer by email, then change their balance. Every change needs a reason and is recorded in the credit ledger.</p>
      </div>
      <StoreCreditPanel />
    </div>
  )
}

export default StoreCreditView
