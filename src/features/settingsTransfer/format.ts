/**
 * The settings export file format, shared by the server (export/import), the
 * admin UI and the tests. Pure data and helpers only: no engine import, so the
 * client bundle can use it.
 *
 * Bump EXPORT_FORMAT_VERSION only when the shape changes in a way an older
 * site cannot read. Files with a version at or below the current one are
 * accepted; newer ones are refused with a clear message.
 */

export const EXPORT_FORMAT_VERSION = 1
export const EXPORT_APP_ID = 'gracengatsby'
export const MIN_EXPORT_PASSWORD_LENGTH = 8

export type JsonObject = Record<string, unknown>

/** Raised for anything wrong with a file or a request. Routes map it to 400. */
export class ExportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExportFormatError'
  }
}

/* -------------------------------------------------------------------------- */
/* What is exported                                                           */
/* -------------------------------------------------------------------------- */

export const HEADER_FOOTER_GLOBALS = ['header', 'footer'] as const

export const SETTINGS_GLOBALS = [
  'faq-settings',
  'blog-settings',
  'integrations',
  'payment-settings',
  'form-settings',
  'site-settings',
  'member-settings',
  'email-settings',
  'shop-settings',
  'security-settings',
  'language-settings',
  'seo-settings',
  'speed-settings',
  'media-settings',
  'backup-settings',
] as const

export const ALL_GLOBAL_SLUGS: readonly string[] = [...SETTINGS_GLOBALS, ...HEADER_FOOTER_GLOBALS]

/**
 * Secret field paths per global. `*` walks every item of an array, so
 * `custom.keys.*.value` means the value of each custom key.
 *
 * Kept in step with the fields that carry `encryptSecretHook` in src/globals.
 */
export const SECRET_PATHS: Readonly<Record<string, readonly string[]>> = {
  integrations: [
    'claudeApiKey',
    'openaiApiKey',
    'google.mapsApiKey',
    'recaptcha.secretKey',
    'cloudflare.apiToken',
    'custom.keys.*.value',
  ],
  'payment-settings': ['stripe.secretKey', 'stripe.webhookSigningSecret', 'paypal.clientSecret'],
  'email-settings': [
    'resend.apiKey',
    'sesApi.accessKeyId',
    'sesApi.secretAccessKey',
    'mailgun.apiKey',
    'postmark.serverToken',
    'sendgrid.apiKey',
    'cloudflare.apiToken',
    'smtp.password',
  ],
  'backup-settings': [
    'destination.r2.accessKeyId',
    'destination.r2.secretAccessKey',
    'destination.s3.accessKeyId',
    'destination.s3.secretAccessKey',
    'destination.ftp.password',
    'destination.sftp.password',
    'destination.sftp.privateKey',
  ],
  'form-settings': ['turnstileSecretKey'],
  'media-settings': ['stock.unsplashAccessKey', 'stock.pexelsApiKey', 'stock.pixabayApiKey'],
}

/** Top-level fields that every document carries and the engine regenerates. */
export const DOC_NOISE_KEYS = ['id', 'createdAt', 'updatedAt', '_status', '_id'] as const

/** Relationship fields hold ids that mean nothing on another database. */
export const RELATION_KEYS = [
  'createdBy',
  'updatedBy',
  'parent',
  'featuredImage',
  'images',
  'customRole',
] as const

/**
 * Never exported and never imported, whatever the options say: password
 * material, sessions, lockout counters, reset tokens and 2FA secrets.
 */
export const USER_SENSITIVE_KEYS = [
  'hash',
  'salt',
  'password',
  'resetPasswordToken',
  'resetPasswordExpiration',
  'loginAttempts',
  'lockUntil',
  'sessions',
  'twoFactor',
  'twoFactorSecret',
] as const

/** Roles that can sign in to the admin panel. Customer-only accounts are not exported. */
export const ADMIN_PANEL_ROLES = ['admin', 'editor', 'viewer'] as const

/** Roles an imported user may be given. Anything else is dropped. */
export const IMPORTABLE_USER_ROLES = ['admin', 'editor', 'viewer', 'customer'] as const

/* -------------------------------------------------------------------------- */
/* Options and file shape                                                     */
/* -------------------------------------------------------------------------- */

export type ContentOptions = {
  pages: boolean
  posts: boolean
  products: boolean
  mediaMetadata: boolean
}

export type ExportOptions = {
  settings: boolean
  headerFooter: boolean
  roles: boolean
  users: boolean
  redirects: boolean
  pageTemplates: boolean
  fieldGroups: boolean
  content: ContentOptions
  includeSecrets: boolean
  /** Required when includeSecrets is true; encrypts the whole file. */
  password?: string
}

export type ExportIncludes = Omit<ExportOptions, 'content' | 'password'> & { content: ContentOptions }

export type ExportFile = {
  app: typeof EXPORT_APP_ID
  version: number
  exportedAt: string
  includes: ExportIncludes
  globals: Record<string, JsonObject>
  roles: JsonObject[]
  users: JsonObject[]
  redirects: JsonObject[]
  pageTemplates: JsonObject[]
  fieldGroups: JsonObject[]
  content: {
    pages: JsonObject[]
    posts: JsonObject[]
    products: JsonObject[]
    mediaMetadata: JsonObject[]
  }
  warnings: string[]
}

/* -------------------------------------------------------------------------- */
/* Import sections                                                            */
/* -------------------------------------------------------------------------- */

export const IMPORT_SECTIONS = [
  'settings',
  'headerFooter',
  'roles',
  'users',
  'redirects',
  'pageTemplates',
  'fieldGroups',
  'pages',
  'posts',
  'products',
  'mediaMetadata',
] as const

export type ImportSection = (typeof IMPORT_SECTIONS)[number]

