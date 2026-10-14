import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { DisplayCurrenciesPanel } from '@/features/ecommerce/admin/DisplayCurrenciesPanel'

/** /admin/display-currencies: the extra currencies shoppers can view prices in. Linked from Shop settings. */
export async function DisplayCurrenciesView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!(context.isAdmin || context.can('settings:shop-settings', 'read'))) return <p>You do not have access to the shop settings.</p>
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Display currencies</h1>
        <p className="settings-page__description">Let shoppers see prices in other currencies. Shoppers always pay in the shop currency.</p>
      </div>
      <DisplayCurrenciesPanel />
    </div>
  )
}

export default DisplayCurrenciesView
