import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import type { Product } from '@/engage-types'

import { addressForCustomer, addressesForCustomer } from '../addresses'
import { bookingsForCustomer } from '../bookings'
import { requireCustomer } from '../guards'
import { formatAmount, formatDate, orderForCustomer, ordersForCustomer } from '../orders'
import { readPreferences } from '../preferences'
import { AccountShell } from './AccountShell'
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
          <table className="account-table">
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
        <table className="account-table">
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
                <td>{order.status ?? '-'}</td>
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

  return (
    <AccountShell title={`Order #${order.id}`} current="/account/orders">
      <p>
        Placed {formatDate(order.createdAt)} · {order.status ?? 'processing'} ·{' '}
        {formatAmount(order.amount, order.currency)}
      </p>

      <section className="account-section">
        <h2>Items</h2>
        {lines.length === 0 ? (
          <p className="account-empty">No items were recorded on this order.</p>
        ) : (
          <table className="account-table">
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

      <div className="account-link-row">
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

export const ProfileScreen: React.FC = async () => {
  const { engine, user } = await requireCustomer('/account/profile')
  const preferences = await readPreferences(engine, user)
  const email = typeof user.email === 'string' ? user.email : ''

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
        <PasswordForm />
      </section>
    </AccountShell>
  )
}
