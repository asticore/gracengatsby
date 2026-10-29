import type { CollectionBeforeChangeHook, CollectionConfig } from '@/engine'

import { roleAccess } from '@/access/ecommerceAccess'

import { getMultilingualSettings } from './settings'
import { evaluateTranslationWrite, TRANSLATION_STATUSES } from './translationStatus'
import { isTranslatableSlugCollection, isValidTranslatedSlug, slugSuggestion } from './localizedSlugs'
import { checkTranslatedSlug } from './slugClaims'
import { SLUG_FIELD } from './translatableFields'

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
/**
 * A translated slug is normalised (slugSuggestion) and must be unique in its
 * language on the domains it answers (slugClaims.ts). Runs before the workflow
 * rule. Other fields pass through untouched.
 */
export const enforceTranslatedSlug: CollectionBeforeChangeHook = async (args: unknown) => {
  const { data, originalDoc, req, operation } = args as {
    data: Record<string, unknown>
    originalDoc?: Record<string, unknown> | null
    req?: { engine?: unknown } | null
    operation: string
  }
  const pick = (key: string) => (operation === 'update' && originalDoc ? originalDoc[key] : undefined) ?? data[key]
  if (String(pick('sourceKind') ?? 'collection') !== 'collection' || String(pick('fieldPath') ?? '') !== SLUG_FIELD) return data
  if (typeof data.value !== 'string' || data.value.trim().length === 0) return data

  const sourceId = String(pick('sourceId') ?? '')
  const separator = sourceId.indexOf(':')
  const collection = separator > 0 ? sourceId.slice(0, separator) : ''
  const documentId = separator > 0 ? sourceId.slice(separator + 1) : ''
  const { ValidationError } = await import('@/localapi/operations')
  if (!isTranslatableSlugCollection(collection) || !documentId) {
    throw new ValidationError([{ path: 'fieldPath', message: 'Only pages, posts and products have translated slugs.' }])
  }

  const slug = slugSuggestion(data.value)
  if (!isValidTranslatedSlug(slug)) {
    throw new ValidationError([{ path: 'value', message: 'A slug may use letters, digits and single hyphens only.' }])
  }
  if (req?.engine) {
    const locale = String(pick('locale') ?? '')
    const claim = await checkTranslatedSlug({
      engine: req.engine as Parameters<typeof checkTranslatedSlug>[0]['engine'],
      collection,
      documentId,
      locale,
      slug,
    })
    if (claim.ok === false) throw new ValidationError([{ path: 'value', message: claim.message }])
  }
  return { ...data, value: slug }
}

/**
 * The write rule, applied to every write that reaches this collection - the
 * Translations screen, the REST API, the bulk route and the local API alike.
 * That is why it lives here and not in the screen: a rule enforced only in one
 * of those doors is not enforced.
 *
 * System writes (no signed-in user, e.g. an import script) are trusted, as the
 * approval workflow's validators are.
 */
export const enforceTranslationWorkflow: CollectionBeforeChangeHook = async (args: unknown) => {
  const { data, originalDoc, req, operation } = args as {
    data: Record<string, unknown>
    originalDoc?: Record<string, unknown> | null
    req?: { user?: { id?: unknown; roles?: string[] } | null; engine?: unknown }
    operation: string
  }
  if (!req?.user || !req.engine) return data

  const engine = req.engine as Parameters<typeof getMultilingualSettings>[0]
  const settings = await getMultilingualSettings(engine)
  const locale = String((operation === 'update' ? originalDoc?.locale : undefined) ?? data.locale ?? '')

  const id = Number((req.user as { id?: unknown }).id)
  const result = evaluateTranslationWrite({
    current: operation === 'update' && originalDoc ? (originalDoc as never) : null,
    incoming: {
      value: data.value as string | null | undefined,
      sourceText: data.sourceText as string | null | undefined,
      status: data.status,
      assignedTo: data.assignedTo,
      machineProvider: data.machineProvider as string | null | undefined,
    },
    locale,
    actor: { id, isAdmin: Array.isArray(req.user.roles) && req.user.roles.includes('admin') },
    settings,
    now: new Date().toISOString(),
  })

  if (result.ok === false) {
    const { ValidationError } = await import('@/localapi/operations')
    throw new ValidationError([{ path: 'status', message: result.message }])
  }
  return { ...data, ...result.patch }
}

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
  hooks: {
    beforeChange: [enforceTranslatedSlug, enforceTranslationWorkflow],
  },
  access: {
    read: roleAccess('translations', 'read'),
    create: roleAccess('translations', 'create'),
    update: roleAccess('translations', 'update'),
    delete: roleAccess('translations', 'delete'),
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
      name: 'status',
      type: 'select',
      defaultValue: 'approved',
      options: TRANSLATION_STATUSES.map((value) => ({ value, label: value })),
      admin: {
        description:
          'Set by the workflow, not typed in: a changed value needs review when review is on, and only a permitted reviewer can approve.',
      },
    },
    {
      name: 'machineProvider',
      type: 'text',
      admin: { description: 'The machine translation provider that wrote this draft, if any.' },
    },
    {
      // JSON array of user ids. Empty means "follow the language's rules".
      name: 'assignedTo',
      type: 'textarea',
      admin: { description: 'Users assigned to this translation, overriding the language rules. JSON list of user ids.' },
    },
    {
      name: 'reviewedBy',
      type: 'number',
      admin: { description: 'The user who approved this translation.' },
    },
    {
      name: 'reviewedAt',
      type: 'text',
      admin: { description: 'When it was approved (ISO 8601).' },
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
