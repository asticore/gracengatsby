'use client'

import React, { useActionState } from 'react'

import { Note, SubmitButton } from '@/features/accounts/components/FormBits'
import { IDLE, type ActionState } from '@/features/accounts/types'

import {
  acceptInviteAction,
  adminDeleteOrganizationAction,
  cancelInviteAction,
  changeMemberRoleAction,
  createOrganizationAction,
  createTeamAction,
  declineInviteAction,
  deleteOrganizationAction,
  deleteRoleAction,
  deleteTeamAction,
  inviteMemberAction,
  leaveOrganizationAction,
  removeMemberAction,
  resendInviteAction,
  saveRoleAction,
  teamMembershipAction,
  transferOwnershipAction,
  updateOrganizationAction,
} from '../actions'

/**
 * The organisation forms. Each posts to a server action that re-checks the
 * caller's membership and permission, so hiding a button here is a courtesy and
 * never the control. Every form carries the organisation id as a hidden field:
 * it names a row, and the service refuses anyone who is not a member of it.
 */

type Action = (state: ActionState, form: FormData) => Promise<ActionState>

const useForm = (action: Action) => useActionState<ActionState, FormData>(action, IDLE)

export const CreateOrganizationForm: React.FC = () => {
  const [state, action] = useForm(createOrganizationAction)
  return (
    <form action={action} className="account-form">
      <label>
        Name
        <input name="name" required minLength={2} maxLength={80} />
      </label>
      <label>
        Web address name (optional)
        <input name="slug" maxLength={48} placeholder="example-co" />
      </label>
      <label>
        Logo address (optional)
        <input name="logo" type="url" placeholder="https://" />
      </label>
      <label>
        Metadata (optional JSON)
        <input name="metadata" placeholder='{"industry":"retail"}' />
      </label>
      <SubmitButton>Create organization</SubmitButton>
      <Note state={state} />
    </form>
  )
}

export const EditOrganizationForm: React.FC<{ organizationId: string; name: string; slug: string; logo: string; metadata: string }> = ({ organizationId, name, slug, logo, metadata }) => {
  const [state, action] = useForm(updateOrganizationAction)
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label>
        Name
        <input name="name" defaultValue={name} required minLength={2} maxLength={80} />
      </label>
      <label>
        Web address name
        <input name="slug" defaultValue={slug} maxLength={48} />
      </label>
      <label>
        Logo address
        <input name="logo" type="url" defaultValue={logo} placeholder="https://" />
      </label>
      <label>
        Metadata (JSON)
        <input name="metadata" defaultValue={metadata} />
      </label>
      <SubmitButton>Save changes</SubmitButton>
      <Note state={state} />
    </form>
  )
}

