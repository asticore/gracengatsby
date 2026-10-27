/**
 * Tests for the "Sign in as" row action on the Users list: the visibility rule
 * (showSignInAsRow) and the rendered button in ListRowActions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createElement, type ComponentProps } from 'react'
import { cleanup, render, screen } from '@testing-library/react'

import { showSignInAsRow } from '@/features/impersonation/policy'
import { ListRowActions } from '@/admin/views/ListRowActions'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('@/features/impersonation/actions', () => ({ startImpersonationAction: vi.fn() }))

const admin = { id: 1 }
const customer = { id: 7, roles: ['customer'], email: 'jo@example.com' }

describe('showSignInAsRow', () => {
  it('shows for a customer other than the admin', () => {
    expect(showSignInAsRow(customer, admin)).toBe(true)
  })

  it('hides for admin, editor and viewer roles, even when customer is also listed', () => {
    expect(showSignInAsRow({ ...customer, roles: ['admin'] }, admin)).toBe(false)
    expect(showSignInAsRow({ ...customer, roles: ['customer', 'editor'] }, admin)).toBe(false)
    expect(showSignInAsRow({ ...customer, roles: ['viewer', 'customer'] }, admin)).toBe(false)
  })

  it('hides when the row has no customer role or the roles are not a list', () => {
    expect(showSignInAsRow({ ...customer, roles: [] }, admin)).toBe(false)
    expect(showSignInAsRow({ ...customer, roles: 'customer' }, admin)).toBe(false)
  })

  it('hides for the admin own account', () => {
    expect(showSignInAsRow({ ...customer, id: 1 }, admin)).toBe(false)
  })

  it('hides when the customer has no email', () => {
    expect(showSignInAsRow({ ...customer, email: '' }, admin)).toBe(false)
    expect(showSignInAsRow({ ...customer, email: undefined }, admin)).toBe(false)
  })
})

type RowProps = ComponentProps<typeof ListRowActions>

const renderRow = (overrides: Partial<RowProps> = {}) =>
  render(
    createElement(ListRowActions, {
      collectionSlug: 'users',
      doc: { ...customer },
      hasDrafts: false,
      canDuplicate: false,
      canUpdate: false,
      signInAs: { maxMinutes: 30, admin },
      ...overrides,
    }),
  )

describe('ListRowActions sign in as', () => {
  afterEach(() => cleanup())

  it('renders the sign in button for a customer row when the feature is on', () => {
    renderRow()
    expect(screen.getByRole('button', { name: 'Sign in as' })).toBeTruthy()
  })

  it('renders no sign in button when the feature is off (no signInAs prop)', () => {
    renderRow({ signInAs: undefined })
    expect(screen.queryByRole('button', { name: 'Sign in as' })).toBeNull()
  })

  it('does not render the button on an admin row', () => {
    renderRow({ doc: { id: 2, roles: ['admin'], email: 'a@example.com' } })
    expect(screen.queryByRole('button', { name: 'Sign in as' })).toBeNull()
  })
})
