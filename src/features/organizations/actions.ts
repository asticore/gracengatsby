'use server'

import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { refuseWhileImpersonating } from '@/features/impersonation/policy'
import { failed, succeeded, type ActionState } from '@/features/accounts/types'

import {
  acceptInvite,
  adminDeleteOrganization,
  cancelInvite,
  changeMemberRole,
  createOrganization,
  createTeam,
  declineInvite,
  deleteCustomRole,
  deleteOrganization,
  deleteTeam,
  inviteMember,
  leaveOrganization,
  removeMember,
  resendInvite,
  saveCustomRole,
  setTeamMembership,
  transferOwnership,
  updateOrganization,
  type Result,
} from './service'
import { ACTIVE_ORG_COOKIE, adminRuntime, orgRuntime } from './wiring'

/**
 * What the organisation screens submit to. The signed-in account is the
 * session's own (see wiring.ts) and is never read from a form field; an
 * organisation id from a form is only ever a name for a row, and every
 * operation in service.ts checks the caller's membership for it first.
 * Every change is refused while an administrator is signed in as a customer.
 */

const text = (form: FormData, field: string): string => {
  const value = form.get(field)
  return typeof value === 'string' ? value : ''
}

const toState = (result: Result<unknown>, success: string): ActionState => (result.ok ? succeeded(result.message ?? success) : failed(result.message ?? 'That did not work.'))

/** The shared preamble for every mutation. Returns a refusal state, or the runtime. */
async function open() {
  const imp = refuseWhileImpersonating(await headers())
  if (imp) return { refusal: failed(imp) }
  const runtime = await orgRuntime()
  return { runtime }
}

export async function createOrganizationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await createOrganization(runtime.deps, runtime.actor, { name: text(form, 'name'), slug: text(form, 'slug'), logo: text(form, 'logo'), metadata: text(form, 'metadata') })
  if (!result.ok) return toState(result, '')
  const jar = await cookies()
  jar.set(ACTIVE_ORG_COOKIE, result.value.id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  revalidatePath('/account/organizations')
  redirect(`/account/organizations/${result.value.id}`)
}

export async function updateOrganizationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await updateOrganization(runtime.deps, runtime.actor, text(form, 'organizationId'), { name: text(form, 'name'), slug: text(form, 'slug'), logo: text(form, 'logo'), metadata: text(form, 'metadata') })
  revalidatePath('/account/organizations')
  return toState(result, 'Saved.')
}

export async function deleteOrganizationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await deleteOrganization(runtime.deps, runtime.actor, text(form, 'organizationId'))
  if (!result.ok) return toState(result, '')
  revalidatePath('/account/organizations')
  redirect('/account/organizations')
}

/** Sets the session's active organisation. Only organisations the account belongs to are accepted. */
export async function switchOrganizationAction(form: FormData): Promise<void> {
  const { runtime, refusal } = await open()
  if (refusal || !runtime.actor || !runtime.settings.enabled) return
  const id = text(form, 'organizationId')
  const mine = await runtime.deps.store.getMember(id, runtime.actor.id)
  if (!mine) return
  const jar = await cookies()
  jar.set(ACTIVE_ORG_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  revalidatePath('/account/organizations')
}

export async function inviteMemberAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await inviteMember(runtime.deps, runtime.actor, text(form, 'organizationId'), { email: text(form, 'email'), role: text(form, 'role'), teamId: text(form, 'teamId') })
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  // A saved invitation whose email failed is reported as a problem, even though the row exists.
  return result.ok && !result.value.emailSent ? failed(result.message ?? 'The email could not be sent.') : toState(result, 'Invitation sent.')
}

export async function resendInviteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await resendInvite(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'inviteId'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return result.ok && !result.value.emailSent ? failed(result.message ?? 'The email could not be sent.') : toState(result, 'Invitation sent again.')
}

export async function cancelInviteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await cancelInvite(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'inviteId'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Invitation cancelled.')
}

export async function acceptInviteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await acceptInvite(runtime.deps, runtime.actor, text(form, 'token'))
  if (!result.ok) return toState(result, '')
  const jar = await cookies()
  jar.set(ACTIVE_ORG_COOKIE, result.value.organizationId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' })
  redirect(`/account/organizations/${result.value.organizationId}`)
}

export async function declineInviteAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await declineInvite(runtime.deps, runtime.actor, text(form, 'token'))
  return toState(result, 'Invitation declined.')
}

export async function changeMemberRoleAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await changeMemberRole(runtime.deps, runtime.actor, text(form, 'organizationId'), Number(text(form, 'userId')), text(form, 'role'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Role changed.')
}

export async function removeMemberAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await removeMember(runtime.deps, runtime.actor, text(form, 'organizationId'), Number(text(form, 'userId')))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Member removed.')
}

export async function leaveOrganizationAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await leaveOrganization(runtime.deps, runtime.actor, text(form, 'organizationId'))
  if (!result.ok) return toState(result, '')
  revalidatePath('/account/organizations')
  redirect('/account/organizations')
}

export async function transferOwnershipAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await transferOwnership(runtime.deps, runtime.actor, text(form, 'organizationId'), Number(text(form, 'userId')))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Ownership transferred. You are now an admin.')
}

export async function createTeamAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await createTeam(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'name'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Team created.')
}

export async function deleteTeamAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await deleteTeam(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'teamId'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Team deleted.')
}

export async function teamMembershipAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await setTeamMembership(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'teamId'), Number(text(form, 'userId')), text(form, 'present') === 'yes')
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Team updated.')
}

export async function saveRoleAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await saveCustomRole(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'name').trim().toLowerCase(), form.getAll('permissions'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Role saved.')
}

export async function deleteRoleAction(_state: ActionState, form: FormData): Promise<ActionState> {
  const { runtime, refusal } = await open()
  if (refusal) return refusal
  const result = await deleteCustomRole(runtime.deps, runtime.actor, text(form, 'organizationId'), text(form, 'name'))
  revalidatePath(`/account/organizations/${text(form, 'organizationId')}`)
  return toState(result, 'Role deleted.')
}

/** Site administrators only (checked again here, whatever the page showed). */
export async function adminDeleteOrganizationAction(form: FormData): Promise<void> {
  const { deps, admin } = await adminRuntime()
  await adminDeleteOrganization(deps, admin, text(form, 'organizationId'))
  revalidatePath('/admin/security/organizations')
}
