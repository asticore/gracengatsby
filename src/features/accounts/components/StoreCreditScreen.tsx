import React from 'react'

import { creditBalance } from '@/features/ecommerce/server/storedValue'

import { requireCustomer } from '../guards'
import { formatAmount, formatDate } from '../orders'
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

  return (
    <AccountShell title="Store credit" current="/account/store-credit">
      <p>
        Your balance: <strong>{formatAmount(balance, 'AUD')}</strong>
      </p>
      <p className="account-muted">Store credit is applied at checkout when you choose to use it. It can pay for any order, including courses and memberships.</p>
      {ledger.length === 0 ? (
        <p className="account-empty">No store credit activity yet.</p>
      ) : (
        <table className="account-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity</th>
              <th>Amount</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.id}>
                <td>{formatDate(row.createdAt ?? '')}</td>
                <td>{row.reason || (row.direction === 'credit' ? 'Credit added' : 'Credit used')}</td>
                <td>
                  {row.direction === 'credit' ? '+' : '-'}
                  {formatAmount(row.amount ?? 0, 'AUD')}
                </td>
                <td>{formatAmount(row.balanceAfter ?? 0, 'AUD')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AccountShell>
  )
}
