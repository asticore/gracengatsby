import type { Engine } from '@/engine'

import { decryptJson, DecryptionError, isEncryptedEnvelope } from './crypto'
import {
  ALL_GLOBAL_SLUGS,
  DOC_NOISE_KEYS,
  ExportFormatError,
  HEADER_FOOTER_GLOBALS,
  IMPORTABLE_USER_ROLES,
  IMPORT_SECTIONS,
  RELATION_KEYS,
  SECRET_PATHS,
  SECTION_LABELS,
  cloneJson,
  injectMissingSecrets,
  isPlainObject,
  parseExportFile,
  withoutKeys,
  type ExportFile,
  type ImportAction,
  type ImportItem,
  type ImportReport,
  type ImportSection,
  type JsonObject,
  type SectionReport,
} from './format'

/** How long a set-password link from an import stays valid. */
const SET_PASSWORD_TTL_MS = 7 * 24 * 60 * 60 * 1000

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/* -------------------------------------------------------------------------- */
/* Reading the uploaded file                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Turns the uploaded JSON into a checked export. An encrypted envelope is
 * opened with the password first. Throws `ExportFormatError` with a message
 * the admin can read.
 */
export async function readExportFile(raw: unknown, password?: string): Promise<ExportFile> {
  if (isEncryptedEnvelope(raw)) {
    if (!password) {
      throw new ExportFormatError('This export is encrypted. Enter the password it was exported with.')
    }
    try {
      return parseExportFile(await decryptJson(raw, password))
    } catch (error) {
      if (error instanceof DecryptionError) throw new ExportFormatError(error.message)
      throw error
    }
  }
  return parseExportFile(raw)
}

/** Validates the sections list from a request. Undefined means all sections. */
export function parseImportSections(raw: unknown): ImportSection[] | undefined {
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === 'string')) {
    throw new ExportFormatError('"sections" must be a list of section names.')
  }
  const unknown = raw.filter((item) => !(IMPORT_SECTIONS as readonly string[]).includes(item))
  if (unknown.length > 0) throw new ExportFormatError(`Unknown section: ${unknown.join(', ')}.`)
  return raw as ImportSection[]
}

/* -------------------------------------------------------------------------- */
/* Running an import                                                          */
/* -------------------------------------------------------------------------- */

export type ImportOptions = {
  sections?: ImportSection[]
  /** Site address, e.g. https://example.com. Needed for set-password emails. */
  origin?: string
  /** Keep the admin role on imported users. Off by default: they become editors. */
  allowAdminUsers?: boolean
}

/**
 * Dry run. Reads the database and reports what an apply would create, update
 * and skip. Writes nothing. It cannot run field validation without writing, so
 * an apply can still report errors the check did not show.
 */
export function planImport(engine: Engine, input: unknown, options: ImportOptions = {}): Promise<ImportReport> {
  return runImport(engine, input, { mode: 'plan', ...options })
}

/** Applies the import. Each item is written on its own, and a failure is reported without stopping the rest. */
export function applyImport(engine: Engine, input: unknown, options: ImportOptions = {}): Promise<ImportReport> {
  return runImport(engine, input, { mode: 'apply', ...options })
}

type RunContext = {
  engine: Engine
  file: ExportFile
  mode: 'plan' | 'apply'
  origin?: string
  allowAdminUsers: boolean
}

async function runImport(
  engine: Engine,
  input: unknown,
  options: ImportOptions & { mode: 'plan' | 'apply' },
): Promise<ImportReport> {
  const file = parseExportFile(input)
  const requested = options.sections
    ? IMPORT_SECTIONS.filter((section) => options.sections?.includes(section))
    : [...IMPORT_SECTIONS]

  const ctx: RunContext = {
    engine,
    file,
    mode: options.mode,
    origin: options.origin,
    allowAdminUsers: options.allowAdminUsers === true,
  }
  const sections: SectionReport[] = []
  for (const section of requested) {
    const report = newReport(section)
    await runSection(ctx, section, report)
    sections.push(report)
  }

  return {
    dryRun: options.mode === 'plan',
    exportedAt: file.exportedAt,
    version: file.version,
    sections,
  }
}

function newReport(section: ImportSection): SectionReport {
  return { section, label: SECTION_LABELS[section], created: 0, updated: 0, skipped: 0, errors: 0, items: [], warnings: [] }
}

