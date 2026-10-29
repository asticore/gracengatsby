// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { allowedDomainsGuard, allowedHostsFor, domainScopedAccess, domainScopeWhere, domainWriteError } from '@/features/domains/access'

const editor: { roles: string[]; allowedDomains: unknown; customRoleAllowedDomains: unknown } = { roles: ['editor'], allowedDomains: ',example.com.au,', customRoleAllowedDomains: null }

describe('allowedHostsFor', () => {
  it('admins and accounts without a list are unrestricted', () => {
    expect(allowedHostsFor({ roles: ['admin'], allowedDomains: ',example.com,' })).toBeNull()
    expect(allowedHostsFor({ roles: ['editor'] })).toBeNull()
    expect(allowedHostsFor(null)).toBeNull()
  })

  it('an own list wins, then the custom role list applies', () => {
    expect(allowedHostsFor(editor)).toEqual(['example.com.au'])
    expect(allowedHostsFor({ roles: ['editor'], allowedDomains: null, customRoleAllowedDomains: ',example.co.uk,' })).toEqual(['example.co.uk'])
  })
})

describe('domainScopeWhere', () => {
  it('matches unscoped content or content on one of the hosts, as whole delimited hosts', () => {
    expect(domainScopeWhere(['example.com.au'])).toEqual({
      or: [{ availableDomains: { exists: false } }, { availableDomains: { contains: ',example.com.au,' } }],
    })
  })
})

describe('domainScopedAccess', () => {
  it('leaves unrestricted users and false results alone', async () => {
    const base = async () => true
    expect(await domainScopedAccess(base)({ req: { user: { roles: ['admin'] } } })).toBe(true)
    expect(await domainScopedAccess(async () => false)({ req: { user: editor } })).toBe(false)
  })

  it('limits a restricted user to the scope, combined with the base condition', async () => {
    const access = domainScopedAccess(async () => true)
    expect(await access({ req: { user: editor } })).toEqual(domainScopeWhere(['example.com.au']))
    const withWhere = domainScopedAccess(async () => ({ status: { equals: 'published' } }))
    expect(await withWhere({ req: { user: editor } })).toEqual({ and: [{ status: { equals: 'published' } }, domainScopeWhere(['example.com.au'])] })
  })
})

describe('domainWriteError', () => {
  it('lets unrestricted users save anything, including unscoped content', () => {
    expect(domainWriteError({ roles: ['admin'] }, null, null)).toBeNull()
  })

  it('makes a restricted user keep content on their own domains only', () => {
    expect(domainWriteError(editor, ',example.com.au,', null)).toBeNull()
    expect(domainWriteError(editor, ',example.com,', null)).toMatch(/not one of this account's allowed domains/)
    expect(domainWriteError(editor, null, null)).toMatch(/choose the domains/)
  })

  it('uses the stored value when an update does not send the field', () => {
    expect(domainWriteError(editor, undefined, ',example.com.au,')).toBeNull()
    expect(domainWriteError(editor, undefined, null)).toMatch(/choose the domains/)
  })
})

describe('allowedDomainsGuard', () => {
  it('ignores saves that do not change the list', () => {
    expect(() => allowedDomainsGuard({ data: { allowedDomains: ',example.com,' }, originalDoc: { allowedDomains: ',example.com,' }, req: { user: { roles: ['editor'] } } })).not.toThrow()
  })

  it('refuses a change without the domains permission, allows admin', () => {
    const data = { allowedDomains: ',example.com,' }
    expect(() => allowedDomainsGuard({ data, originalDoc: { allowedDomains: null }, req: { user: { roles: ['editor'] } } })).toThrow(/Domain access permission/)
    expect(() => allowedDomainsGuard({ data, originalDoc: { allowedDomains: null }, req: { user: { roles: ['admin'] } } })).not.toThrow()
  })
})
