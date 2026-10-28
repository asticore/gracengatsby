import React from 'react'

import { AccountShell } from '@/features/accounts/components/AccountShell'
import { requireCustomer } from '@/features/accounts/guards'
import { formatAmount, formatDate, portalFormatLocale } from '@/features/accounts/orders'
import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { portalTextFor, type PortalStringKey } from '@/features/multilingual/portalStrings'
import { SUBSCRIPTION_STATUSES, type SubscriptionStatus } from '../plan'
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

const INTERVALS = ['day', 'week', 'month', 'year'] as const

/** The signed-in customer's own subscriptions, with pause, resume and cancel. Reads are limited to their own rows. */
export const MySubscriptionsScreen: React.FC<{ started: boolean }> = async ({ started }) => {
  const { engine, user } = await requireCustomer('/account/subscriptions')
  const userId = Number(user.id)
  const rows = (await (engine as unknown as { find: (a: unknown) => Promise<{ docs: Row[] }> })
    .find({ collection: 'product-subscriptions', where: { customer: { equals: userId } }, sort: '-createdAt', limit: 50, depth: 0, overrideAccess: true })
    .catch(() => ({ docs: [] as Row[] }))).docs
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)

  /** "every month" / "every 2 months", with the unit word in the right form for the language. */
  const intervalText = (interval: string, count: number): string => {
    const unit = (INTERVALS as readonly string[]).includes(interval) ? interval : 'month'
    const word = (form: 'one' | 'other') => tx(`interval.${unit}.${form}` as PortalStringKey)
    return count === 1
      ? tx('subscriptions.every', { unit: word('one') })
      : tx('subscriptions.everyCount', { count, unit: word('other') })
  }
  const statusLabel = (status: SubscriptionStatus): string =>
    (SUBSCRIPTION_STATUSES as readonly string[]).includes(status) ? tx(`subscriptionStatus.${status}` as PortalStringKey) : status

  return (
    <AccountShell title={tx('subscriptions.title')} current="/account/subscriptions">
      {started ? <p>{tx('subscriptions.started')}</p> : null}
      <p className="account-muted">{tx('subscriptions.note')}</p>
      {rows.length === 0 ? (
        <p className="account-empty">{tx('subscriptions.empty')}</p>
      ) : (
        <table className="account-table eg-table">
          <thead>
            <tr>
              <th>{tx('subscriptions.colProduct')}</th>
              <th>{tx('subscriptions.colPrice')}</th>
              <th>{tx('orders.colStatus')}</th>
              <th>{tx('subscriptions.colNext')}</th>
              <th>{tx('subscriptions.colPayments')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.productName || tx('subscriptions.fallbackProduct')}</td>
                <td>
                  {formatAmount(row.amountCents ?? 0, row.currency ?? 'AUD', dateLocale)} {intervalText(row.billingInterval ?? 'month', row.billingIntervalCount ?? 1)}
                </td>
                <td>{statusLabel(row.status)}</td>
                <td>{row.nextPaymentAt && row.status !== 'cancelled' ? formatDate(row.nextPaymentAt, dateLocale) : '-'}</td>
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
