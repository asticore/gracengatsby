import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { AccountShell, AuthShell } from '@/features/accounts/components/AccountShell'
import { requireCustomer } from '@/features/accounts/guards'
import { portalFormatLocale } from '@/features/accounts/orders'
import { currentPortalLocale } from '@/features/multilingual/portalLocaleServer'
import { portalTextFor } from '@/features/multilingual/portalStrings'

import { switchOrganizationAction } from '../actions'
import { ORG_ACTIONS, BUILT_IN_ROLES, isBuiltInRole } from '../permissions'
import { parseMetadata } from '../policy'
import { getOrganization, listMyOrganizations, previewInvite } from '../service'
import { refusalText } from '../refusalText'
import { activeOrganization, memberEmails, orgRuntime } from '../wiring'
import {
  CancelInviteForm,
  ChangeRoleForm,
  CreateOrganizationForm,
  CreateTeamForm,
  DeleteOrganizationForm,
  DeleteRoleForm,
  DeleteTeamForm,
  EditOrganizationForm,
  InviteDecisionForm,
  InviteForm,
  LeaveOrganizationForm,
  RemoveMemberForm,
  ResendInviteForm,
  RoleForm,
  TeamMembershipForm,
  TransferOwnershipForm,
} from './OrganizationForms'
import { OrganizationStyles } from './organizationStyles'

/**
 * The organisation screens, all server components. Each starts with the
 * account guard (404 when accounts are off, redirect to sign in when signed
 * out) and answers 404 when organisations are off. A non-member asking for an
 * organisation gets the same 404 as for one that does not exist.
 */

const START = '/account/organizations'

const ensureOn = async (returnTo: string) => {
  await requireCustomer(returnTo)
  const runtime = await orgRuntime()
  if (!runtime.settings.enabled || !runtime.actor) notFound()
  return runtime
}

const formatDate = (iso: string, locale: string): string => {
  try {
    return new Date(iso).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return new Date(iso).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
  }
}

