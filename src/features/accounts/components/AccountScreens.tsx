import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Product } from '@/engage-types'

import { addressForCustomer, addressesForCustomer } from '../addresses'
import { bookingsForCustomer } from '../bookings'
import { ORDERS_SLUG } from '../types'
import { requireCustomer } from '../guards'
import { formatAmount, formatDate, orderForCustomer, ordersForCustomer, portalFormatLocale } from '../orders'
import { readPreferences } from '../preferences'
import { isOrderStatus } from '@/features/ecommerce/lib/orderStatus'
import { ReorderButton } from './ReorderButton'
import { AccountShell } from './AccountShell'
import { TwoFactorPanel } from '@/features/security/components/TwoFactorPanel'
import { PasskeysPanel } from '@/features/passkeys/components/PasskeysPanel'
import { listPasskeys } from '@/features/passkeys'
import { passkeyDepsFor } from '../passkeysWiring'
import { listMyApiKeys } from '@/features/apiKeys/actions'
import { ApiKeysPanel } from '@/features/apiKeys/components/ApiKeysPanel'
import { SessionsPanel } from '@/features/security/components/SessionsPanel'
import { viewOwnSessions, type SessionActor } from '@/features/security/userSessionService'
import { defaultUserSessionStore } from '@/features/security/userSessionStore'
import { sessionIdFromToken } from '@/features/security/userSessions'
import { currentSessionToken, requestClient } from '../session'
import { assertTwoFactorSatisfied, backupCodesRemaining, graceNoticeFor, isEnrolled, twoFactorStatus } from '@/features/security/twoFactor'
import { defaultTwoFactorStore } from '@/features/security/twoFactorStore'
import { getSecuritySettings } from '@/features/security/settings'
import { passwordRulesOf } from '@/features/security/passwordCheck'
import { DEFAULT_PASSWORD_POLICY } from '@/features/security/passwordPolicyDefaults'
import { ConnectedAccountsPanel } from '@/features/socialLogin/components/ConnectedAccountsPanel'
import { viewConnections } from '@/features/socialLogin/connections'
import { socialMessageText } from '../messages'
import { accountTexts } from '../portalCopy'
import { AddressForm, AddressRowActions, EmailForm, LanguageForm, NameForm, PasswordForm, type LanguageOption } from './AccountForms'
import { readMultilingualSettingsFromD1 } from '@/features/multilingual/settings'
import { isLocaleRoutable } from '@/features/multilingual/routing'
import { localeNativeName } from '@/features/multilingual/locales'
import { portalText, portalTextFor, type PortalStringKey } from '@/features/multilingual/portalStrings'
import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'

/**
 * The signed-in screens.
 *
 * Every one of them starts at `requireCustomer`, which 404s when the feature
 * is off and redirects to sign-in when nobody is signed in, and every query
 * they make is access-enforced against that same session user. There is no
 * "belongs to me?" test anywhere in this file, because there is nothing here
 * that could have been fetched if it did not.
 */

const statusLabel = (status: string | null | undefined, locale: string | null): string =>
  status && isOrderStatus(status) ? portalText(`orderStatus.${status}` as PortalStringKey, locale) : (status ?? '-')

const displayName = (name: string, email: string): string => name || email

/** "Two-factor required in N days" while a customer is inside the grace period and not enrolled. Null otherwise. */
const twoFactorGraceNoticeFor = async (engine: Parameters<typeof getSecuritySettings>[0], user: unknown) => {
  const settings = await getSecuritySettings(engine as never).catch((): null => null)
  return settings ? graceNoticeFor(twoFactorStatus(user as never, settings)) : null
}

