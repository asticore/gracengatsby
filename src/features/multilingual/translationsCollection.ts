import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/access/ecommerceAccess'

/**
 * The store behind `eg_translations`: one row per translated string.
 *
 * A collection rather than a bespoke API route, so the translation table gets
 * the portal's authentication, access control and REST endpoints for free -
 * the admin view reads and writes it over `/api/translations` like any other
 * screen, and there is no second auth path to keep correct.
 *
 * Hidden from the sidebar on purpose. A flat list of thousands of rows keyed
 * by field path is the wrong way to look at this data; `/admin/translations`
 * is the right way, and two doors onto the same rows means two behaviours to
 * explain. The row shape is still a normal document, so anything that needs to
 * script an import or export can use the same API.
 *
 * The field names here must keep matching the columns the migration creates -
 * the table is built by hand, for the reason given in the migration's header.
 */
export const Translations: CollectionConfig = {
  slug: 'translations',
  dbName: 'eg_translations',
  labels: { singular: 'Translation', plural: 'Translations' },
  admin: {
    hidden: true,
    useAsTitle: 'fieldPath',
    defaultColumns: ['locale', 'sourceKind', 'sourceId', 'fieldPath', 'updatedAt'],
    description: 'Individual translated strings. Edit these on the Translations screen.',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'locale',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'BCP 47 tag this row is the translation for.' },
    },
    {
      name: 'sourceKind',
      type: 'select',
      required: true,
      defaultValue: 'collection',
      options: [
        { label: 'Interface string', value: 'interface' },
        { label: 'Collection field', value: 'collection' },
        { label: 'Global field', value: 'global' },
      ],
    },
    {
      name: 'sourceId',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'What is being translated: "ui" for interface strings, otherwise "<collection>:<document id>".',
      },
    },
    {
      name: 'fieldPath',
      type: 'text',
      required: true,
      admin: { description: 'Dot path to the field, or the interface string key.' },
    },
    {
      name: 'value',
      type: 'textarea',
      admin: { description: 'The translation. Empty means not translated yet.' },
    },
    {
      // Snapshot of what was translated, not a duplicate of the source. Once
      // the source text is edited this no longer matches, which is the only
      // way to tell a stale translation from a current one without diffing
      // every document on every read.
      name: 'sourceText',
      type: 'textarea',
      admin: { description: 'The source-language text as it read when this translation was saved.' },
    },
  ],
  timestamps: true,
  versions: false,
}
