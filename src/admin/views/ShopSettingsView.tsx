import { adminHref } from '@/features/security/adminPath'
import { getAdminRoot } from '@/features/security/settings'
import { notFound, redirect } from 'next/navigation'
import { getAdminContext, getGlobalConfig, hasAdminPanelAccess } from '@/admin/auth'
import { sanitizeFieldsForClient } from '@/admin/fields/shared'
import { ShopSettingsClient } from './ShopSettingsClient'

/** Server wrapper for /admin/shop-settings: the shop-settings and payment-settings globals in one tabbed screen. */
export async function ShopSettingsView() {
  const context = await getAdminContext()
  if (!hasAdminPanelAccess(context.user)) redirect(adminHref('/login', await getAdminRoot()))
  if (!context.isAdmin || !context.permissions.globals?.['shop-settings']?.read) {
    return <p>You do not have access to the shop settings.</p>
  }
  const shopConfig = getGlobalConfig(context.engine, 'shop-settings')
  if (!shopConfig) notFound()
  const shopDoc = await context.engine.findGlobal({ slug: 'shop-settings', user: context.user })

  const paymentConfig = getGlobalConfig(context.engine, 'payment-settings')
  const canPay = Boolean(paymentConfig && context.permissions.globals?.['payment-settings']?.read)
  const paymentDoc = canPay ? await context.engine.findGlobal({ slug: 'payment-settings', user: context.user }) : null

  const extraConfig = getGlobalConfig(context.engine, 'shop-extra-settings')
  const canExtra = Boolean(extraConfig && context.permissions.globals?.['shop-extra-settings']?.read)
  const extraDoc = canExtra ? await context.engine.findGlobal({ slug: 'shop-extra-settings', user: context.user }) : null

  const shippingConfig = getGlobalConfig(context.engine, 'shipping-settings')
  const canShip = Boolean(shippingConfig && context.permissions.globals?.['shipping-settings']?.read)
  const shippingDoc = canShip ? await context.engine.findGlobal({ slug: 'shipping-settings', user: context.user }) : null

  return (
    <ShopSettingsClient
      shippingDoc={shippingDoc as Record<string, unknown> | null}
      shippingFields={canShip && shippingConfig ? sanitizeFieldsForClient(shippingConfig.fields) : null}
      shopDoc={shopDoc as Record<string, unknown>}
      shopFields={sanitizeFieldsForClient(shopConfig.fields)}
      paymentDoc={paymentDoc as Record<string, unknown> | null}
      paymentFields={canPay && paymentConfig ? sanitizeFieldsForClient(paymentConfig.fields) : null}
      extraDoc={extraDoc as Record<string, unknown> | null}
      extraFields={canExtra && extraConfig ? sanitizeFieldsForClient(extraConfig.fields) : null}
    />
  )
}

export default ShopSettingsView
