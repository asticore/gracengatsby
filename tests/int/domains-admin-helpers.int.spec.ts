// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { dnsChecklistFor, dnsHintFor } from '@/features/domains/checklist'
import { allowedDomainsField, availableDomainsField } from '@/features/domains/field'
import { resolveComponent } from '@/admin/componentRegistry'

describe('dnsChecklistFor', () => {
  it('lists each domain with its tags and the Cloudflare steps', () => {
    const text = dnsChecklistFor([
      { host: 'example.com', isPrimary: true, status: 'active' },
      { host: 'example.co.uk', status: 'disabled' },
    ])
    expect(text).toContain('[ ] example.com (primary)')
    expect(text).toContain('[ ] example.co.uk (disabled, not served)')
    expect(text).toContain('Enter example.com and save')
    expect(text).toContain('Status is not checked automatically')
  })

  it('says so when nothing is registered yet', () => {
    expect(dnsChecklistFor([])).toContain('No domains are registered yet')
  })
})

describe('dnsHintFor', () => {
  it('marks disabled rows as not needing a Worker step', () => {
    expect(dnsHintFor({ host: 'a.com', status: 'disabled' })).toMatch(/Disabled/)
    expect(dnsHintFor({ host: 'a.com', status: 'active' })).toMatch(/Not checked here/)
  })
})

describe('domain list fields', () => {
  it('use the picker on both list fields, and it is registered', () => {
    const path = '@/features/domains/admin/DomainPicker#DomainPicker'
    expect((availableDomainsField.admin as { components?: { Field?: string } }).components?.Field).toBe(path)
    expect((allowedDomainsField.admin as { components?: { Field?: string } }).components?.Field).toBe(path)
    expect(resolveComponent(path)).toBeDefined()
    expect(resolveComponent('@/features/domains/admin/DnsChecklist#DnsChecklist')).toBeDefined()
  })
})
