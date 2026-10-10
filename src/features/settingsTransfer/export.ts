import type { Engine } from '@/engine'

import { encryptJson } from './crypto'
import {
  ADMIN_PANEL_ROLES,
  DOC_NOISE_KEYS,
  EXPORT_APP_ID,
  EXPORT_FORMAT_VERSION,
  ExportFormatError,
  HEADER_FOOTER_GLOBALS,
  MIN_EXPORT_PASSWORD_LENGTH,
  RELATION_KEYS,
  SECRET_PATHS,
  SETTINGS_GLOBALS,
  USER_SENSITIVE_KEYS,
  cloneJson,
  isPlainObject,
  removePaths,
  withoutKeys,
  type ExportFile,
  type ExportOptions,
  type JsonObject,
} from './format'

/* -------------------------------------------------------------------------- */
/* Options                                                                    */
/* -------------------------------------------------------------------------- */

const readBoolean = (value: unknown, name: string): boolean => {
  if (value === undefined || value === null) return false
  if (typeof value !== 'boolean') throw new ExportFormatError(`"${name}" must be true or false.`)
  return value
}

/** Validates the JSON body of the export request. Missing options default to off. */
export function parseExportOptions(raw: unknown): ExportOptions {
  if (!isPlainObject(raw)) throw new ExportFormatError('Send the export options as a JSON object.')

  const contentRaw = raw.content === undefined || raw.content === null ? {} : raw.content
  if (!isPlainObject(contentRaw)) throw new ExportFormatError('"content" must be an object of true/false values.')

  const includeSecrets = readBoolean(raw.includeSecrets, 'includeSecrets')
  let password: string | undefined
  if (raw.password !== undefined && raw.password !== null && typeof raw.password !== 'string') {
    throw new ExportFormatError('"password" must be text.')
  }
  if (includeSecrets) {
    password = typeof raw.password === 'string' ? raw.password : ''
    if (password.length < MIN_EXPORT_PASSWORD_LENGTH) {
      throw new ExportFormatError(
        `Including secrets needs a password of at least ${MIN_EXPORT_PASSWORD_LENGTH} characters. The whole file is encrypted with it.`,
      )
    }
  }

  const options: ExportOptions = {
    settings: readBoolean(raw.settings, 'settings'),
    headerFooter: readBoolean(raw.headerFooter, 'headerFooter'),
    roles: readBoolean(raw.roles, 'roles'),
    users: readBoolean(raw.users, 'users'),
    redirects: readBoolean(raw.redirects, 'redirects'),
    pageTemplates: readBoolean(raw.pageTemplates, 'pageTemplates'),
    fieldGroups: readBoolean(raw.fieldGroups, 'fieldGroups'),
    content: {
      pages: readBoolean(contentRaw.pages, 'content.pages'),
      posts: readBoolean(contentRaw.posts, 'content.posts'),
      products: readBoolean(contentRaw.products, 'content.products'),
      mediaMetadata: readBoolean(contentRaw.mediaMetadata, 'content.mediaMetadata'),
    },
    includeSecrets,
  }
  if (password !== undefined) options.password = password

  const anything =
    options.settings ||
    options.headerFooter ||
    options.roles ||
    options.users ||
    options.redirects ||
    options.pageTemplates ||
    options.fieldGroups ||
    Object.values(options.content).some(Boolean)
  if (!anything) throw new ExportFormatError('Choose at least one thing to export.')

  return options
}

/* -------------------------------------------------------------------------- */
/* Collecting                                                                 */
/* -------------------------------------------------------------------------- */

const LIST_LIMIT = 10000

async function listAll(engine: Engine, collection: string): Promise<JsonObject[]> {
  const result = await engine.find({ collection, limit: LIST_LIMIT, depth: 0, overrideAccess: true })
  return (result.docs ?? []) as JsonObject[]
}

const hasAdminPanelRole = (doc: JsonObject): boolean => {
  const roles = Array.isArray(doc.roles) ? doc.roles : []
  return roles.some((role) => (ADMIN_PANEL_ROLES as readonly unknown[]).includes(role))
}

/**
 * Builds the export document. Secrets are removed unless `includeSecrets` is
 * set. Password hashes, sessions and 2FA material are never included.
 */
