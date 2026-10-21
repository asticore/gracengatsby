// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SITE_TEMPLATE_KINDS, SiteTemplates } from '@/collections/SiteTemplates'
import { NAV_STRUCTURE } from '@/components/admin/nav/navStructure'
import { BUILT_IN_ROLES, PERMISSION_CATEGORIES, RESOURCES } from '@/features/roles/permissions'
import { VISUAL_EDITOR_SURFACES } from '@/views/visualEditor/surfaces'
import * as migration from '@/migrations/20261102_100000_site_templates'
import { migrations } from '@/migrations'

type AnyField = { name?: string; type: string; [key: string]: any }
const field = (name: string): AnyField => {
  const found = (SiteTemplates.fields as AnyField[]).find((f) => f.name === name)
  if (!found) throw new Error(`no field ${name}`)
  return found
}

describe('site-templates collection config', () => {
  it('has the slug, table name and labels', () => {
    expect(SiteTemplates.slug).toBe('site-templates')
    expect(SiteTemplates.dbName).toBe('eg_site_templates')
    expect(SiteTemplates.labels).toEqual({ singular: 'Site Template', plural: 'Site Templates' })
    expect(SiteTemplates.admin?.group).toBe('Content')
    expect(SiteTemplates.admin?.useAsTitle).toBe('name')
  })

  it('offers the twelve kinds, default single-post', () => {
    expect([...SITE_TEMPLATE_KINDS]).toEqual([
      'header', 'footer', 'single-post', 'single-product', 'single-event', 'archive-blog', 'archive-shop', 'not-found',
      'search-results', 'archive-category', 'archive-tag', 'archive-author',
    ])
    const kind = field('kind')
    expect(kind.type).toBe('select')
    expect(kind.required).toBe(true)
    expect(kind.defaultValue).toBe('single-post')
    expect(kind.options.map((o: { value: string }) => o.value)).toEqual([...SITE_TEMPLATE_KINDS])
  })

  it('has the enabled, priority, conditions, blocks and locks fields with their defaults', () => {
    expect(field('name').required).toBe(true)
    expect(field('enabled')).toMatchObject({ type: 'checkbox', defaultValue: true })
    expect(field('priority')).toMatchObject({ type: 'number', defaultValue: 10, min: 0, max: 999 })
    expect(field('conditions')).toMatchObject({ type: 'json', defaultValue: [] })
    expect(field('conditions').admin.description).toBe('Where this template applies. Empty = everywhere for its kind.')
    expect(field('blocks').type).toBe('blocks')
    expect(field('locks')).toBeDefined()
  })

  it('has role-based access on all four operations and the hooks', () => {
    for (const op of ['create', 'delete', 'read', 'update'] as const) {
      expect(typeof SiteTemplates.access?.[op]).toBe('function')
    }
    expect(SiteTemplates.hooks?.beforeChange?.length).toBe(1)
    expect(SiteTemplates.hooks?.afterChange?.length).toBe(1)
  })

  it('afterChange does not throw outside a request scope', async () => {
    const hook = SiteTemplates.hooks!.afterChange![0] as (args: unknown) => Promise<unknown>
    await expect(hook({ doc: {}, req: {} })).resolves.not.toThrow()
  })
})

describe('site-templates wiring', () => {
  it('is a permission resource granted to admin, editor (full) and viewer (read)', () => {
    expect(RESOURCES).toContain('site-templates')
    expect(BUILT_IN_ROLES.admin['site-templates']).toMatchObject({ read: true, create: true, update: true, delete: true })
    expect(BUILT_IN_ROLES.editor['site-templates']).toEqual(BUILT_IN_ROLES.editor['page-templates'])
    expect(BUILT_IN_ROLES.viewer['site-templates']).toEqual({ read: true })
  })

  it('has a Content row in the permission categories next to page templates', () => {
    const content = PERMISSION_CATEGORIES.find((c) => c.id === 'content')!
    const resources = content.rows.map((r) => r.resource)
    expect(resources.indexOf('site-templates')).toBe(resources.indexOf('page-templates') + 1)
  })

  it('is in the Content nav group right after Page templates', () => {
    const content = NAV_STRUCTURE.find((g) => g.label === 'Content')!
    const slugs = content.entities.map((e) => e.slug)
    expect(slugs.indexOf('site-templates')).toBe(slugs.indexOf('page-templates') + 1)
  })

  it('can be edited in the visual editor', () => {
    expect(VISUAL_EDITOR_SURFACES['site-templates']).toMatchObject({ kind: 'collection', slug: 'site-templates', blocksField: 'blocks', titleField: 'name' })
  })

  it('has its migration registered', () => {
    expect(migrations.map((m) => m.name)).toContain('20261102_100000_site_templates')
  })
})

describe('site-templates migration', () => {
  it('only issues idempotent statements and logs', async () => {
    const statements: string[] = []
    const db = { run: async (q: { queryChunks?: unknown[] } | string) => { statements.push(JSON.stringify(q)) } }
    const logger = { info: () => {}, warn: () => {} }
    await migration.up({ db, engine: { logger } } as never)
    await migration.up({ db, engine: { logger } } as never)
    const create = statements.filter((s) => /CREATE TABLE/.test(s))
    expect(create.length).toBeGreaterThan(0)
    for (const s of statements) expect(s).toMatch(/IF NOT EXISTS/)
    expect(statements.filter((s) => s.includes('eg_site_templates_blocks_')).length).toBeGreaterThan(14)
  })
})