export const SECTION_LABELS: Record<ImportSection, string> = {
  settings: 'Settings',
  headerFooter: 'Header and footer',
  roles: 'Roles',
  users: 'Users',
  redirects: 'Redirects',
  pageTemplates: 'Page templates',
  fieldGroups: 'Field groups',
  pages: 'Pages',
  posts: 'Posts',
  products: 'Products',
  mediaMetadata: 'Media details',
}

export type ImportAction = 'created' | 'updated' | 'skipped' | 'error'

export type ImportItem = {
  key: string
  action: ImportAction
  message?: string
}

export type SectionReport = {
  section: ImportSection
  label: string
  created: number
  updated: number
  skipped: number
  errors: number
  items: ImportItem[]
  /** Section-wide notes that are not about one item, such as data that could not be imported. */
  warnings: string[]
}

export type ImportReport = {
  dryRun: boolean
  exportedAt: string
  version: number
  sections: SectionReport[]
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Deep copy that also drops `undefined` and turns dates into strings, like the wire format does. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** Copy of a document without the given top-level keys. */
export function withoutKeys(doc: JsonObject, keys: readonly string[]): JsonObject {
  const copy = cloneJson(doc)
  for (const key of keys) delete copy[key]
  return copy
}

/**
 * Removes the secret paths from `target` in place. Works on nested objects
 * and walks arrays on `*`.
 */
export function removePaths(target: unknown, paths: readonly string[]): void {
  for (const path of paths) removePath(target, path.split('.'))
}

function removePath(target: unknown, segments: string[]): void {
  if (!target || typeof target !== 'object') return
  const [head, ...rest] = segments
  if (head === '*') {
    if (Array.isArray(target)) target.forEach((item) => removePath(item, rest))
    return
  }
  if (!isPlainObject(target)) return
  if (rest.length === 0) {
    delete target[head]
    return
  }
  removePath(target[head], rest)
}

/**
 * For each secret path, fills in a value that is missing from `target` using
 * the value already stored in `existing`. A secret that is present in the file,
 * even as an empty string or null, is left alone. Array items are matched by
 * `name` when they have one, otherwise by position.
 */
export function injectMissingSecrets(target: JsonObject, existing: JsonObject | null, paths: readonly string[]): void {
  for (const path of paths) injectPath(target, existing, path.split('.'))
}

function injectPath(target: unknown, existing: unknown, segments: string[]): void {
  const [head, ...rest] = segments
  if (head === '*') {
    if (!Array.isArray(target)) return
    const existingItems = Array.isArray(existing) ? existing : []
    target.forEach((item, index) => {
      const name = isPlainObject(item) ? item.name : undefined
      const match =
        (name !== undefined ? existingItems.find((candidate) => isPlainObject(candidate) && candidate.name === name) : undefined) ??
        existingItems[index]
      injectPath(item, match, rest)
    })
    return
  }
  if (!isPlainObject(target)) return
  const existingObject = isPlainObject(existing) ? existing : undefined
  if (rest.length === 0) {
    if (target[head] === undefined && existingObject && existingObject[head] !== undefined) {
      target[head] = existingObject[head]
    }
    return
  }
  injectPath(target[head], existingObject?.[head], rest)
}

/* -------------------------------------------------------------------------- */
/* Parsing                                                                    */
/* -------------------------------------------------------------------------- */

const emptyContent = (): ExportFile['content'] => ({ pages: [], posts: [], products: [], mediaMetadata: [] })

function docList(value: unknown, field: string): JsonObject[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || !value.every(isPlainObject)) {
    throw new ExportFormatError(`The "${field}" part of this file is not a list of records.`)
  }
  return value as JsonObject[]
}

/**
 * Checks an unknown value against the export format and returns a normalised
 * copy. Throws `ExportFormatError` with a message an admin can act on.
 */
export function parseExportFile(raw: unknown): ExportFile {
  if (!isPlainObject(raw)) throw new ExportFormatError('This file is not a settings export.')
  if (raw.app !== EXPORT_APP_ID) throw new ExportFormatError('This is not a Gracengatsby settings export.')

  const version = raw.version
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ExportFormatError('This export has no valid format version.')
  }
  if (version > EXPORT_FORMAT_VERSION) {
    throw new ExportFormatError(
      `This export uses format version ${version}, but this site only reads up to version ${EXPORT_FORMAT_VERSION}. Update the site, then import it again.`,
    )
  }

  const globals = raw.globals === undefined || raw.globals === null ? {} : raw.globals
  if (!isPlainObject(globals) || !Object.values(globals).every(isPlainObject)) {
    throw new ExportFormatError('The "globals" part of this file is not a set of settings.')
  }

  const contentRaw = isPlainObject(raw.content) ? raw.content : {}
  const content = emptyContent()
  content.pages = docList(contentRaw.pages, 'content.pages')
  content.posts = docList(contentRaw.posts, 'content.posts')
  content.products = docList(contentRaw.products, 'content.products')
  content.mediaMetadata = docList(contentRaw.mediaMetadata, 'content.mediaMetadata')

  return {
    app: EXPORT_APP_ID,
    version,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
    includes: isPlainObject(raw.includes) ? (raw.includes as unknown as ExportIncludes) : ({} as ExportIncludes),
    globals: globals as Record<string, JsonObject>,
    roles: docList(raw.roles, 'roles'),
    users: docList(raw.users, 'users'),
    redirects: docList(raw.redirects, 'redirects'),
    pageTemplates: docList(raw.pageTemplates, 'pageTemplates'),
    fieldGroups: docList(raw.fieldGroups, 'fieldGroups'),
    content,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter((w): w is string => typeof w === 'string') : [],
  }
}
