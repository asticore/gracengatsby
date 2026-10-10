// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Engine } from '@/engine'

const { getAdminContext, sendEmail } = vi.hoisted(() => ({
  getAdminContext: vi.fn(),
  sendEmail: vi.fn<(args: { to: string; text?: string }) => Promise<{ ok: boolean; error?: string }>>(async () => ({ ok: true })),
}))

vi.mock('@/admin/auth', () => ({ getAdminContext }))
vi.mock('@/features/email', () => ({ sendEmail }))

import { decryptJson, encryptJson, isEncryptedEnvelope } from '@/features/settingsTransfer/crypto'
import { parseExportOptions, renderExport, buildExport } from '@/features/settingsTransfer/export'
import { EXPORT_FORMAT_VERSION, ExportFormatError, type ExportOptions } from '@/features/settingsTransfer/format'
import { applyImport, planImport, readExportFile } from '@/features/settingsTransfer/import'
import { POST as exportPOST } from '@/app/(engage)/api/admin-settings-export/route'
import { POST as importPOST } from '@/app/(engage)/api/admin-settings-import/route'

type Row = Record<string, unknown> & { id: number }

type FakeState = {
  collections: Record<string, Row[]>
  globals: Record<string, Record<string, unknown>>
}

let nextId = 1000

/** In-memory stand-in for the engine methods the settings transfer uses. */
function makeEngine(state: FakeState) {
  const engine = {
    find: vi.fn(async (args: { collection: string; where?: Record<string, { equals: unknown }>; limit?: number }) => {
      let docs = state.collections[args.collection] ?? []
      if (args.where) {
        for (const [field, condition] of Object.entries(args.where)) {
          docs = docs.filter((doc) => doc[field] === condition.equals)
        }
      }
      return { docs: docs.slice(0, args.limit ?? docs.length) }
    }),
    findGlobal: vi.fn(async (args: { slug: string }) => state.globals[args.slug] ?? null),
    create: vi.fn(async (args: { collection: string; data: Record<string, unknown> }) => {
      const row = { id: nextId++, ...args.data } as Row
      state.collections[args.collection] = [...(state.collections[args.collection] ?? []), row]
      return row
    }),
    update: vi.fn(async (args: { collection: string; id: number; data: Record<string, unknown> }) => {
      const rows = state.collections[args.collection] ?? []
      const row = rows.find((candidate) => candidate.id === args.id)
      if (row) Object.assign(row, args.data)
      return row ?? null
    }),
    updateGlobal: vi.fn(async (args: { slug: string; data: Record<string, unknown> }) => {
      state.globals[args.slug] = { ...(state.globals[args.slug] ?? {}), ...args.data }
      return state.globals[args.slug]
    }),
    forgotPassword: vi.fn(async () => 'tok-123'),
  }
  return engine
}

const asEngine = (engine: ReturnType<typeof makeEngine>) => engine as unknown as Engine

const ALL_OFF: ExportOptions = {
  settings: false,
  headerFooter: false,
  roles: false,
  users: false,
  redirects: false,
  pageTemplates: false,
  fieldGroups: false,
  content: { pages: false, posts: false, products: false, mediaMetadata: false },
  includeSecrets: false,
}

