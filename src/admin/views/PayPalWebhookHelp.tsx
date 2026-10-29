'use client'

import React, { useSyncExternalStore } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'

const subscribe = () => () => {}
const readOrigin = () => window.location.origin
const readServerOrigin = () => ''

/** Shown under the Payments form: the address to paste into PayPal, and where to find the webhook id. */
export const PayPalWebhookHelp: React.FC = () => {
  const t = useAdminT()
  const origin = useSyncExternalStore(subscribe, readOrigin, readServerOrigin)
  const address = `${origin}/api/shop-paypal-webhook`
  return (
    <div className="shop-test-panel">
      <h3>{t('ig.lit.pp_title')}</h3>
      <p>
        {t('ig.lit.pp_intro')}
      </p>
      <ol>
        <li>{t('ig.lit.pp_step1')}</li>
        <li>
          {t('ig.lit.pp_step2')} <code>{address}</code>
        </li>
        <li>{t('ig.lit.pp_step3')}</li>
        <li>{t('ig.lit.pp_step4')}</li>
      </ol>
      <p>{t('ig.lit.pp_env')}</p>
    </div>
  )
}
