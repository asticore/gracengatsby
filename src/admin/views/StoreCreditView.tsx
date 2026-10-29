import { getAdminUi } from '@/admin/i18n/serverUi'
import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { StoreCreditPanel } from '@/features/ecommerce/admin/StoreCreditPanel'

/** /admin/store-credit: look up a customer, then add or deduct store credit with a reason. */
export async function StoreCreditView() {
  const context = await getAdminContext()
  const ui = await getAdminUi()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!(context.isAdmin || context.can('store-credits', 'read'))) return <p>{ui.t('cu.lit.no_access_store_credit')}</p>
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">{ui.t('cu.lit.add_or_deduct_store_credit')}</h1>
        <p className="settings-page__description">{ui.t('cu.lit.store_credit_description')}</p>
      </div>
      <StoreCreditPanel />
    </div>
  )
}

export default StoreCreditView