function sourceSite(): FakeState {
  return {
    globals: {
      integrations: {
        id: 1,
        createdAt: '2025-01-01',
        claudeApiKey: 'sk-live-claude',
        google: { mapsApiKey: 'maps-live', ga4MeasurementId: 'G-SOURCE' },
        custom: { keys: [{ name: 'Partner', value: 'partner-live', note: 'n' }] },
      },
      'email-settings': {
        fromEmail: 'hello@example.com',
        resend: { apiKey: 're_live_123' },
        smtp: { host: 'mail.example.com', password: 'smtp-live' },
      },
      'backup-settings': {
        destination: { provider: 'r2', r2: { bucket: 'backups', accessKeyId: 'AKIA', secretAccessKey: 'r2-secret' } },
      },
      'site-settings': { siteName: 'Grace and Gatsby' },
    },
    collections: {
      users: [
        {
          id: 1,
          email: 'admin@example.com',
          roles: ['admin'],
          hash: 'scrypt-hash',
          salt: 'salt-value',
          resetPasswordToken: 'reset-token',
          loginAttempts: 2,
          sessions: [{ id: 'sess' }],
          twoFactor: { enabled: true, secret: 'JBSWY3DPEHPK3PXP' },
        },
        { id: 2, email: 'shopper@example.com', roles: ['customer'], hash: 'customer-hash' },
      ],
      roles: [{ id: 3, name: 'Editor', slug: 'editor', builtIn: true, permissions: { pages: { read: true } } }],
      redirects: [{ id: 4, fromPath: '/old', toPath: '/new', redirectType: '301', enabled: true, hitCount: 12 }],
      pages: [{ id: 5, title: 'About', slug: 'about', parent: 9, _status: 'published', createdAt: 'x' }],
      media: [{ id: 6, filename: 'hero.jpg', alt: 'Hero', mimeType: 'image/jpeg' }],
    },
  }
}

function incomingFile(version = EXPORT_FORMAT_VERSION): Record<string, unknown> {
  return {
    app: 'gracengatsby',
    version,
    exportedAt: '2026-01-01T00:00:00.000Z',
    includes: {},
    globals: {
      integrations: {
        google: { ga4MeasurementId: 'G-INCOMING' },
        custom: { keys: [{ name: 'Partner', note: 'new note' }] },
      },
      'site-settings': { siteName: 'Imported name' },
      'not-a-real-setting': { anything: true },
    },
    roles: [
      { name: 'Editor', slug: 'editor', builtIn: true, permissions: {} },
      { name: 'Reviewer', slug: 'reviewer', builtIn: false, permissions: {} },
    ],
    users: [
      { email: 'Admin@Example.com', roles: ['admin'] },
      { email: 'new.person@example.com', roles: ['editor', 'not-a-role'] },
    ],
    redirects: [{ fromPath: 'old', toPath: '/fresh', redirectType: '301', enabled: true }],
    pageTemplates: [],
    fieldGroups: [],
    content: { pages: [{ title: 'Contact', slug: 'contact' }], posts: [], products: [], mediaMetadata: [] },
    warnings: [],
  }
}

function targetSite(): FakeState {
  return {
    globals: {
      integrations: {
        claudeApiKey: 'claude-existing',
        google: { mapsApiKey: 'maps-existing', ga4MeasurementId: 'G-OLD' },
        custom: { keys: [{ name: 'Partner', value: 'partner-existing', note: 'old' }] },
      },
    },
    collections: {
      users: [{ id: 1, email: 'admin@example.com', roles: ['admin'] }],
      roles: [{ id: 2, name: 'Editor', slug: 'editor', builtIn: true }],
      redirects: [{ id: 3, fromPath: '/old', toPath: '/stale', redirectType: '301', enabled: true }],
      pages: [],
    },
  }
}


describe('settings transfer crypto', () => {
  it('round trips a JSON value and never leaves the plaintext in the envelope', async () => {
    const value = { note: 'hello', secret: 'sk-round-trip' }
    const envelope = await encryptJson(value, 'correct horse battery')

    expect(isEncryptedEnvelope(envelope)).toBe(true)
    expect(envelope.v).toBe(1)
    expect(JSON.stringify(envelope)).not.toContain('sk-round-trip')
    await expect(decryptJson(envelope, 'correct horse battery')).resolves.toEqual(value)
  })

  it('rejects a wrong password with a clear message', async () => {
    const envelope = await encryptJson({ a: 1 }, 'the right password')
    await expect(decryptJson(envelope, 'the wrong password')).rejects.toThrow(/Wrong password/)
  })
})