export const InviteForm: React.FC<{ organizationId: string; roles: string[]; teams: { id: string; name: string }[] }> = ({ organizationId, roles, teams }) => {
  const [state, action] = useForm(inviteMemberAction)
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label>
        Email address
        <input name="email" type="email" required autoComplete="off" />
      </label>
      <div className="account-form__row">
        <label>
          Role
          <select name="role" defaultValue="member">
            {roles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        {teams.length > 0 ? (
          <label>
            Team (optional)
            <select name="teamId" defaultValue="">
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <SubmitButton>Send invitation</SubmitButton>
      <Note state={state} />
    </form>
  )
}

/** One small form per row action: a hidden-field form with a single button. */
const RowForm: React.FC<{ action: Action; fields: Record<string, string>; label: string; variant?: 'primary' | 'ghost'; confirm?: string; children?: React.ReactNode }> = ({ action, fields, label, variant = 'ghost', confirm, children }) => {
  const [state, run] = useForm(action)
  return (
    <form
      action={run}
      className="org-inline-form"
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <SubmitButton variant={variant}>{label}</SubmitButton>
      <Note state={state} />
    </form>
  )
}

export const ResendInviteForm: React.FC<{ organizationId: string; inviteId: string }> = (props) => <RowForm action={resendInviteAction} fields={props} label="Resend" />
export const CancelInviteForm: React.FC<{ organizationId: string; inviteId: string }> = (props) => <RowForm action={cancelInviteAction} fields={props} label="Cancel" confirm="Cancel this invitation?" />
export const RemoveMemberForm: React.FC<{ organizationId: string; userId: string }> = (props) => <RowForm action={removeMemberAction} fields={props} label="Remove" confirm="Remove this member?" />
export const TransferOwnershipForm: React.FC<{ organizationId: string; userId: string }> = (props) => (
  <RowForm action={transferOwnershipAction} fields={props} label="Make owner" confirm="Transfer ownership? You will become an admin." />
)
export const LeaveOrganizationForm: React.FC<{ organizationId: string }> = (props) => <RowForm action={leaveOrganizationAction} fields={props} label="Leave organization" confirm="Leave this organization?" />
export const DeleteOrganizationForm: React.FC<{ organizationId: string }> = (props) => (
  <RowForm action={deleteOrganizationAction} fields={props} label="Delete organization" confirm="Delete this organization for everyone? This cannot be undone." />
)
export const DeleteTeamForm: React.FC<{ organizationId: string; teamId: string }> = (props) => <RowForm action={deleteTeamAction} fields={props} label="Delete team" confirm="Delete this team?" />
export const DeleteRoleForm: React.FC<{ organizationId: string; name: string }> = (props) => <RowForm action={deleteRoleAction} fields={props} label="Delete role" confirm="Delete this role?" />

export const ChangeRoleForm: React.FC<{ organizationId: string; userId: string; role: string; roles: string[] }> = ({ organizationId, userId, role, roles }) => (
  <RowForm action={changeMemberRoleAction} fields={{ organizationId, userId }} label="Change role">
    <select name="role" defaultValue={role} aria-label="Role">
      {roles.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  </RowForm>
)

export const TeamMembershipForm: React.FC<{ organizationId: string; teamId: string; present: boolean; candidates: { userId: string; label: string }[] }> = ({ organizationId, teamId, present, candidates }) => (
  <RowForm action={teamMembershipAction} fields={{ organizationId, teamId, present: present ? 'yes' : 'no' }} label={present ? 'Remove from team' : 'Add to team'}>
    <select name="userId" aria-label="Member">
      {candidates.map((c) => (
        <option key={c.userId} value={c.userId}>
          {c.label}
        </option>
      ))}
    </select>
  </RowForm>
)

export const CreateTeamForm: React.FC<{ organizationId: string }> = ({ organizationId }) => (
  <RowForm action={createTeamAction} fields={{ organizationId }} label="Create team" variant="primary">
    <input name="name" required minLength={2} maxLength={80} placeholder="Team name" aria-label="Team name" />
  </RowForm>
)

export const RoleForm: React.FC<{ organizationId: string; actions: string[] }> = ({ organizationId, actions }) => {
  const [state, action] = useForm(saveRoleAction)
  return (
    <form action={action} className="account-form">
      <input type="hidden" name="organizationId" value={organizationId} />
      <label>
        Role name (lower-case letters, digits, - and _)
        <input name="name" required pattern="[a-z][a-z0-9_-]{1,31}" />
      </label>
      <fieldset className="org-perms">
        <legend>Permissions</legend>
        {actions.map((a) => (
          <label key={a}>
            <input type="checkbox" name="permissions" value={a} /> {a}
          </label>
        ))}
      </fieldset>
      <SubmitButton>Save role</SubmitButton>
      <Note state={state} />
    </form>
  )
}

export const InviteDecisionForm: React.FC<{ token: string }> = ({ token }) => {
  const [acceptState, accept] = useForm(acceptInviteAction)
  const [declineState, decline] = useForm(declineInviteAction)
  return (
    <div className="account-card__actions">
      <form action={accept}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton>Accept invitation</SubmitButton>
        <Note state={acceptState} />
      </form>
      <form action={decline}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton variant="ghost">Decline</SubmitButton>
        <Note state={declineState} />
      </form>
    </div>
  )
}

/** The admin screen's delete button. A plain form: the action re-checks the administrator on the server. */
export const AdminDeleteOrganizationForm: React.FC<{ organizationId: string; name: string }> = ({ organizationId, name }) => (
  <form
    action={adminDeleteOrganizationAction}
    onSubmit={(event) => {
      if (!window.confirm(`Delete ${name} and remove all its members, teams and invitations? This cannot be undone.`)) event.preventDefault()
    }}
  >
    <input type="hidden" name="organizationId" value={organizationId} />
    <button type="submit" className="btn btn--ghost">
      Delete
    </button>
  </form>
)
