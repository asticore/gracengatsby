import React from 'react'

import { AuthShell } from '@/features/accounts/components/AccountShell'
import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { loadStrings, t } from '@/features/uiStrings/t'
import type { UiStringKey } from '@/features/uiStrings/keys'
import { confirmDeletionByToken } from '../service'
import { privacyBinding } from '../binding'

/** /account/privacy/confirm?token=...: the emailed link. Works signed out; the token is the proof. */
export const PrivacyConfirm = async ({ token }: { token: string }) => {
  const locale = await currentPortalLocale()
  await loadStrings(locale)
  const tr = (key: UiStringKey) => t(key, locale)
  const { store } = await privacyBinding()
  const result = await confirmDeletionByToken(store, token, new Date())
  const text: UiStringKey = result.ok === true ? 'privacy.confirm.done' : result.code === 'expired' ? 'privacy.confirm.expired' : 'privacy.confirm.invalid'
  return (
    <AuthShell title={tr('privacy.confirm.title')}>
      <p>{tr(text)}</p>
    </AuthShell>
  )
}
