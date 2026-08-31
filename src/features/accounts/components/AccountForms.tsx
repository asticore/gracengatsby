'use client'

import React, { useActionState } from 'react'

import {
  changeEmailAction,
  changePasswordAction,
  deleteAddressAction,
  saveAddressAction,
  saveNameAction,
  setDefaultAddressAction,
  signOutAction,
} from '../actions'
import type { AddressInput } from '../addresses'
import { IDLE, type ActionState } from '../types'
import { Note, SubmitButton } from './FormBits'

/**
 * The signed-in forms.
 *
 * The address form carries the id of the row being edited, which looks like
 * something to worry about and is not: the id names a row, the collection
 * decides whether this customer may touch it, and an id belonging to somebody
 * else comes back as "could not be saved" because the update matched nothing.
 */

export const SignOutButton: React.FC = () => (
  <form action={signOutAction}>
    <SubmitButton variant="ghost">Sign out</SubmitButton>
  </form>
)

const COUNTRY_HINT = 'Two-letter country code, e.g. AU'

export const AddressForm: React.FC<{ address?: (AddressInput & { id?: number }) | null }> = ({
  address,
}) => {
  const [state, action] = useActionState<ActionState, FormData>(saveAddressAction, IDLE)

  return (
    <form action={action} className="account-form">
      {address?.id ? <input type="hidden" name="id" value={address.id} /> : null}
      <label>
        Label (optional)
        <input name="title" defaultValue={address?.title ?? ''} placeholder="Home" />
      </label>
      <div className="account-form__row">
        <label>
          First name
          <input name="firstName" defaultValue={address?.firstName ?? ''} required />
        </label>
        <label>
          Last name
          <input name="lastName" defaultValue={address?.lastName ?? ''} required />
        </label>
      </div>
      <label>
        Company (optional)
        <input name="company" defaultValue={address?.company ?? ''} />
      </label>
      <label>
        Street address
        <input name="addressLine1" defaultValue={address?.addressLine1 ?? ''} required />
      </label>
      <label>
        Apartment, suite (optional)
        <input name="addressLine2" defaultValue={address?.addressLine2 ?? ''} />
      </label>
      <div className="account-form__row">
        <label>
          City
          <input name="city" defaultValue={address?.city ?? ''} required />
        </label>
        <label>
          State
          <input name="state" defaultValue={address?.state ?? ''} />
        </label>
      </div>
      <div className="account-form__row">
        <label>
          Postcode
          <input name="postalCode" defaultValue={address?.postalCode ?? ''} />
        </label>
        <label>
          Country
          <input
            name="country"
            defaultValue={address?.country ?? 'AU'}
            maxLength={2}
            title={COUNTRY_HINT}
            required
          />
        </label>
      </div>
      <label>
        Phone (optional)
        <input name="phone" type="tel" defaultValue={address?.phone ?? ''} />
      </label>
      <Note state={state} />
      <SubmitButton>{address?.id ? 'Save changes' : 'Add address'}</SubmitButton>
    </form>
  )
}

export const AddressRowActions: React.FC<{ id: number; isDefault: boolean }> = ({
  id,
  isDefault,
}) => {
  const [defaultState, makeDefault] = useActionState<ActionState, FormData>(
    setDefaultAddressAction,
    IDLE,
  )
  const [deleteState, remove] = useActionState<ActionState, FormData>(deleteAddressAction, IDLE)

  return (
    <>
      <div className="account-card__actions">
        <a className="btn btn--ghost" href={`/account/addresses/${id}`}>
          Edit
        </a>
        {!isDefault && (
          <form action={makeDefault}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="ghost">Make default</SubmitButton>
          </form>
        )}
        <form action={remove}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost">Remove</SubmitButton>
        </form>
      </div>
      <Note state={defaultState} />
      <Note state={deleteState} />
    </>
  )
}

export const NameForm: React.FC<{ name: string }> = ({ name }) => {
  const [state, action] = useActionState<ActionState, FormData>(saveNameAction, IDLE)
  return (
    <form action={action} className="account-form">
      <label>
        Name
        <input name="name" defaultValue={name} autoComplete="name" />
      </label>
      <Note state={state} />
      <SubmitButton>Save name</SubmitButton>
    </form>
  )
}

export const EmailForm: React.FC<{ email: string }> = ({ email }) => {
  const [state, action] = useActionState<ActionState, FormData>(changeEmailAction, IDLE)
  return (
    <form action={action} className="account-form">
      <label>
        Email
        <input name="email" type="email" defaultValue={email} autoComplete="email" required />
      </label>
      <label>
        Current password
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <Note state={state} />
      <SubmitButton>Change email</SubmitButton>
    </form>
  )
}

export const PasswordForm: React.FC = () => {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, IDLE)
  return (
    <form action={action} className="account-form">
      <label>
        Current password
        <input name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label>
        New password
        <input name="password" type="password" autoComplete="new-password" minLength={8} required />
      </label>
      <label>
        Confirm new password
        <input
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <Note state={state} />
      <SubmitButton>Change password</SubmitButton>
    </form>
  )
}