describe('settings export', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strips secrets and password material by default', async () => {
    const engine = makeEngine(sourceSite())
    const file = await buildExport(asEngine(engine), {
      ...ALL_OFF,
      settings: true,
      users: true,
      redirects: true,
      content: { ...ALL_OFF.content, pages: true, mediaMetadata: true },
    })
    const serialised = JSON.stringify(file)

    for (const secret of ['sk-live-claude', 'maps-live', 'partner-live', 're_live_123', 'smtp-live', 'r2-secret', 'AKIA']) {
      expect(serialised).not.toContain(secret)
    }
    expect(file.globals.integrations).toMatchObject({ google: { ga4MeasurementId: 'G-SOURCE' } })
    expect(file.globals.integrations).toMatchObject({ custom: { keys: [{ name: 'Partner', note: 'n' }] } })
    expect(file.globals['email-settings']).toMatchObject({ fromEmail: 'hello@example.com', smtp: { host: 'mail.example.com' } })
    expect(file.globals['backup-settings']).toMatchObject({ destination: { r2: { bucket: 'backups' } } })

    // Only the admin-panel account is exported, and never its password material.
    expect(file.users).toEqual([{ email: 'admin@example.com', roles: ['admin'] }])
    expect(serialised).not.toMatch(/scrypt-hash|salt-value|reset-token|JBSWY3DPEHPK3PXP|customer-hash/)

    // Noise and relation ids are removed from documents.
    expect(file.redirects).toEqual([{ fromPath: '/old', toPath: '/new', redirectType: '301', enabled: true }])
    expect(file.content.pages).toEqual([{ title: 'About', slug: 'about' }])
    expect(file.version).toBe(EXPORT_FORMAT_VERSION)
    expect(file.app).toBe('gracengatsby')
  })

  it('encrypts the whole file when secrets are included, and it reads back', async () => {
    const engine = makeEngine(sourceSite())
    const options = parseExportOptions({
      settings: true,
      includeSecrets: true,
      password: 'export-password-1',
    })
    const { body, filename, encrypted } = await renderExport(asEngine(engine), options)

    expect(encrypted).toBe(true)
    expect(filename).toMatch(/^gracengatsby-export-\d{4}-\d{2}-\d{2}\.json$/)
    expect(body).not.toContain('sk-live-claude')

    const parsed = JSON.parse(body) as unknown
    await expect(readExportFile(parsed)).rejects.toThrow(/encrypted/)
    await expect(readExportFile(parsed, 'wrong-password-1')).rejects.toThrow(/Wrong password/)
    const file = await readExportFile(parsed, 'export-password-1')
    expect(file.globals.integrations).toMatchObject({ claudeApiKey: 'sk-live-claude' })
  })

  it('requires a password of at least 8 characters when secrets are included', () => {
    expect(() => parseExportOptions({ settings: true, includeSecrets: true })).toThrow(ExportFormatError)
    expect(() => parseExportOptions({ settings: true, includeSecrets: true, password: 'short' })).toThrow(/at least 8/)
  })
})