export const OrganizationsListScreen: React.FC = async () => {
  const runtime = await ensureOn(START)
  const mine = await listMyOrganizations(runtime.deps, runtime.actor)
  const orgs = mine.value ?? []
  const active = await activeOrganization(runtime)
  const tx = portalTextFor(await currentPortalLocale())
  return (
    <AccountShell title={tx('orgs.title')} current={START}>
      <OrganizationStyles />
      {orgs.length > 1 ? (
        <form action={switchOrganizationAction} className="org-switcher">
          <label>
            {tx('orgs.workingIn')}
            <select name="organizationId" defaultValue={active?.id ?? ''}>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn--ghost">
            {tx('orgs.switch')}
          </button>
        </form>
      ) : null}
      {orgs.length === 0 ? (
        <p className="account-empty">{tx('orgs.none')}</p>
      ) : (
        <ul className="org-list">
          {orgs.map((o) => (
            <li key={o.id} className="org-row">
              <div className="org-row__main">
                <Link href={`${START}/${o.id}`}>
                  <strong>{o.name}</strong>
                </Link>{' '}
                <span className="org-badge">{o.role}</span>
                {active?.id === o.id ? <span className="org-badge"> {tx('orgs.active')}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link className="btn btn--primary" href={`${START}/new`}>
          {tx('orgs.create')}
        </Link>
      </p>
    </AccountShell>
  )
}

export const OrganizationCreateScreen: React.FC = async () => {
  await ensureOn(`${START}/new`)
  const tx = portalTextFor(await currentPortalLocale())
  return (
    <AccountShell title={tx('orgs.create')} current={START}>
      <OrganizationStyles />
      <CreateOrganizationForm />
    </AccountShell>
  )
}

export const OrganizationDetailScreen: React.FC<{ id: string }> = async ({ id }) => {
  const runtime = await ensureOn(`${START}/${id}`)
  const result = await getOrganization(runtime.deps, runtime.actor, id)
  if (!result.ok) notFound()
  const detail = result.value
  const { org } = detail
  const can = (action: (typeof ORG_ACTIONS)[number]) => detail.permissions.includes(action)
  const emails = await memberEmails(runtime.context.engine, detail.members.map((m) => m.userId))
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)
  const labelOf = (userId: number) => emails.get(userId) ?? tx('orgs.memberFallback', { id: userId })
  const roleNames = [...BUILT_IN_ROLES.filter((r) => r !== 'owner' || detail.myRole === 'owner'), ...detail.roles.map((r) => r.name)]
  const meta = parseMetadata(org.metadata)
  const pending = detail.invites.filter((i) => i.status === 'pending')
  const past = detail.invites.filter((i) => i.status !== 'pending')
  const myId = runtime.actor.id
  // Whoever may manage members is shown controls only for the rows they may manage; the server checks again.
  const manages = (role: string) => detail.myRole === 'owner' || (detail.myRole === 'admin' && role !== 'owner')

  return (
    <AccountShell title={org.name} current={START}>
      <OrganizationStyles />
      <div className="org-head">
        {org.logo ? <img className="org-logo" src={org.logo} alt="" width={56} height={56} /> : null}
        <div>
          <span className="org-badge">{tx('orgs.roleBadge', { role: detail.myRole })}</span>
          <p className="org-muted">/{org.slug}</p>
        </div>
      </div>
      {Object.keys(meta).length > 0 ? <p className="org-muted">{JSON.stringify(meta)}</p> : null}

      <section className="org-section">
        <h2>{tx('orgs.members', { count: detail.members.length })}</h2>
        <ul className="org-list">
          {detail.members.map((m) => (
            <li key={m.id} className="org-row">
              <div className="org-row__main">
                {labelOf(m.userId)} <span className="org-badge">{m.role}</span>
                {m.userId === myId ? <span className="org-muted"> {tx('orgs.you')}</span> : null}
              </div>
              <div className="org-row__actions">
                {can('member:update') && m.userId !== myId && manages(m.role) ? <ChangeRoleForm organizationId={org.id} userId={String(m.userId)} role={m.role} roles={roleNames} /> : null}
                {can('organization:transfer') && m.userId !== myId ? <TransferOwnershipForm organizationId={org.id} userId={String(m.userId)} /> : null}
                {can('member:remove') && m.userId !== myId && manages(m.role) ? <RemoveMemberForm organizationId={org.id} userId={String(m.userId)} /> : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {can('team:read') ? (
        <section className="org-section">
          <h2>{tx('orgs.teams', { count: detail.teams.length })}</h2>
          {detail.teams.length === 0 ? <p className="account-empty">{tx('orgs.noTeams')}</p> : null}
          <ul className="org-list">
            {detail.teams.map((t) => {
              const inTeam = detail.members.filter((m) => t.memberIds.includes(m.userId))
              const outside = detail.members.filter((m) => !t.memberIds.includes(m.userId))
              return (
                <li key={t.id} className="org-row">
                  <div className="org-row__main">
                    <strong>{t.name}</strong>
                    <div className="org-muted">{inTeam.length === 0 ? tx('orgs.noMembers') : inTeam.map((m) => labelOf(m.userId)).join(', ')}</div>
                  </div>
                  {can('team:manage') ? (
                    <div className="org-row__actions">
                      {outside.length > 0 ? <TeamMembershipForm organizationId={org.id} teamId={t.id} present={false} candidates={outside.map((m) => ({ userId: String(m.userId), label: labelOf(m.userId) }))} /> : null}
                      {inTeam.length > 0 ? <TeamMembershipForm organizationId={org.id} teamId={t.id} present candidates={inTeam.map((m) => ({ userId: String(m.userId), label: labelOf(m.userId) }))} /> : null}
                      <DeleteTeamForm organizationId={org.id} teamId={t.id} />
                    </div>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {can('team:manage') ? <CreateTeamForm organizationId={org.id} /> : null}
        </section>
      ) : null}

      {can('invitation:read') ? (
        <section className="org-section">
          <h2>{tx('orgs.invitations')}</h2>
          {pending.length === 0 ? <p className="account-empty">{tx('orgs.noPending')}</p> : null}
          <ul className="org-list">
            {pending.map((i) => (
              <li key={i.id} className="org-row">
                <div className="org-row__main">
                  {i.email} <span className="org-badge">{i.role}</span>
                  <div className="org-muted">{tx('orgs.expires', { date: formatDate(i.expiresAt, dateLocale) })}</div>
                </div>
                <div className="org-row__actions">
                  {can('invitation:create') ? <ResendInviteForm organizationId={org.id} inviteId={i.id} /> : null}
                  {can('invitation:cancel') ? <CancelInviteForm organizationId={org.id} inviteId={i.id} /> : null}
                </div>
              </li>
            ))}
          </ul>
          {can('invitation:create') ? (
            <InviteForm organizationId={org.id} roles={roleNames} teams={detail.teams.map((t) => ({ id: t.id, name: t.name }))} />
          ) : null}
          {past.length > 0 ? (
            <details>
              <summary>{tx('orgs.pastInvites', { count: past.length })}</summary>
              <ul className="org-list">
                {past.map((i) => (
                  <li key={i.id} className="org-row">
                    {i.email} <span className="org-badge">{i.status}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {can('role:manage') ? (
        <section className="org-section">
          <h2>{tx('orgs.customRoles')}</h2>
          <ul className="org-list">
            {detail.roles.map((r) => (
              <li key={r.id} className="org-row">
                <div className="org-row__main">
                  <strong>{r.name}</strong>
                  <div className="org-muted">{r.permissions.join(', ') || tx('orgs.noPermissions')}</div>
                </div>
                <DeleteRoleForm organizationId={org.id} name={r.name} />
              </li>
            ))}
          </ul>
          <RoleForm organizationId={org.id} actions={ORG_ACTIONS.filter((a) => a !== 'organization:delete' && a !== 'organization:transfer')} />
        </section>
      ) : null}

      {can('organization:update') ? (
        <section className="org-section">
          <h2>{tx('orgs.details')}</h2>
          <EditOrganizationForm organizationId={org.id} name={org.name} slug={org.slug} logo={org.logo ?? ''} metadata={org.metadata ?? ''} />
        </section>
      ) : null}

      <section className="org-danger">
        <LeaveOrganizationForm organizationId={org.id} />
        {can('organization:delete') ? <DeleteOrganizationForm organizationId={org.id} /> : null}
        {detail.myRole === 'owner' ? <p className="org-muted">{tx('orgs.lastOwnerNote')}</p> : null}
        {isBuiltInRole(detail.myRole) ? null : <p className="org-muted">{tx('orgs.customRoleNote')}</p>}
      </section>
    </AccountShell>
  )
}

/** /account/invite/[token]. Needs a signed-in account; the token itself is the only thing the page trusts from the URL. */
export const AcceptInviteScreen: React.FC<{ token: string }> = async ({ token }) => {
  // Only the account area path is carried through sign-in, and it already is one.
  await requireCustomer(`/account/invite/${encodeURIComponent(token)}`)
  const runtime = await orgRuntime()
  if (!runtime.settings.enabled) notFound()
  const preview = await previewInvite(runtime.deps, token)
  const portalLocale = await currentPortalLocale()
  const tx = portalTextFor(portalLocale)
  const dateLocale = portalFormatLocale(portalLocale)
  if (!preview.ok) {
    return (
      <AuthShell title={tx('orgs.inviteTitle')}>
        <OrganizationStyles />
        <p role="alert">{refusalText(preview.code ?? 'invite_invalid', tx)}</p>
        <p>
          <Link href="/account">{tx('orgs.backToAccount')}</Link>
        </p>
      </AuthShell>
    )
  }
  const invite = preview.value
  const mine = (runtime.actor?.email ?? '').trim().toLowerCase() === invite.email
  return (
    <AuthShell title={tx('orgs.joinTitle', { name: invite.organizationName })}>
      <OrganizationStyles />
      <div className="account-card">
        <h3>{invite.organizationName}</h3>
        <p>{tx('orgs.invitedAs', { role: invite.role, email: invite.email, date: formatDate(invite.expiresAt, dateLocale) })}</p>
        {!invite.usable ? <p role="alert">{refusalText(invite.problem ?? 'invite_used', tx)}</p> : null}
        {invite.usable && !mine ? <p role="alert">{refusalText('wrong_account', tx)}</p> : null}
        {invite.usable && mine ? <InviteDecisionForm token={token} /> : null}
      </div>
    </AuthShell>
  )
}