function record(report: SectionReport, key: string, action: ImportAction, message?: string): void {
  if (action === 'created') report.created += 1
  if (action === 'updated') report.updated += 1
  if (action === 'skipped') report.skipped += 1
  if (action === 'error') report.errors += 1
  const item: ImportItem = message ? { key, action, message } : { key, action }
  report.items.push(item)
}

function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : 'Unknown error'
  return text.length > 300 ? `${text.slice(0, 300)}...` : text
}

function normalisePath(path: string): string {
  const trimmed = path.trim()
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const textOf = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

async function runSection(ctx: RunContext, section: ImportSection, report: SectionReport): Promise<void> {
  const { file } = ctx
  switch (section) {
    case 'settings':
    case 'headerFooter':
      return importGlobals(ctx, section, report)
    case 'roles':
      return importUpserts(ctx, report, file.roles, {
        collection: 'roles',
        matchField: 'slug',
        keyOf: (item) => textOf(item.slug) || null,
        prepare: (item) => ({
          name: item.name,
          slug: textOf(item.slug),
          description: item.description,
          permissions: item.permissions,
          builtIn: false,
        }),
        skipReason: (existing) =>
          existing.builtIn === true ? 'Built-in role, defined by the site. Left as it is.' : undefined,
      })
    case 'users':
      return importUsers(ctx, report)
    case 'redirects':
      return importUpserts(ctx, report, file.redirects, {
        collection: 'redirects',
        matchField: 'fromPath',
        keyOf: (item) => (textOf(item.fromPath) ? normalisePath(textOf(item.fromPath)) : null),
        prepare: (item) => ({
          fromPath: normalisePath(textOf(item.fromPath)),
          toPath: item.toPath,
          redirectType: item.redirectType,
          enabled: item.enabled !== false,
          note: item.note,
        }),
      })
    case 'pageTemplates':
      return importUpserts(ctx, report, file.pageTemplates, {
        collection: 'page-templates',
        matchField: 'name',
        keyOf: (item) => textOf(item.name) || null,
        prepare: (item) => withoutKeys(item, [...DOC_NOISE_KEYS, ...RELATION_KEYS]),
      })
    case 'fieldGroups':
      return importUpserts(ctx, report, file.fieldGroups, {
        collection: 'field-groups',
        matchField: 'name',
        keyOf: (item) => textOf(item.name) || null,
        prepare: (item) => withoutKeys(item, [...DOC_NOISE_KEYS, ...RELATION_KEYS]),
      })
    case 'pages':
      return importUpserts(ctx, report, file.content.pages, slugSpec('pages'))
    case 'posts':
      return importUpserts(ctx, report, file.content.posts, slugSpec('posts'))
    case 'products':
      return importUpserts(ctx, report, file.content.products, slugSpec('products'))
    case 'mediaMetadata':
      return importMediaDetails(ctx, report)
  }
}

function slugSpec(collection: string): UpsertSpec {
  return {
    collection,
    matchField: 'slug',
    keyOf: (item) => textOf(item.slug) || null,
    prepare: (item) => withoutKeys(item, [...DOC_NOISE_KEYS, ...RELATION_KEYS]),
  }
}

/* -------------------------------------------------------------------------- */
/* Globals                                                                    */
/* -------------------------------------------------------------------------- */

/** Built-in fonts a heading or body font falls back to when its uploaded font is not imported. */
const BUILT_IN_FONT_DEFAULTS = { headingFont: 'cormorant', bodyFont: 'jost' } as const

/**
 * Font files are not in the export, so local and uploaded fonts cannot be
 * restored. They are removed from the theme being imported, and a heading or
 * body font that pointed at one goes back to its built-in default. Returns the
 * family names that were dropped. `doc` is the copy being written and is changed in place.
 */
function withoutLocalFonts(doc: JsonObject): string[] {
  const theme = doc.theme
  if (!isPlainObject(theme) || !Array.isArray(theme.customFonts)) return []

  const kept: unknown[] = []
  const dropped: JsonObject[] = []
  for (const entry of theme.customFonts) {
    if (isPlainObject(entry) && (entry.local === true || entry.source === 'upload')) dropped.push(entry)
    else kept.push(entry)
  }
  if (dropped.length === 0) return []

  const droppedIds = new Set<unknown>(dropped.map((entry) => entry.id))
  const updated: JsonObject = { ...theme, customFonts: kept }
  for (const [field, fallback] of Object.entries(BUILT_IN_FONT_DEFAULTS)) {
    if (droppedIds.has(theme[field])) updated[field] = fallback
  }
  doc.theme = updated
  return dropped.map((entry) => (typeof entry.family === 'string' && entry.family ? entry.family : String(entry.id)))
}

async function importGlobals(ctx: RunContext, section: ImportSection, report: SectionReport): Promise<void> {
  const { engine, file, mode } = ctx
  for (const [slug, doc] of Object.entries(file.globals)) {
    const belongsTo: ImportSection = (HEADER_FOOTER_GLOBALS as readonly string[]).includes(slug)
      ? 'headerFooter'
      : 'settings'

    if (!ALL_GLOBAL_SLUGS.includes(slug)) {
      if (section === 'settings') record(report, slug, 'skipped', 'Not a setting this site has. Left out.')
      continue
    }
    if (belongsTo !== section) continue

    try {
      const existing = (await engine.findGlobal({ slug, depth: 0, overrideAccess: true })) as JsonObject | null
      const next = withoutKeys(doc, DOC_NOISE_KEYS)
      if (slug === 'site-settings') {
        const dropped = withoutLocalFonts(next)
        if (dropped.length > 0) {
          report.warnings.push(
            `Font files are not part of the export, so these fonts were not imported: ${dropped.join(', ')}. Install them again in the font settings.`,
          )
        }
      }
      // Secrets missing from the file keep whatever the site already holds.
      injectMissingSecrets(next, existing, SECRET_PATHS[slug] ?? [])
      if (mode === 'apply') {
        await engine.updateGlobal({ slug, data: next, overrideAccess: true })
      }
      record(report, slug, 'updated')
    } catch (error) {
      record(report, slug, 'error', errorMessage(error))
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Matched records                                                            */
/* -------------------------------------------------------------------------- */

type UpsertSpec = {
  collection: string
  /** Field the record is matched on. */
  matchField: string
  keyOf: (item: JsonObject) => string | null
  prepare: (item: JsonObject) => JsonObject
  /** Return a reason to leave an existing record alone. */
  skipReason?: (existing: JsonObject) => string | undefined
  /** A note about a record that will be created, shown in both the check and the apply. */
  noteOf?: (item: JsonObject) => string | undefined
  /** Runs after a create in apply mode. Returns a note to show, if any. */
  afterCreate?: (doc: JsonObject, key: string) => Promise<string | undefined>
}

async function findOne(engine: Engine, collection: string, field: string, value: string): Promise<JsonObject | null> {
  const result = await engine.find({
    collection,
    where: { [field]: { equals: value } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  const doc = result.docs?.[0]
  return doc ? (doc as JsonObject) : null
}

async function importUpserts(
  ctx: RunContext,
  report: SectionReport,
  items: JsonObject[],
  spec: UpsertSpec,
): Promise<void> {
  const { engine, mode } = ctx
  for (const item of items) {
    const key = spec.keyOf(item)
    if (!key) {
      record(report, '(unnamed)', 'error', 'This item has no name or address to match it by.')
      continue
    }

    try {
      const existing = await findOne(engine, spec.collection, spec.matchField, key)
      if (existing) {
        const reason = spec.skipReason?.(existing)
        if (reason) {
          record(report, key, 'skipped', reason)
          continue
        }
      }

      const data = cloneJson(spec.prepare(item))
      const planNote = existing ? undefined : spec.noteOf?.(item)
      if (mode === 'plan') {
        record(report, key, existing ? 'updated' : 'created', planNote)
        continue
      }

      if (existing) {
        await engine.update({ collection: spec.collection, id: existing.id as number, data, overrideAccess: true })
        record(report, key, 'updated')
        continue
      }

      const doc = (await engine.create({ collection: spec.collection, data, overrideAccess: true })) as JsonObject
      let followUp: string | undefined
      if (spec.afterCreate) {
        try {
          followUp = await spec.afterCreate(doc, key)
        } catch (error) {
          followUp = `Created, but a follow-up step failed: ${errorMessage(error)}`
        }
      }
      record(report, key, 'created', [planNote, followUp].filter(Boolean).join(' ') || undefined)
    } catch (error) {
      record(report, key, 'error', errorMessage(error))
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

/** A random password nobody knows. The account owner sets their own through the reset link. */
function randomPassword(): string {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] as string)

/** Emails a set-password link to a newly created user. Returns a note when the email did not go out. */
async function sendSetPasswordEmail(engine: Engine, email: string, origin: string | undefined): Promise<string | undefined> {
  if (!origin) {
    return 'Created with a random password. No set-password email was sent because the site address is unknown.'
  }

  const token = await engine.forgotPassword({
    collection: 'users',
    data: { email },
    disableEmail: true,
    expiration: SET_PASSWORD_TTL_MS,
  })
  if (!token) return 'Created, but no set-password link could be made.'

  const link = `${origin}/account/reset-password?token=${encodeURIComponent(token)}`
  const body = [
    'An account has been created for you.',
    `Choose your password here. The link works once and expires in 7 days:\n${link}`,
    'If you were not expecting this, you can ignore this email.',
  ].join('\n\n')

  const { sendEmail } = await import('@/features/email')
  const result = await sendEmail({
    to: email,
    subject: 'Set your password',
    text: body,
    html: `${body
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br />')}</p>`)
      .join('\n')}`,
  })
  if (result.ok) return undefined
  return `Created, but the set-password email was not sent: ${result.error ?? result.reason ?? 'unknown reason'}`
}

/**
 * The roles a new account gets from the file. The admin role is kept only when
 * the admin allowed it; otherwise it becomes editor. `downgraded` is true when that happened.
 */
function importedRoles(item: JsonObject, allowAdminUsers: boolean): { roles: string[]; downgraded: boolean } {
  const listed = Array.isArray(item.roles)
    ? item.roles.filter((role): role is string => (IMPORTABLE_USER_ROLES as readonly unknown[]).includes(role))
    : []
  const downgraded = !allowAdminUsers && listed.includes('admin')
  const mapped = listed.map((role) => (role === 'admin' && downgraded ? 'editor' : role))
  const roles = [...new Set(mapped)]
  return { roles: roles.length > 0 ? roles : ['customer'], downgraded }
}

async function importUsers(ctx: RunContext, report: SectionReport): Promise<void> {
  const { engine, file, origin, allowAdminUsers } = ctx
  await importUpserts(ctx, report, file.users, {
    collection: 'users',
    matchField: 'email',
    keyOf: (item) => {
      const email = textOf(item.email).toLowerCase()
      return EMAIL_PATTERN.test(email) ? email : null
    },
    prepare: (item) => {
      const email = textOf(item.email).toLowerCase()
      return {
        email,
        roles: importedRoles(item, allowAdminUsers).roles,
        // Hashes, salts and 2FA secrets are never imported. The account gets a
        // random password and the owner sets their own from the emailed link.
        password: randomPassword(),
      }
    },
    skipReason: () => 'Account already exists. Left unchanged.',
    noteOf: (item) =>
      importedRoles(item, allowAdminUsers).downgraded
        ? 'Admin role imported as editor. Tick "Allow admin accounts" to keep it.'
        : undefined,
    afterCreate: (_doc, email) => sendSetPasswordEmail(engine, email, origin),
  })
}

/* -------------------------------------------------------------------------- */
/* Media details                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Files are not in the export, so this section only updates the alt text of
 * images already uploaded here. A missing file is skipped rather than created,
 * which would leave a record pointing at nothing.
 */
async function importMediaDetails(ctx: RunContext, report: SectionReport): Promise<void> {
  const { engine, file, mode } = ctx
  for (const item of file.content.mediaMetadata) {
    const filename = textOf(item.filename)
    if (!filename) {
      record(report, '(unnamed)', 'error', 'This item has no file name to match it by.')
      continue
    }
    try {
      const existing = await findOne(engine, 'media', 'filename', filename)
      if (!existing) {
        record(report, filename, 'skipped', 'No uploaded image has this file name. Upload it first, then import again.')
        continue
      }
      if (typeof item.alt !== 'string') {
        record(report, filename, 'skipped', 'No alt text in the file.')
        continue
      }
      if (mode === 'apply') {
        await engine.update({ collection: 'media', id: existing.id as number, data: { alt: item.alt }, overrideAccess: true })
      }
      record(report, filename, 'updated')
    } catch (error) {
      record(report, filename, 'error', errorMessage(error))
    }
  }
}

