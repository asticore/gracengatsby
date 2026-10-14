import { redirect } from 'next/navigation'

import { getAdminContext, hasAdminPanelAccess } from '@/admin/auth'
import { ShopReportsPanel } from '@/features/shopReports/ShopReportsPanel'

/** /admin/shop-reports: sales, customers, products, coupons, payments, locations, low stock and abandoned carts. */
export async function ShopReportsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect('/admin/login')
  if (!(context.isAdmin || context.can('orders', 'read'))) return <p>You do not have access to the shop reports.</p>
  return (
    <div className="settings-page">
      <div className="settings-page__header">
        <h1 className="settings-page__title">Shop reports</h1>
        <p className="settings-page__description">How the shop is doing: sales, refunds, customers, products and coupons for the dates you pick. Each table can be downloaded as a spreadsheet.</p>
      </div>
      <ShopReportsPanel />
    </div>
  )
}

export default ShopReportsView
