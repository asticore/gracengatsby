'use client'

import React, { useActionState } from 'react'

import type { PasswordRules } from './AuthForms'

import {
  changeEmailAction,
  changePasswordAction,
  deleteAddressAction,
  saveAddressAction,
  saveLanguageAction,
  saveNameAction,
  setDefaultAddressAction,
  signOutAction,
} from '../actions'
import type { AddressInput } from '../addresses'
import { IDLE, type ActionState } from '../types'
import { Note, SubmitButton } from './FormBits'
import { usePortalText } from './PortalText'

/**
 * The signed-in forms.
 *
 * The address form carries the id of the row being edited, which looks like
 * something to worry about and is not: the id names a row, the collection
 * decides whether this customer may touch it, and an id belonging to somebody
 * else comes back as "could not be saved" because the update matched nothing.
 */

export const SignOutButton: React.FC = () => {
  const tx = usePortalText()
  return (
    <form action={signOutAction}>
      <SubmitButton variant="ghost">{tx('common.signOut')}</SubmitButton>
    </form>
  )
}

export const AddressForm: React.FC<{ address?: (AddressInput & { id?: number }) | null }> = ({
  address,
}) => {
  const [state, action] = useActionState<ActionState, FormData>(saveAddressAction, IDLE)
  const tx = usePortalText()

  return (
    <form action={action} className="account-form">
      {address?.id ? <input type="hidden" name="id" value={address.id} /> : null}
      <label>
        {tx('addresses.label')}
        <input name="title" defaultValue={address?.title ?? ''} placeholder={tx('addresses.homePlaceholder')} />
      </label>
      <div className="account-form__row">
        <label>
          {tx('addresses.firstName')}
          <input name="firstName" defaultValue={address?.firstName ?? ''} required />
        </label>
        <label>
          {tx('addresses.lastName')}
          <input name="lastName" defaultValue={address?.lastName ?? ''} required />
        </label>
      </div>
      <label>
        {tx('addresses.company')}
        <input name="company" defaultValue={address?.company ?? ''} />
      </label>
      <label>
        {tx('addresses.street')}
        <input name="addressLine1" defaultValue={address?.addressLine1 ?? ''} required />
      </label>
      <label>
        {tx('addresses.apartment')}
        <input name="addressLine2" defaultValue={address?.addressLine2 ?? ''} />
      </label>
      <div className="account-form__row">
        <label>
          {tx('addresses.city')}
          <input name="city" defaultValue={address?.city ?? ''} required />
        </label>
        <label>
          {tx('addresses.state')}
          <input name="state" defaultValue={address?.state ?? ''} />
        </label>
      </div>
      <div className="account-form__row">
        <label>
          {tx('addresses.postcode')}
          <input name="postalCode" defaultValue={address?.postalCode ?? ''} />
        </label>
        <label>
          {tx('addresses.country')}
          <input
            name="country"
            defaultValue={address?.country ?? 'AU'}
            maxLength={2}
            title={tx('addresses.countryHint')}
            required
          />
        </label>
      </div>
      <label>
        {tx('addresses.phone')}
        <input name="phone" type="tel" defaultValue={address?.phone ?? ''} />
      </label>
      <Note state={state} />
      <SubmitButton>{address?.id ? tx('addresses.saveChanges') : tx('addresses.addButton')}</SubmitButton>
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
  const tx = usePortalText()

  return (
    <>
      <div className="account-card__actions">
        <a className="btn btn--ghost" href={`/account/addresses/${id}`}>
          {tx('addresses.edit')}
        </a>
        {!isDefault && (
          <form action={makeDefault}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton variant="ghost">{tx('addresses.makeDefault')}</SubmitButton>
          </form>
        )}
        <form action={remove}>
          <input type="hidden" name="id" value={id} />
          <SubmitButton variant="ghost">{tx('addresses.remove')}</SubmitButton>
        </form>
      </div>
      <Note state={defaultState} />
      <Note state={deleteState} />
    </>
  )
}

export const NameForm: React.FC<{ name: string }> = ({ name }) => {
  const [state, action] = useActionState<ActionState, FormData>(saveNameAction, IDLE)
  const tx = usePortalText()
  return (
    <form action={action} className="account-form">
      <label>
        {tx('profile.name')}
        <input name="name" defaultValue={name} autoComplete="name" />
      </label>
      <Note state={state} />
      <SubmitButton>{tx('profile.saveName')}</SubmitButton>
    </form>
  )
}

export type LanguageOption = { value: string; label: string }

/** The portal language choice. `options` is the automatic choice followed by each active locale. */
export const LanguageForm: React.FC<{
  current: string
  options: LanguageOption[]
  labels: { heading: string; save: string }
}> = ({ current, options, labels }) => {
  const [state, action] = useActionState<ActionState, FormData>(saveLanguageAction, IDLE)
  return (
    <form action={action} className="account-form">
      <label>
        {labels.heading}
        <select name="locale" defaultValue={current}>
          {options.map((option) => (
            <option key={option.value || 'auto'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Note state={state} />
      <SubmitButton>{labels.save}</SubmitButton>
    </form>
  )
}

export const EmailForm: React.FC<{ email: string }> = ({ email }) => {
  const [state, action] = useActionState<ActionState, FormData>(changeEmailAction, IDLE)
  const tx = usePortalText()
  return (
    <form action={action} className="account-form">
      <label>
        {tx('auth.email')}
        <input name="email" type="email" defaultValue={email} autoComplete="email" required />
      </label>
      <label>
        {tx('profile.currentPassword')}
        <input
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </label>
      <Note state={state} />
      <SubmitButton>{tx('profile.changeEmail')}</SubmitButton>
    </form>
  )
}

export const PasswordForm: React.FC<{ rules: PasswordRules }> = ({ rules }) => {
  const [state, action] = useActionState<ActionState, FormData>(changePasswordAction, IDLE)
  const tx = usePortalText()
  return (
    <form action={action} className="account-form">
      <label>
        {tx('profile.currentPassword')}
        <input name="currentPassword" type="password" autoComplete="current-password" required />
      </label>
      <label>
        {tx('auth.newPassword')}
        <input name="password" type="password" autoComplete="new-password" minLength={rules.minLength} required aria-describedby="password-hint" />
      </label>
      <p className="account-hint" id="password-hint">{rules.hint}</p>
      <label>
        {tx('auth.confirmNewPassword')}
        <input
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={rules.minLength}
          required
        />
      </label>
      <Note state={state} />
      <SubmitButton>{tx('profile.changePassword')}</SubmitButton>
    </form>
  )
}
