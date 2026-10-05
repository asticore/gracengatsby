import { invalidateRedirectsCache } from './resolve'
import { validateRedirect, type RedirectType } from './validate'
import type { CollectionConfig } from '@/engine'

import { isAdmin } from '@/access/ecommerceAccess'

export const Redirects: CollectionConfig = {
  slug: 'redirects',
  dbName: 'eg_redirects',
  labels: { singular: 'Redirect', plural: 'Redirects' },
  admin: {
    useAsTitle: 'fromPath',
    defaultColumns: ['fromPath', 'toPath', 'redirectType', 'enabled', 'hitCount', 'lastHit'],
    group: 'Content',
    description: 'Send visitors from an old address to a new one. Matches the path exactly (a trailing slash and the query string are ignored).',
  },
  access: {
    create: isAdmin,
    delete: isAdmin,
    read: isAdmin,
    update: isAdmin,
  },
  fields: [
    { name: 'fromPath', type: 'text', required: true, admin: { description: 'Old path, starts with /, e.g. /old-page' } },
    { name: 'toPath', type: 'text', required: true, admin: { description: 'New path (/new-page) or a full URL (https://...)' } },
    {
      name: 'redirectType',
      type: 'select',
      required: true,
      defaultValue: '301',
      options: [
        { label: '301 Permanent', value: '301' },
        { label: '302 Temporary', value: '302' },
        { label: '307 Temporary (keeps method)', value: '307' },
        { label: '308 Permanent (keeps method)', value: '308' },
      ],
    },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
    { name: 'note', type: 'text' },
    { name: 'hitCount', type: 'number', defaultValue: 0, admin: { readOnly: true, position: 'sidebar' } },
    {
      name: 'lastHit',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
  defaultSort: '-createdAt',
  hooks: {
    beforeValidate: [
      async ({ data, req, originalDoc }) => {
        if (!data) return data
        const merged = { ...(originalDoc ?? {}), ...data } as Record<string, unknown>
        const selfId = (originalDoc as { id?: number } | undefined)?.id
        const fromPath = typeof merged.fromPath === 'string' ? merged.fromPath.trim() : ''
        const toPath = typeof merged.toPath === 'string' ? merged.toPath.trim() : ''
        const redirectType = String(merged.redirectType ?? '301')
        const existing = (await (req as { engine: { find: (a: unknown) => Promise<{ docs: Record<string, unknown>[] }> } }).engine
          .find({ collection: 'redirects', limit: 1000, depth: 0, overrideAccess: true })
          .catch((): { docs: Record<string, unknown>[] } => ({ docs: [] }))).docs.map((d) => ({
          id: d.id as number,
          fromPath: String(d.fromPath ?? ''),
          toPath: String(d.toPath ?? ''),
          enabled: d.enabled !== false,
        }))
        const errors = validateRedirect(
          { fromPath, toPath, redirectType: redirectType as RedirectType },
          existing,
          selfId,
        )
        if (errors.length > 0) {
          const { ValidationError } = await import('@/localapi/operations')
          throw new ValidationError(errors.map((message) => ({ path: 'fromPath', message })))
        }
        if (typeof data.fromPath === 'string') data.fromPath = fromPath
        if (typeof data.toPath === 'string') data.toPath = toPath
        return data
      },
    ],
    afterChange: [
      () => {
        invalidateRedirectsCache()
      },
    ],
    afterDelete: [
      () => {
        invalidateRedirectsCache()
      },
    ],
  },
}
