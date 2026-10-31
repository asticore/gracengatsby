import React from 'react'

import { AccountShell } from '@/features/accounts/components/AccountShell'
import { requireCustomer } from '@/features/accounts/guards'
import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { loadStrings, t } from '@/features/uiStrings/t'
import type { UiStringKey } from '@/features/uiStrings/keys'
import { PRIVACY_STATUS_LABEL_KEYS } from '../core'
import { privacyBinding } from '../binding'
import { requestDeletionAction } from '../customerActions'

/**
 * /account/privacy: download the customer's data, or ask for it to be deleted. The deletion form
 * takes the password unless the session signed in recently; the action checks again.
 */

const MESSAGES: Record<string, UiStringKey> = {
  sent: 'privacy.msg.sent',
  password: 'privacy.msg.password',
  open: 'privacy.msg.open',
  failed: 'privacy.msg.failed',
  impersonating: 'privacy.msg.impersonating',
}

export const PrivacyScreen = async ({ deletion }: { deletion?: string }) => {
  const { user } = await requireCustomer('/account/privacy')
  const locale = await currentPortalLocale()
  await loadStrings(locale)
  const tr = (key: UiStringKey, vars?: Record<string, string | number>) => t(key, locale, vars)

  const { store } = await privacyBinding()
  const open = await store.openForUser(Number(user.id))
  const message = deletion && MESSAGES[deletion] ? tr(MESSAGES[deletion]) : null

  return (
    <AccountShell title={tr('privacy.title')} current="/account/privacy">
      <p>{tr('privacy.intro')}</p>
      {message ? <p role="status">{message}</p> : null}

      <section aria-labelledby="privacy-download">
        <h2 id="privacy-download">{tr('privacy.download.heading')}</h2>
        <p className="account-muted">{tr('privacy.download.body')}</p>
        <p>
          <a href="/account/privacy/export" download>
            {tr('privacy.download.button')}
          </a>
        </p>
      </section>

      <section aria-labelledby="privacy-delete">
        <h2 id="privacy-delete">{tr('privacy.delete.heading')}</h2>
        <p className="account-muted">{tr('privacy.delete.body')}</p>
        {open ? (
          <>
            <p>
              <strong>{tr(PRIVACY_STATUS_LABEL_KEYS[open.status])}</strong>
            </p>
            <p className="account-muted">
              {open.status === 'unverified' ? tr('privacy.delete.waiting') : tr('privacy.delete.open', { due: open.dueAt.slice(0, 10) })}
            </p>
          </>
        ) : (
          <form action={requestDeletionAction}>
            <p>
              <label>
                {tr('privacy.delete.password')}{' '}
                <input type="password" name="password" autoComplete="current-password" />
              </label>
            </p>
            <p className="account-muted">{tr('privacy.delete.passwordHelp')}</p>
            <p>
              <button type="submit">{tr('privacy.delete.button')}</button>
            </p>
          </form>
        )}
      </section>
    </AccountShell>
  )
}