export async function buildExport(engine: Engine, options: ExportOptions): Promise<ExportFile> {
  const warnings: string[] = []
  const file: ExportFile = {
    app: EXPORT_APP_ID,
    version: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    includes: {
      settings: options.settings,
      headerFooter: options.headerFooter,
      roles: options.roles,
      users: options.users,
      redirects: options.redirects,
      pageTemplates: options.pageTemplates,
      fieldGroups: options.fieldGroups,
      content: { ...options.content },
      includeSecrets: options.includeSecrets,
    },
    globals: {},
    roles: [],
    users: [],
    redirects: [],
    pageTemplates: [],
    fieldGroups: [],
    content: { pages: [], posts: [], products: [], mediaMetadata: [] },
    warnings,
  }

  const globalSlugs = [
    ...(options.settings ? SETTINGS_GLOBALS : []),
    ...(options.headerFooter ? HEADER_FOOTER_GLOBALS : []),
  ]
  for (const slug of globalSlugs) {
    const doc = await engine.findGlobal({ slug, depth: 0, overrideAccess: true })
    if (!doc) {
      warnings.push(`No saved data was found for ${slug}, so it was left out.`)
      continue
    }
    const clean = withoutKeys(doc as JsonObject, DOC_NOISE_KEYS)
    if (!options.includeSecrets) removePaths(clean, SECRET_PATHS[slug] ?? [])
    file.globals[slug] = clean
  }

  if (options.roles) {
    file.roles = (await listAll(engine, 'roles')).map((doc) =>
      withoutKeys(doc, [...DOC_NOISE_KEYS, 'createdBy', 'updatedBy']),
    )
  }

  if (options.users) {
    // The users collection also holds shop customers. Their order and contact
    // history is personal data rather than site settings, so only accounts
    // that can sign in to the admin panel are exported.
    file.users = (await listAll(engine, 'users'))
      .filter(hasAdminPanelRole)
      .map((doc) => withoutKeys(doc, [...DOC_NOISE_KEYS, ...RELATION_KEYS, ...USER_SENSITIVE_KEYS]))
  }

  if (options.redirects) {
    file.redirects = (await listAll(engine, 'redirects')).map((doc) =>
      withoutKeys(doc, [...DOC_NOISE_KEYS, 'hitCount', 'lastHit']),
    )
  }

  if (options.pageTemplates) {
    file.pageTemplates = (await listAll(engine, 'page-templates')).map((doc) =>
      withoutKeys(doc, [...DOC_NOISE_KEYS, ...RELATION_KEYS]),
    )
  }

  if (options.fieldGroups) {
    file.fieldGroups = (await listAll(engine, 'field-groups')).map((doc) =>
      withoutKeys(doc, [...DOC_NOISE_KEYS, ...RELATION_KEYS]),
    )
  }

  const contentDocs: Array<[keyof ExportFile['content'], string, boolean]> = [
    ['pages', 'pages', options.content.pages],
    ['posts', 'posts', options.content.posts],
    ['products', 'products', options.content.products],
    ['mediaMetadata', 'media', options.content.mediaMetadata],
  ]
  for (const [key, collection, enabled] of contentDocs) {
    if (!enabled) continue
    file.content[key] = (await listAll(engine, collection)).map((doc) =>
      withoutKeys(doc, [...DOC_NOISE_KEYS, ...RELATION_KEYS]),
    )
  }

  // Keep the document-level copy independent of anything the engine returned.
  return cloneJson(file)
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/** Today's date as YYYY-MM-DD in UTC, used in the download name. */
export function exportFilename(now: Date = new Date()): string {
  return `gracengatsby-export-${now.toISOString().slice(0, 10)}.json`
}

/**
 * The text of the download. Plain JSON normally. When secrets are included, the
 * whole file is encrypted with the password and the download holds the
 * envelope instead.
 */
export async function renderExport(
  engine: Engine,
  options: ExportOptions,
): Promise<{ body: string; filename: string; encrypted: boolean }> {
  const file = await buildExport(engine, options)
  const filename = exportFilename()

  if (options.includeSecrets) {
    const envelope = await encryptJson(file, options.password ?? '')
    return { body: JSON.stringify(envelope), filename, encrypted: true }
  }
  return { body: JSON.stringify(file, null, 2), filename, encrypted: false }
}
