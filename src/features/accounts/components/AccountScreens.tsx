import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Product } from '@/engage-types'

import { addressForCustomer, addressesForCustomer } from '../addresses'
import { bookingsForCustomer } from '../bookings'
import { ORDERS_SLUG } from '../types'
import { requireCustomer } from '../guards'
import { formatAmount, formatDate, orderForCustomer, ordersForCustomer } from '../orders'
import { readPreferences } from '../preferences'
import { ORDER_STATUS_LABELS, isOrderStatus } from '@/features/ecommerce/lib/orderStatus'
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
import { assertTwoFactorSatisfied, backupCodesRemaining, isEnrolled } from '@/features/security/twoFactor'
import { defaultTwoFactorStore } from '@/features/security/twoFactorStore'
import { getSecuritySettings } from '@/features/security/settings'
import { passwordRulesOf } from '@/features/security/passwordCheck'
import { DEFAULT_PASSWORD_POLICY } from '@/features/security/passwordPolicyDefaults'
import { ConnectedAccountsPanel } from '@/features/socialLogin/components/ConnectedAccountsPanel'
import { viewConnections } from '@/features/socialLogin/connections'
import { socialMessage } from '@/features/socialLogin/messages'
import { AddressForm, AddressRowActions, EmailForm, NameForm, PasswordForm } from './AccountForms'

/**
 * The signed-in screens.
 *
 * Every one of them starts at `requireCustomer`, which 404s when the feature
 * is off and redirects to sign-in when nobody is signed in, and every query
 * they make is access-enforced against that same session user. There is no
 * "belongs to me?" test anywhere in this file, because there is nothing here
 * that could have been fetched if it did not.
 */

const statusLabel = (status?: string | null): string => (status && isOrderStatus(status) ? ORDER_STATUS_LABELS[status] : (status ?? '-'))

const displayName = (name: string, email: string): string => name || email

