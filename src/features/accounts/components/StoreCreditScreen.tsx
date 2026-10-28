import React from 'react'

import { creditBalance } from '@/features/ecommerce/server/storedValue'
import { portalTextFor } from '@/features/multilingual/portalStrings'
import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'

import { requireCustomer } from '../guards'
import { formatAmount, formatDate, portalFormatLocale } from '../orders'
import { AccountShell } from './AccountShell'

type LedgerRow = { id: number; direction?: string; amount?: number; balanceAfter?: number; reason?: string; createdAt?: string }

/** The signed-in customer's store credit balance and its ledger. Both are read for the session user only. */
export const StoreCreditScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/store-credit')
  const userId = Number(user.id)
  const balance = await creditBalance(userId)
  const ledger = (await (engine as unknown as { find: (a: unknown) => Promise<{ docs: LedgerRow[] }> })
    .find({ collection: 'credit-ledger', where: { and: [{ user: { equals: userId } }, { kind: { equals: 'store-credit' } }] }, sort: '-createdAt', limit: 50, depth: 0, overrideAccess: true })
    .catch(() => ({ docs: [] as LedgerRow[] }))).docs
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)

  return (
    <AccountShell title={tx('storeCredit.title')} current="/account/store-credit">
      <p>
        {tx('storeCredit.balance')} <strong>{formatAmount(balance, 'AUD', dateLocale)}</strong>
      </p>
      <p className="account-muted">{tx('storeCredit.note')}</p>
      {ledger.length === 0 ? (
        <p className="account-empty">{tx('storeCredit.empty')}</p>
      ) : (
        <table className="account-table eg-table">
          <thead>
            <tr>
              <th>{tx('storeCredit.colDate')}</th>
              <th>{tx('storeCredit.colActivity')}</th>
              <th>{tx('storeCredit.colAmount')}</th>
              <th>{tx('storeCredit.colBalance')}</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.createdAt ?? '', dateLocale)}</td>
                <td>{row.reason || (row.direction === 'credit' ? tx('storeCredit.creditAdded') : tx('storeCredit.creditUsed'))}</td>
                <td>
                  {row.direction === 'credit' ? '+' : '-'}
                  {formatAmount(row.amount ?? 0, 'AUD', dateLocale)}
                </td>
                <td>{formatAmount(row.balanceAfter ?? 0, 'AUD', dateLocale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AccountShell>
  )
}
