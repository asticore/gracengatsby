import { describe, expect, it } from 'vitest'

import { applyImplicitAuthFields } from '@/localapi/sanitize'
import { readRegistry } from '@/localapi/registry'

const names = (fields: unknown[]): string[] => (fields as Array<{ name?: string }>).map((f) => f.name ?? '')

describe('applyImplicitAuthFields', () => {
  it('appends the implicit auth fields to an auth collection, idempotently', () => {
    const config = { auth: true, fields: [{ name: 'roles', type: 'select' }] as unknown[] }
    applyImplicitAuthFields(config)
    expect(names(config.fields)).toEqual([
      'roles', 'updatedAt', 'createdAt', 'email', 'resetPasswordToken', 'resetPasswordExpiration',
      'salt', 'hash', 'loginAttempts', 'lockUntil', 'sessions',
    ])
    applyImplicitAuthFields(config)
    expect(config.fields).toHaveLength(11)
  })

  it('leaves a non-auth collection alone', () => {
    const config = { fields: [{ name: 'title' }] as unknown[] }
    applyImplicitAuthFields(config)
    expect(config.fields).toHaveLength(1)
  })

  it('does not overwrite a field the collection already declares', () => {
    const email = { name: 'email', type: 'email', custom: true }
    const config = { auth: true, fields: [email] as unknown[] }
    applyImplicitAuthFields(config)
    expect(config.fields.filter((f) => (f as { name: string }).name === 'email')).toEqual([email])
  })

  it('password columns deny create/update and are hidden; email is required+unique', () => {
    const config = { auth: true, fields: [] as unknown[] }
    applyImplicitAuthFields(config)
    const by = Object.fromEntries((config.fields as Array<{ name: string }>).map((f) => [f.name, f])) as Record<string, Record<string, unknown>>
    for (const key of ['salt', 'hash', 'resetPasswordToken', 'resetPasswordExpiration', 'loginAttempts', 'lockUntil']) {
      expect(by[key].hidden).toBe(true)
      expect((by[key].access as { create: () => boolean; update: () => boolean }).create()).toBe(false)
      expect((by[key].access as { create: () => boolean; update: () => boolean }).update()).toBe(false)
    }
    expect(by.email).toMatchObject({ required: true, unique: true, type: 'email' })
    expect(by.loginAttempts.defaultValue).toBe(0)
  })

  it('the registry users entry carries the implicit fields', () => {
    const fields = (readRegistry.collections.users.config as unknown as { fields: unknown[] }).fields
    expect(names(fields)).toEqual(expect.arrayContaining(['roles', 'email', 'salt', 'hash', 'sessions']))
  })
})
