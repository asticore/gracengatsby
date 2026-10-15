import React from 'react'

import { AccountShell } from '@/features/accounts/components/AccountShell'
import { requireCustomer } from '@/features/accounts/guards'
import { formatAmount, formatDate } from '@/features/accounts/orders'
import { SUBSCRIPTION_STATUS_LABELS, intervalPhrase, type SubscriptionStatus } from '../plan'
import { SubscriptionActions } from './SubscriptionActions'

type Row = {
  id: number
  productName?: string | null
  status: SubscriptionStatus
  amountCents?: number | null
  currency?: string | null
  billingInterval?: string | null
  billingIntervalCount?: number | null
  paymentsMade?: number | null
  nextPaymentAt?: string | null
  trialEndsAt?: string | null
}

/** The signed-in customer's own subscriptions, with pause, resume and cancel. Reads are limited to their own rows. */
export const MySubscriptionsScreen: React.FC<{ started: boolean }> = async ({ started }) => {
  const { engine, user } = await requireCustomer('/account/subscriptions')
  const userId = Number(user.id)
  const rows = (await (engine as unknown as { find: (a: unknown) => Promise<{ docs: Row[] }> })
    .find({ collection: 'product-subscriptions', where: { customer: { equals: userId } }, sort: '-createdAt', limit: 50, depth: 0, overrideAccess: true })
    .catch(() => ({ docs: [] as Row[] }))).docs

  return (
    <AccountShell title="My subscriptions" current="/account/subscriptions">
      {started ? <p>Thanks. Your subscription is being set up and will show here shortly.</p> : null}
      <p className="account-muted">Subscriptions are paid by card. Tax and shipping are not added to renewal payments.</p>
      {rows.length === 0 ? (
        <p className="account-empty">You have no subscriptions yet.</p>
      ) : (
        <table className="account-table eg-table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Status</th>
              <th>Next payment</th>
              <th>Payments</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.productName || 'Subscription'}</td>
                <td>
                  {formatAmount(row.amountCents ?? 0, row.currency ?? 'AUD')} {intervalPhrase((row.billingInterval as never) ?? 'month', row.billingIntervalCount ?? 1)}
                </td>
                <td>{SUBSCRIPTION_STATUS_LABELS[row.status] ?? row.status}</td>
                <td>{row.nextPaymentAt && row.status !== 'cancelled' ? formatDate(row.nextPaymentAt) : '-'}</td>
                <td>{row.paymentsMade ?? 0}</td>
                <td>
                  <SubscriptionActions id={row.id} status={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AccountShell>
  )
}