export const AccountHomeScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account')
  const [preferences, orders, bookings] = await Promise.all([
    readPreferences(engine, user),
    ordersForCustomer(engine, user, 3),
    bookingsForCustomer(engine, user),
  ])

  const email = typeof user.email === 'string' ? user.email : ''

  return (
    <AccountShell title={`Hello, ${displayName(preferences.name, email)}`} current="/account">
      <section className="account-section">
        <h2>Recent orders</h2>
        {orders.length === 0 ? (
          <p className="account-empty">You have not placed an order yet.</p>
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
          <Link href="/account/orders">All orders</Link>
        </div>
      </section>

      <section className="account-section">
        <h2>Upcoming bookings</h2>
        {bookings.length === 0 ? (
          <p className="account-empty">You have no event bookings.</p>
        ) : (
          <p>
            You have {bookings.length} booking(s). <Link href="/account/bookings">See them</Link>.
          </p>
        )}
      </section>
    </AccountShell>
  )
}

export const OrdersScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/orders')
  const orders = await ordersForCustomer(engine, user)

  return (
    <AccountShell title="Your orders" current="/account/orders">
      {orders.length === 0 ? (
        <p className="account-empty">You have not placed an order yet.</p>
      ) : (
        <table className="account-table eg-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Status</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id}>
                <td>
                  <Link href={`/account/orders/${order.id}`}>#{order.id}</Link>
                </td>
                <td>{formatDate(order.createdAt)}</td>
                <td>{statusLabel(order.status)}</td>
                <td>{formatAmount(order.amount, order.currency)}</td>
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
  const reorder = lines
    .map((l) => ({ product: typeof l.product === 'object' && l.product ? Number((l.product as { id: number }).id) : Number(l.product), quantity: l.quantity }))
    .filter((l) => l.product > 0)

  return (
    <AccountShell title={`Order #${order.id}`} current="/account/orders">
      <p>
        Placed {formatDate(order.createdAt)} · {statusLabel(order.status ?? 'processing')} ·{' '}
        {formatAmount(order.amount, order.currency)}
      </p>

      <section className="account-section">
        <h2>Items</h2>
        {lines.length === 0 ? (
          <p className="account-empty">No items were recorded on this order.</p>
        ) : (
          <table className="account-table eg-table">
            <tbody>
              {lines.map((line, index) => {
                const product = line.product
                const title =
                  product && typeof product === 'object'
                    ? ((product as Product).title ?? 'Item')
                    : 'Item'
                return (
                  <tr key={line.id ?? index}>
                    <td>{title}</td>
                    <td>× {line.quantity}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      {shipping?.addressLine1 ? (
        <section className="account-section">
          <h2>Shipped to</h2>
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
          <h2>Totals</h2>
          <p>
            Subtotal {formatAmount(full.subtotal, order.currency)}
            {full.discountTotal ? <> · Discount -{formatAmount(full.discountTotal, order.currency)}</> : null}
            {full.shippingTotal ? <> · Shipping {formatAmount(full.shippingTotal, order.currency)}</> : null}
            {full.taxTotal ? <> · GST {full.pricesIncludeTax ? 'included' : ''} {formatAmount(full.taxTotal, order.currency)}</> : null}
            {' '}· <strong>Total {formatAmount(order.amount, order.currency)}</strong>
          </p>
        </section>
      ) : null}

      {notes.length > 0 ? (
        <section className="account-section">
          <h2>Notes from the shop</h2>
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
        <Link href="/account/orders">Back to orders</Link>
      </div>
    </AccountShell>
  )
}

export const AddressesScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/addresses')
  const addresses = await addressesForCustomer(engine, user)

  return (
    <AccountShell title="Saved addresses" current="/account/addresses">
      <section className="account-section">
        {addresses.length === 0 ? (
          <p className="account-empty">You have not saved an address yet.</p>
        ) : (
          addresses.map((address) => (
            <article className="account-card" key={address.id}>
              <h3>
                {address.title || [address.firstName, address.lastName].filter(Boolean).join(' ')}{' '}
                {address.isDefault ? <span className="account-badge">Default</span> : null}
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
        <h2>Add an address</h2>
        <AddressForm />
      </section>
    </AccountShell>
  )
}

export const AddressEditScreen: React.FC<{ id: string }> = async ({ id }) => {
  const { engine, user } = await requireCustomer(`/account/addresses/${id}`)
  const address = await addressForCustomer(engine, user, id)
  if (!address) notFound()

  return (
    <AccountShell title="Edit address" current="/account/addresses">
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
        <Link href="/account/addresses">Back to addresses</Link>
      </div>
    </AccountShell>
  )
}

export const BookingsScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/bookings')
  const bookings = await bookingsForCustomer(engine, user)

  return (
    <AccountShell title="Event bookings" current="/account/bookings">
      {bookings.length === 0 ? (
        <p className="account-empty">You have not booked onto an event.</p>
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
            <p>{formatDate(booking.eventDate)}</p>
            <p>
              {booking.guestCount ?? 1} guest(s) · booked {formatDate(booking.createdAt)}
            </p>
          </article>
        ))
      )}
    </AccountShell>
  )
}

export const ProfileScreen: React.FC<{ socialError?: string; passwordDue?: boolean }> = async ({ socialError, passwordDue }) => {
  const { engine, user } = await requireCustomer('/account/profile')
  const preferences = await readPreferences(engine, user)
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
    settings && assertTwoFactorSatisfied(user as never, settings).mustEnrol
      ? 'This site asks customers to set up two-step sign-in. Please do it below.'
      : ''

  return (
    <AccountShell title="Your profile" current="/account/profile">
      <section className="account-section">
        <h2>Name</h2>
        <NameForm name={preferences.name} />
      </section>

      <section className="account-section">
        <h2>Email address</h2>
        <p>Changing this changes what you sign in with.</p>
        <EmailForm email={email} />
      </section>

      <section className="account-section">
        <h2>Password</h2>
        {passwordDue ? (
          <p className="account-note account-note--error">
            This site asks you to choose a new password now. Please do it below.
          </p>
        ) : null}
        <PasswordForm rules={passwordRulesOf(settings?.passwordPolicy ?? DEFAULT_PASSWORD_POLICY)} />
      </section>

      <section className="account-section" id="security">
        <h2>Security</h2>
        <h3>Two-step sign-in</h3>
        {securityNotice && <p className="account-note account-note--error">{securityNotice}</p>}
        <TwoFactorPanel enrolled={isEnrolled(secure)} backupCodesLeft={secure ? backupCodesRemaining(secure) : 0} />
        {passkeysOn && (
          <>
            <h3>Passkeys</h3>
            <p>Sign in with Face ID, Touch ID, Windows Hello or a security key. A passkey is an extra way in; your password still works.</p>
            <PasskeysPanel initial={passkeyItems} />
          </>
        )}
        {settings?.apiKeys.enabled && settings.apiKeys.allowCustomers && (
          <>
            <h3>API keys</h3>
            <p>Let a script call the site API as you, with a key limited to read and/or write. Shown once at creation.</p>
            <ApiKeysPanel initial={(await listMyApiKeys()).keys ?? []} />
          </>
        )}
      </section>

      {connections && (connections.linked.length > 0 || connections.available.length > 0) && (
        <section className="account-section" id="connected">
          <h2>Connected accounts</h2>
          <p>Sign in faster with an account you already have.</p>
          <ConnectedAccountsPanel view={connections} area="account" returnTo="/account/profile" notice={socialError ? socialMessage(socialError) : ''} />
        </section>
      )}

      <section className="account-section" id="sessions">
        <h2>Signed-in devices</h2>
        <SessionsPanel sessions={sessions} />
      </section>
    </AccountShell>
  )
}