describe('settings import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('dry run reports counts and writes nothing', async () => {
    const engine = makeEngine(targetSite())
    const report = await planImport(asEngine(engine), incomingFile())

    expect(report.dryRun).toBe(true)
    const section = (name: string) => {
      const found = report.sections.find((item) => item.section === name)
      if (!found) throw new Error(`missing section ${name}`)
      return found
    }

    expect(section('settings')).toMatchObject({ updated: 2, skipped: 1, errors: 0 })
    expect(section('roles')).toMatchObject({ created: 1, skipped: 1, errors: 0 })
    expect(section('users')).toMatchObject({ created: 1, skipped: 1, errors: 0 })
    expect(section('redirects')).toMatchObject({ updated: 1, errors: 0 })
    expect(section('pages')).toMatchObject({ created: 1, errors: 0 })

    expect(engine.create).not.toHaveBeenCalled()
    expect(engine.update).not.toHaveBeenCalled()
    expect(engine.updateGlobal).not.toHaveBeenCalled()
    expect(engine.forgotPassword).not.toHaveBeenCalled()
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('apply keeps secrets that are missing from the file, and sends set-password emails to new users', async () => {
    const state = targetSite()
    const engine = makeEngine(state)
    await applyImport(asEngine(engine), incomingFile(), { origin: 'https://site.example' })

    const integrationsWrite = engine.updateGlobal.mock.calls.find((call) => call[0].slug === 'integrations')?.[0]
    expect(integrationsWrite?.data).toMatchObject({
      claudeApiKey: 'claude-existing',
      google: { mapsApiKey: 'maps-existing', ga4MeasurementId: 'G-INCOMING' },
      custom: { keys: [{ name: 'Partner', value: 'partner-existing', note: 'new note' }] },
    })

    const created = state.collections.users.find((user) => user.email === 'new.person@example.com')
    expect(created?.roles).toEqual(['editor'])
    expect(created?.hash).toBeUndefined()
    expect(typeof created?.password).toBe('string')
    expect(sendEmail).toHaveBeenCalledTimes(1)
    expect(sendEmail.mock.calls[0]?.[0]).toMatchObject({ to: 'new.person@example.com' })
    expect(String(sendEmail.mock.calls[0]?.[0]?.text)).toContain('https://site.example/account/reset-password?token=tok-123')

    // Existing built-in role and existing account are left alone.
    expect(state.collections.roles.find((role) => role.slug === 'editor')?.builtIn).toBe(true)
    expect(state.collections.users.find((user) => user.email === 'admin@example.com')?.roles).toEqual(['admin'])
  })

  it('imports admin users as editors unless allowAdminUsers is set, and the check says so', async () => {
    const file = { ...incomingFile(), users: [{ email: 'boss@example.com', roles: ['admin', 'editor'] }] }

    const planEngine = makeEngine(targetSite())
    const planned = await planImport(asEngine(planEngine), file)
    const usersPlan = planned.sections.find((section) => section.section === 'users')
    expect(usersPlan?.items).toContainEqual(
      expect.objectContaining({ key: 'boss@example.com', action: 'created', message: expect.stringMatching(/imported as editor/) }),
    )

    const defaultState = targetSite()
    await applyImport(asEngine(makeEngine(defaultState)), file)
    expect(defaultState.collections.users.find((user) => user.email === 'boss@example.com')?.roles).toEqual(['editor'])

    const allowedState = targetSite()
    await applyImport(asEngine(makeEngine(allowedState)), file, { allowAdminUsers: true })
    expect(allowedState.collections.users.find((user) => user.email === 'boss@example.com')?.roles).toEqual(['admin', 'editor'])
  })

  it('drops uploaded and local fonts from imported site settings, resets heading or body that used them, and warns', async () => {
    const localFont = (id: string, family: string) => ({
      id,
      family,
      source: 'upload',
      weights: [400],
      italic: false,
      local: true,
      files: { '400-normal': `/api/media/file/font-${id}-400-normal.woff2` },
    })
    const file = {
      ...incomingFile(),
      globals: {
        'site-settings': {
          theme: {
            headingFont: 'brand-sans',
            bodyFont: 'lora',
            customFonts: [
              localFont('brand-sans', 'Brand Sans'),
              { id: 'lora', family: 'Lora', source: 'google', weights: [400], italic: false, local: false, files: {} },
              localFont('other-local', 'Other Local'),
            ],
          },
        },
      },
    }

    const state = targetSite()
    const engine = makeEngine(state)
    const planned = await planImport(asEngine(engine), file)
    const settings = planned.sections.find((section) => section.section === 'settings')
    expect(settings?.warnings).toEqual([expect.stringMatching(/Brand Sans, Other Local.*Install them again/)])
    expect(engine.updateGlobal).not.toHaveBeenCalled()

    await applyImport(asEngine(makeEngine(state)), file)
    const written = state.globals['site-settings']?.theme as {
      headingFont: string
      bodyFont: string
      customFonts: Array<{ id: string }>
    }
    expect(written.customFonts.map((font) => font.id)).toEqual(['lora'])
    expect(written.headingFont).toBe('cormorant')
    expect(written.bodyFont).toBe('lora')
  })

  it('leaves site settings alone and reports no warning when the file has no uploaded fonts', async () => {
    const report = await planImport(asEngine(makeEngine(targetSite())), incomingFile())
    expect(report.sections.every((section) => section.warnings.length === 0)).toBe(true)
  })

  it('refuses a file from a newer format version', async () => {
    const engine = makeEngine(targetSite())
    await expect(planImport(asEngine(engine), incomingFile(EXPORT_FORMAT_VERSION + 1))).rejects.toThrow(
      /newer|only reads up to/,
    )
    await expect(readExportFile(incomingFile(EXPORT_FORMAT_VERSION + 1))).rejects.toThrow(ExportFormatError)
  })

  it('accepts an older format version and rejects a file from another app', async () => {
    await expect(readExportFile(incomingFile(1))).resolves.toMatchObject({ version: 1 })
    await expect(readExportFile({ ...incomingFile(), app: 'other-cms' })).rejects.toThrow(/Gracengatsby/)
  })
})