export const AccountHomeScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account')
  const [preferences, orders, bookings] = await Promise.all([
    readPreferences(engine, user),
    ordersForCustomer(engine, user, 3),
    bookingsForCustomer(engine, user),
  ])

  const email = typeof user.email === 'string' ? user.email : ''
  const graceNotice = await twoFactorGraceNoticeFor(engine, user)
  const tx = await accountTexts()

  return (
    <AccountShell title={tx('account.hello', { name: displayName(preferences.name, email) })} current="/account">
      {graceNotice && <p className="account-note"><a href={graceNotice.href}>{graceNotice.text}</a></p>}
      <section className="account-section">
        <h2>{tx('account.recentOrders')}</h2>
        {orders.length === 0 ? (
          <p className="account-empty">{tx('account.noOrders')}</p>
        ) : (
          <table className="account-table eg-table">
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/account/orders/${order.id}`}>Order #{order.id}</Link>
                  </td>
                  <td>{formatDate(order.createdAt)}</td>
                  <td>{formatAmount(order.amount, order.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="account-link-row">
          <Link href="/account/orders">{tx('account.allOrders')}</Link>
        </div>
      </section>

      <section className="account-section">
        <h2>{tx('account.upcomingBookings')}</h2>
        {bookings.length === 0 ? (
          <p className="account-empty">{tx('account.noBookings')}</p>
        ) : (
          <p>
            {tx('account.bookingsCount', { count: bookings.length })} <Link href="/account/bookings">{tx('account.seeThem')}</Link>.
          </p>
        )}
      </section>
    </AccountShell>
  )
}

export const OrdersScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/orders')
  const orders = await ordersForCustomer(engine, user)
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)

  return (
    <AccountShell title={tx('orders.title')} current="/account/orders">
      {orders.length === 0 ? (
        <p className="account-empty">{tx('orders.empty')}</p>
      ) : (
        <table className="account-table eg-table">
          <thead>
            <tr>
              <th>{tx('orders.colOrder')}</th>
              <th>{tx('orders.colPlaced')}</th>
              <th>{tx('orders.colStatus')}</th>
              <th>{tx('orders.colTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/account/orders/${order.id}`}>{tx('orders.numberLink', { id: order.id })}</Link>
                </td>
                <td>{formatDate(order.createdAt, dateLocale)}</td>
                <td>{statusLabel(order.status, portalLocale)}</td>
                <td>{formatAmount(order.amount, order.currency, dateLocale)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AccountShell>
  )
}

/**
 * One order.
 *
 * The id comes from the URL and is handed straight to an access-enforced
 * fetch. Another customer's id returns nothing, and nothing is a 404 - the
 * same answer an id that never existed gets, so the address bar cannot be used
 * to count orders either.
 */
export const OrderScreen: React.FC<{ id: string }> = async ({ id }) => {
  const { engine, user } = await requireCustomer(`/account/orders/${id}`)
  const order = await orderForCustomer(engine, user, id)
  if (!order) notFound()

  const shipping = order.shippingAddress
  const lines = order.items ?? []
  // Ownership was just proven by the access-enforced read above, so the customer-visible
  // notes can be read with access overridden. Internal notes are never selected.
  const full = (await engine
    .findByID({ collection: ORDERS_SLUG, id: order.id, depth: 0, overrideAccess: true })
    .catch((): null => null)) as unknown as {
    notes?: { type: string; text: string; createdAt: string }[]
    subtotal?: number
    discountTotal?: number
    shippingTotal?: number
    taxTotal?: number
    pricesIncludeTax?: boolean
  } | null
  const notes = (full?.notes ?? []).filter((n) => n.type === 'customer')
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)
  const money = (value?: number | null) => formatAmount(value, order.currency, dateLocale)
  const reorder = lines
    .map((l) => ({ product: typeof l.product === 'object' && l.product ? Number((l.product as { id: number }).id) : Number(l.product), quantity: l.quantity }))
    .filter((l) => l.product > 0)

  return (
    <AccountShell title={tx('orders.detailTitle', { id: order.id })} current="/account/orders">
      <p>
        {tx('orders.placedSummary', {
          date: formatDate(order.createdAt, dateLocale),
          status: statusLabel(order.status ?? 'processing', portalLocale),
          total: money(order.amount),
        })}
      </p>

      <section className="account-section">
        <h2>{tx('orders.itemsHeading')}</h2>
        {lines.length === 0 ? (
          <p className="account-empty">{tx('orders.noItems')}</p>
        ) : (
          <table className="account-table eg-table">
            <tbody>
              {lines.map((line, index) => {
                const product = line.product
                const title =
                  product && typeof product === 'object'
                    ? ((product as Product).title ?? tx('orders.itemFallback'))
                    : tx('orders.itemFallback')
                return (
                  <tr key={line.id ?? index}>
                    <td>{title}</td>
                    <td>{tx('orders.quantity', { quantity: line.quantity })}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {shipping?.addressLine1 ? (
        <section className="account-section">
          <h2>{tx('orders.shippedTo')}</h2>
          <p>
            {[shipping.firstName, shipping.lastName].filter(Boolean).join(' ')}
            <br />
            {shipping.addressLine1}
            {shipping.addressLine2 ? (
              <>
                <br />
                {shipping.addressLine2}
              </>
            ) : null}
            <br />
            {[shipping.city, shipping.state, shipping.postalCode].filter(Boolean).join(' ')}
            <br />
            {shipping.country}
          </p>
        </section>
      ) : null}

      {full && typeof full.subtotal === 'number' ? (
        <section className="account-section">
          <h2>{tx('orders.totalsHeading')}</h2>
          <p>
            {tx('orders.subtotal', { amount: money(full.subtotal) })}
            {full.discountTotal ? <> · {tx('orders.discount', { amount: money(full.discountTotal) })}</> : null}
            {full.shippingTotal ? <> · {tx('orders.shipping', { amount: money(full.shippingTotal) })}</> : null}
            {full.taxTotal ? <> · {tx(full.pricesIncludeTax ? 'orders.gstIncluded' : 'orders.gst', { amount: money(full.taxTotal) })}</> : null}
            {' '}· <strong>{tx('orders.total', { amount: money(order.amount) })}</strong>
          </p>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section className="account-section">
          <h2>{tx('orders.notesHeading')}</h2>
          {notes.map((n, i) => (
            <p key={i}>
              {n.text}
              <br />
              <small>{formatDate(n.createdAt)}</small>
            </p>
          ))}
        </section>
      ) : null}

      <div className="account-link-row">
        <ReorderButton items={reorder} />
        <Link href="/account/orders">{tx('orders.backToOrders')}</Link>
      </div>
    </AccountShell>
  )
}

export const AddressesScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/addresses')
  const addresses = await addressesForCustomer(engine, user)
  const tx = await accountTexts()

  return (
    <AccountShell title={tx('addresses.title')} current="/account/addresses">
      <section className="account-section">
        {addresses.length === 0 ? (
          <p className="account-empty">{tx('addresses.empty')}</p>
        ) : (
          addresses.map((address) => (
            <article className="account-card" key={address.id}>
              <h3>
                {address.title || [address.firstName, address.lastName].filter(Boolean).join(' ')}{' '}
                {address.isDefault ? <span className="account-badge">{tx('addresses.default')}</span> : null}
              </h3>
              <p>
                {address.addressLine1}
                {address.addressLine2 ? `, ${address.addressLine2}` : ''}
              </p>
              <p>
                {[address.city, address.state, address.postalCode, address.country]
                  .filter(Boolean)
                  .join(' ')}
              </p>
              <AddressRowActions id={address.id} isDefault={address.isDefault} />
            </article>
          ))
        )}
      </section>

      <section className="account-section">
        <h2>{tx('addresses.add')}</h2>
        <AddressForm />
      </section>
    </AccountShell>
  )
}

export const AddressEditScreen: React.FC<{ id: string }> = async ({ id }) => {
  const { engine, user } = await requireCustomer(`/account/addresses/${id}`)
  const address = await addressForCustomer(engine, user, id)
  if (!address) notFound()
  const tx = await accountTexts()

  return (
    <AccountShell title={tx('addresses.editTitle')} current="/account/addresses">
      <AddressForm
        address={{
          id: address.id,
          title: address.title ?? undefined,
          firstName: address.firstName ?? undefined,
          lastName: address.lastName ?? undefined,
          company: address.company ?? undefined,
          addressLine1: address.addressLine1 ?? undefined,
          addressLine2: address.addressLine2 ?? undefined,
          city: address.city ?? undefined,
          state: address.state ?? undefined,
          postalCode: address.postalCode ?? undefined,
          country: address.country ?? undefined,
          phone: address.phone ?? undefined,
        }}
      />
      <div className="account-link-row">
        <Link href="/account/addresses">{tx('addresses.backLink')}</Link>
      </div>
    </AccountShell>
  )
}

export const BookingsScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/bookings')
  const bookings = await bookingsForCustomer(engine, user)
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)

  return (
    <AccountShell title={tx('bookings.title')} current="/account/bookings">
      {bookings.length === 0 ? (
        <p className="account-empty">{tx('bookings.empty')}</p>
      ) : (
        bookings.map((booking) => (
          <article className="account-card" key={booking.id}>
            <h3>
              {booking.eventSlug ? (
                <Link href={`/events/${booking.eventSlug}`}>{booking.eventTitle}</Link>
              ) : (
                booking.eventTitle
              )}
            </h3>
            <p>{formatDate(booking.eventDate, dateLocale)}</p>
            <p>{tx('bookings.guests', { count: booking.guestCount ?? 1, date: formatDate(booking.createdAt, dateLocale) })}</p>
          </article>
        ))
      )}
    </AccountShell>
  )
}

export const ProfileScreen: React.FC<{ socialError?: string; passwordDue?: boolean }> = async ({ socialError, passwordDue }) => {
  const { engine, user } = await requireCustomer('/account/profile')
  const preferences = await readPreferences(engine, user)
  // Shown only while multilingual is on with two or more languages. Otherwise the profile is unchanged.
  const multilingual = await readMultilingualSettingsFromD1()
  const tx = await accountTexts()
  const languageOptions: LanguageOption[] | null = isLocaleRoutable(multilingual)
    ? [
        { value: '', label: tx('profile.languageAuto') },
        ...multilingual.activeLocales.map((code) => ({ value: code, label: localeNativeName(code) })),
      ]
    : null
  const email = typeof user.email === 'string' ? user.email : ''
  const secure = await defaultTwoFactorStore.findByID(Number(user.id)).catch((): null => null)
  const settings = await getSecuritySettings(engine as never).catch((): null => null)
  // Off unless the owner turned passkeys on: nothing new shows for existing sites.
  const passkeyDeps = await passkeyDepsFor(engine, await requestClient(), '').catch((): null => null)
  const passkeysOn = Boolean(passkeyDeps && passkeyDeps.settings.enabled && passkeyDeps.secret)
  const passkeyItems = passkeyDeps && passkeysOn ? await listPasskeys(passkeyDeps, Number(user.id)) : []
  const sessions = await viewOwnSessions(
    { store: defaultUserSessionStore, record: async (): Promise<void> => undefined, limited: () => false },
    user as unknown as SessionActor,
    sessionIdFromToken(await currentSessionToken()),
  ).catch((): [] => [])
  const connections = await viewConnections(engine, user as never).catch((): null => null)
  const securityNotice =
    settings && assertTwoFactorSatisfied(user as never, settings).mustEnrol ? tx('profile.twoStepNotice') : ''
  const graceNotice = await twoFactorGraceNoticeFor(engine, user)

  return (
    <AccountShell title={tx('profile.title')} current="/account/profile">
      <section className="account-section">
        <h2>{tx('profile.name')}</h2>
        <NameForm name={preferences.name} />
      </section>

      {languageOptions && (
        <section className="account-section">
          <h2>{tx('profile.language')}</h2>
          <LanguageForm
            current={preferences.locale ?? ''}
            options={languageOptions}
            labels={{ heading: tx('profile.language'), save: tx('profile.languageSave') }}
          />
        </section>
      )}

      <section className="account-section">
        <h2>{tx('profile.emailHeading')}</h2>
        <p>{tx('profile.emailNote')}</p>
        <EmailForm email={email} />
      </section>

      <section className="account-section">
        <h2>{tx('auth.password')}</h2>
        {passwordDue ? (
          <p className="account-note account-note--error">{tx('profile.passwordDue')}</p>
        ) : null}
        <PasswordForm rules={passwordRulesOf(settings?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY)} />
      </section>

      <section className="account-section" id="security">
        <h2>{tx('profile.securityHeading')}</h2>
        <h3>{tx('profile.twoStepHeading')}</h3>
        {securityNotice && <p className="account-note account-note--error">{securityNotice}</p>}
        {graceNotice && <p className="account-note"><a href={graceNotice.href}>{graceNotice.text}</a></p>}
        <TwoFactorPanel enrolled={isEnrolled(secure)} backupCodesLeft={secure ? backupCodesRemaining(secure) : 0} />
        {passkeysOn && (
          <>
            <h3>{tx('profile.passkeysHeading')}</h3>
            <p>{tx('profile.passkeysIntro')}</p>
            <PasskeysPanel initial={passkeyItems} />
          </>
        )}
        {settings?.apiKeys.enabled && settings.apiKeys.allowCustomers && (
          <>
            <h3>{tx('profile.apiKeysHeading')}</h3>
            <p>{tx('profile.apiKeysIntro')}</p>
            <ApiKeysPanel initial={(await listMyApiKeys()).keys ?? []} />
          </>
        )}
      </section>

      {connections && (connections.linked.length > 0 || connections.available.length > 0) && (
        <section className="account-section" id="connected">
          <h2>{tx('profile.connectedHeading')}</h2>
          <p>{tx('profile.connectedIntro')}</p>
          <ConnectedAccountsPanel view={connections} area="account" returnTo="/account/profile" notice={socialMessageText(socialError, tx)} />
        </section>
      )}

      <section className="account-section" id="sessions">
        <h2>{tx('profile.sessionsHeading')}</h2>
        <SessionsPanel sessions={sessions} />
      </section>
    </AccountShell>
  )
}