describe('settings transfer routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 to a non-admin on both routes', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: false, can: () => false, engine: {} })

    const exported = await exportPOST(
      new Request('http://x/api/admin-settings-export', { method: 'POST', body: JSON.stringify({ settings: true }) }),
    )
    expect(exported.status).toBe(403)

    const imported = await importPOST(
      new Request('http://x/api/admin-settings-import', {
        method: 'POST',
        body: JSON.stringify({ file: {}, dryRun: true }),
      }),
    )
    expect(imported.status).toBe(403)
  })

  it('returns 400 for a secrets export without a long enough password', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => true, engine: makeEngine(sourceSite()) })

    const response = await exportPOST(
      new Request('http://x/api/admin-settings-export', {
        method: 'POST',
        body: JSON.stringify({ settings: true, includeSecrets: true, password: 'short' }),
      }),
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.stringMatching(/at least 8/) })
  })

  it('refuses a body declared larger than 25 MB with 413 before parsing it', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => true, engine: makeEngine(targetSite()) })
    const request = new Request('http://x/api/admin-settings-import', {
      method: 'POST',
      headers: { 'content-length': String(25 * 1024 * 1024 + 1) },
      body: '{}',
    })
    const json = vi.spyOn(request, 'json')
    const response = await importPOST(request)
    expect(response.status).toBe(413)
    expect(json).not.toHaveBeenCalled()
  })

  it('rejects a non-boolean allowAdminUsers and passes a true one through to the import', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => true, engine: makeEngine(targetSite()) })
    const bad = await importPOST(
      new Request('http://x/api/admin-settings-import', {
        method: 'POST',
        body: JSON.stringify({ file: incomingFile(), dryRun: true, allowAdminUsers: 'yes' }),
      }),
    )
    expect(bad.status).toBe(400)

    const engine = makeEngine(targetSite())
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => true, engine })
    const file = { ...incomingFile(), users: [{ email: 'boss@example.com', roles: ['admin'] }] }
    const ok = await importPOST(
      new Request('http://x/api/admin-settings-import', {
        method: 'POST',
        body: JSON.stringify({ file, dryRun: false, sections: ['users'], allowAdminUsers: true }),
      }),
    )
    expect(ok.status).toBe(200)
    const created = (engine.create.mock.calls as unknown as Array<[{ data: { roles: string[] } }]>).find(
      ([args]) => args.data.roles?.includes('admin'),
    )
    expect(created?.[0].data.roles).toEqual(['admin'])
  })

  it('runs a dry run through the import route and reports the counts', async () => {
    getAdminContext.mockResolvedValue({ isAdmin: true, can: () => true, engine: makeEngine(targetSite()) })

    const response = await importPOST(
      new Request('http://x/api/admin-settings-import', {
        method: 'POST',
        body: JSON.stringify({ file: incomingFile(), dryRun: true, sections: ['pages'] }),
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { report: { dryRun: boolean; sections: Array<{ section: string; created: number }> } }
    expect(body.report.dryRun).toBe(true)
    expect(body.report.sections).toEqual([expect.objectContaining({ section: 'pages', created: 1 })])
  })
})
