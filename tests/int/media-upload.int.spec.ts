// @vitest-environment node
// Uploading any safe file type to the media library: the allow-list, content
// sniffing, name handling, the hostile cases (spoofed type, double extension,
// NUL bytes, huge names, zip bombs, SVG) and the upload route's status codes.
import { describe, expect, it, vi } from 'vitest'

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn(async () => ({ env: {} })) }))
const storage = vi.hoisted(() => ({
  putMediaObject: vi.fn(async () => undefined),
  putOriginalIfMissing: vi.fn(async () => true),
  readMediaObject: vi.fn(async () => null),
  deleteMediaObject: vi.fn(async () => undefined),
}))
vi.mock('@/localapi/storage', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/localapi/storage')>()), ...storage }))

const authorize = vi.hoisted(() => ({ engine: null as unknown, allowed: true }))
vi.mock('@/features/media/access', () => ({
  authorizeMedia: vi.fn(async () =>
    authorize.allowed ? { context: { engine: authorize.engine } } : { response: Response.json({ error: 'Forbidden' }, { status: 403 }) },
  ),
  parseId: (value: unknown) => Number(value) || null,
}))

import {
  ACCEPTED_TYPES,
  DEFAULT_UPLOAD_POLICY,
  MAX_BASE_NAME_LENGTH,
  UploadRefusal,
  cleanFileName,
  fileKindOf,
  inspectUpload,
  resolveUploadPolicy,
} from '@/features/media/fileTypes'
import { prepareUploadFile } from '@/features/media/uploadHook'
import { ValidationError } from '@/localapi/operations'
import { generateUploadFields, type UploadFile } from '@/localapi/uploads'
import { applySafeServingHeaders } from '@/localapi/storage'

const png = Uint8Array.from(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'),
)
const text = (value: string) => new TextEncoder().encode(value)
const pad = (head: number[] | Uint8Array, total = 64) => {
  const out = new Uint8Array(Math.max(total, head.length))
  out.set(head)
  return out
}
const ascii = (value: string, at = 0, total = 64) => {
  const out = new Uint8Array(total)
  out.set(text(value), at)
  return out
}

const samples: Record<string, Uint8Array> = {
  jpg: pad([0xff, 0xd8, 0xff, 0xe0]),
  jpeg: pad([0xff, 0xd8, 0xff, 0xe0]),
  png,
  gif: ascii('GIF89a'),
  webp: Uint8Array.from([...text('RIFF'), 0, 0, 0, 0, ...text('WEBP'), ...new Uint8Array(40)]),
  avif: Uint8Array.from([0, 0, 0, 0x1c, ...text('ftypavif'), ...new Uint8Array(40)]),
  pdf: text('%PDF-1.7\n%\xe2\xe3\n1 0 obj\n'),
  doc: pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  docx: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...text('[Content_Types].xml'), ...new Uint8Array(40)]),
  xls: pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  xlsx: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...text('[Content_Types].xml'), ...new Uint8Array(40)]),
  ppt: pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  pptx: Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...text('[Content_Types].xml'), ...new Uint8Array(40)]),
  csv: text('name,qty\nwidget,3\n'),
  txt: text('Just some notes.\n'),
  zip: pad([0x50, 0x4b, 0x03, 0x04]),
  mp3: ascii('ID3'),
  wav: Uint8Array.from([...text('RIFF'), 0, 0, 0, 0, ...text('WAVE'), ...new Uint8Array(40)]),
  mp4: ascii('ftypisom', 4),
  webm: pad([0x1a, 0x45, 0xdf, 0xa3]),
  mov: ascii('ftypqt  ', 4),
}

const file = (name: string, mimetype: string, data: Uint8Array): UploadFile => ({ name, mimetype, data, size: data.byteLength })
const refused = (upload: UploadFile, policy = DEFAULT_UPLOAD_POLICY) => {
  try {
    inspectUpload(upload, policy)
  } catch (error) {
    expect(error).toBeInstanceOf(UploadRefusal)
    return error as UploadRefusal
  }
  throw new Error(`expected ${upload.name} to be refused`)
}

describe('accepted file types', () => {
  it('has a sample for every type on the menu', () => {
    for (const type of ACCEPTED_TYPES) expect(samples[type.extension], type.extension).toBeDefined()
  })

  it.each(Object.keys(samples))('accepts a real .%s and stores the type found from its bytes', (extension) => {
    const entry = ACCEPTED_TYPES.find((type) => type.extension === extension)!
    // The declared type is deliberately wrong: it must be ignored.
    const result = inspectUpload(file(`Sample File.${extension.toUpperCase()}`, 'application/octet-stream', samples[extension]))
    expect(result.mimeType).toBe(entry.mimeType)
    expect(result.name).toBe(`Sample File.${extension}`)
  })

  it('covers every kind the request named', () => {
    const extensions = ACCEPTED_TYPES.map((type) => type.extension)
    for (const wanted of ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'csv', 'txt', 'zip', 'mp3', 'wav', 'mp4', 'webm', 'mov', 'jpg', 'png', 'gif', 'webp']) {
      expect(extensions).toContain(wanted)
    }
  })

  it('stores a picture under what it really is when the name disagrees', () => {
    expect(inspectUpload(file('photo.jpg', 'image/jpeg', png)).mimeType).toBe('image/png')
  })

  it('names a pasted file with no extension from its contents', () => {
    const result = inspectUpload(file('image', 'image/png', png))
    expect(result).toMatchObject({ name: 'image.png', mimeType: 'image/png' })
  })

  it('does not guess plain text for a file with no extension', () => {
    expect(refused(file('notes', 'text/plain', text('hello'))).message).toMatch(/could not be recognised/)
  })
})

describe('hostile uploads', () => {
  it('refuses a spoofed type: an executable sent as a PDF', () => {
    const exe = pad([0x4d, 0x5a, 0x90, 0x00])
    expect(refused(file('invoice.pdf', 'application/pdf', exe)).message).toMatch(/not a real PDF/)
    expect(refused(file('invoice.png', 'image/png', exe)).message).toMatch(/not a supported picture/)
    expect(refused(file('invoice.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', exe)).message).toMatch(/not a real/)
  })

  it('refuses a ZIP that is not an Office file when named .docx', () => {
    expect(refused(file('x.docx', 'application/zip', samples.zip)).message).toMatch(/not a real Word document/)
  })

  it('refuses HTML hidden under a harmless name or type', () => {
    const html = text('<!doctype html><script>alert(1)</script>')
    expect(refused(file('notes.txt', 'text/plain', html)).message).toMatch(/not a real/)
    expect(refused(file('page.csv', 'text/csv', text('  <html><body>'))).message).toMatch(/not a real/)
    expect(refused(file('notes.txt', 'text/html', text('hello'))).message).toMatch(/not allowed/)
    expect(refused(file('picture.png', 'text/html', png)).message).toMatch(/not allowed/)
  })

  it('refuses binary data under a text name', () => {
    expect(refused(file('data.txt', 'text/plain', pad([1, 2, 3, 0, 0]))).message).toMatch(/not a real/)
  })

  it('refuses double extensions in either order', () => {
    expect(refused(file('x.pdf.exe', 'application/pdf', samples.pdf)).message).toMatch(/not allowed/)
    expect(refused(file('x.exe.pdf', 'application/pdf', samples.pdf)).message).toMatch(/not allowed/)
    expect(refused(file('shell.php.jpg', 'image/jpeg', samples.jpg)).message).toMatch(/not allowed/)
    expect(refused(file('page.html.png', 'image/png', png)).message).toMatch(/not allowed/)
    expect(refused(file('run.pdf.js', 'application/pdf', samples.pdf)).message).toMatch(/not allowed/)
  })

  it('still allows a harmless dot in the middle of a name', () => {
    expect(inspectUpload(file('report v1.2 final.pdf', 'application/pdf', samples.pdf)).name).toBe('report v1.2 final.pdf')
    expect(inspectUpload(file('example.com logo.png', 'image/png', png)).name).toBe('example.com logo.png')
  })

  it('refuses a null byte in the name, including one that hides an extension', () => {
    expect(refused(file('evil.pdf\0.exe', 'application/pdf', samples.pdf)).status).toBe(400)
    expect(refused(file('a\0b.pdf', 'application/pdf', samples.pdf)).status).toBe(400)
  })

  it('removes control characters, path parts and bidi overrides from the name', () => {
    expect(cleanFileName('..\\..//etc/pass‮wd\u0007.txt')).toEqual({ base: '....etcpasswd'.replace(/^\.+/, ''), extension: 'txt' })
    const result = inspectUpload(file('inv‮oice.pdf', 'application/pdf', samples.pdf))
    expect(result.name).toBe('invoice.pdf')
  })

  it('shortens a huge name and keeps the extension', () => {
    const huge = `${'a'.repeat(5000)}.pdf`
    const result = inspectUpload(file(huge, 'application/pdf', samples.pdf))
    expect(result.name.length).toBeLessThanOrEqual(MAX_BASE_NAME_LENGTH + 4)
    expect(result.name.endsWith('.pdf')).toBe(true)
    expect(inspectUpload(file(`${'b'.repeat(300)}.jpg`, 'image/jpeg', samples.jpg)).name.length).toBeLessThanOrEqual(MAX_BASE_NAME_LENGTH + 4)
  })

  it('refuses a name that cleans to nothing', () => {
    expect(refused(file('???.pdf', 'application/pdf', samples.pdf)).message).toMatch(/needs a name/)
    expect(refused(file('...pdf', 'application/pdf', samples.pdf)).status).toBeDefined()
  })

  it('refuses SVG however it is presented', () => {
    const svg = text('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>')
    expect(refused(file('logo.svg', 'image/svg+xml', svg)).message).toMatch(/not allowed/)
    expect(refused(file('logo.svgz', 'image/svg+xml', svg)).message).toMatch(/not allowed/)
    expect(refused(file('logo.png', 'image/svg+xml', svg)).message).toMatch(/not allowed/)
    expect(refused(file('logo.png', 'image/png', svg)).message).toMatch(/not a supported picture/)
    expect(refused(file('logo.txt', 'text/plain', svg)).message).toMatch(/not a real/)
    expect(refused(file('logo', 'application/octet-stream', svg)).message).toMatch(/could not be recognised/)
  })

  it('refuses executables, scripts and markup by extension and by declared type', () => {
    for (const name of ['a.exe', 'a.dll', 'a.bat', 'a.sh', 'a.js', 'a.php', 'a.py', 'a.html', 'a.htm', 'a.xml', 'a.msi', 'a.jar', 'a.ps1', 'a.vbs']) {
      expect(() => inspectUpload(file(name, 'application/octet-stream', pad([1, 2, 3])))).toThrow(UploadRefusal)
    }
    for (const type of ['application/x-msdownload', 'text/javascript', 'application/xhtml+xml', 'text/html; charset=utf-8', 'TEXT/XML']) {
      expect(() => inspectUpload(file('a.txt', type, text('hello')))).toThrow(UploadRefusal)
    }
  })

  it('never opens an archive: a tiny zip claiming a gigantic payload is stored exactly as sent', async () => {
    // A local header that declares a 4 GB uncompressed entry. Nothing here may try to expand it.
    const header = new Uint8Array(64)
    header.set([0x50, 0x4b, 0x03, 0x04], 0)
    new DataView(header.buffer).setUint32(22, 0xffffffff, true)
    const upload = file('bomb.zip', 'application/zip', header)
    const prepared = await prepareUploadFile(upload)
    expect(prepared.file.data).toBe(header)
    expect(prepared.file.size).toBe(64)
    const fields = await generateUploadFields({ file: prepared.file, filenameExists: async () => false, optimisation: prepared })
    expect(fields).toMatchObject({ filename: 'bomb.zip', mimeType: 'application/zip', filesize: 64 })
  })

  it('refuses an empty file', () => {
    expect(refused(file('empty.pdf', 'application/pdf', new Uint8Array(0))).status).toBe(400)
  })
})

describe('size limit and allow-list settings', () => {
  it('defaults to 25 MB and refuses larger files with 413', () => {
    expect(DEFAULT_UPLOAD_POLICY.maxBytes).toBe(25 * 1024 * 1024)
    const big = new Uint8Array(25 * 1024 * 1024 + 1)
    big.set(samples.pdf)
    const error = refused(file('big.pdf', 'application/pdf', big))
    expect(error.status).toBe(413)
    expect(error.message).toMatch(/25 MB or smaller/)
    const ok = new Uint8Array(25 * 1024 * 1024)
    ok.set(samples.pdf)
    expect(inspectUpload(file('ok.pdf', 'application/pdf', ok)).mimeType).toBe('application/pdf')
  })

  it('reads the editable settings and ignores anything that is not a known safe type', () => {
    const policy = resolveUploadPolicy({ uploads: { allowedExtensions: 'PDF, .docx; svg html exe js *.png', maxUploadMb: 10 } })
    expect(policy.allowedExtensions).toEqual(['pdf', 'docx', 'png'])
    expect(policy.maxBytes).toBe(10 * 1024 * 1024)
  })

  it('falls back to the defaults when the setting is blank, unreadable or only unsafe types', () => {
    for (const raw of [null, undefined, {}, { uploads: {} }, { uploads: { allowedExtensions: '', maxUploadMb: null } }, { uploads: { allowedExtensions: 'svg, exe, html' } }]) {
      const policy = resolveUploadPolicy(raw)
      expect(policy.allowedExtensions).toEqual(DEFAULT_UPLOAD_POLICY.allowedExtensions)
      expect(policy.maxBytes).toBe(DEFAULT_UPLOAD_POLICY.maxBytes)
    }
    expect(resolveUploadPolicy({ uploads: { maxUploadMb: -5 } }).maxBytes).toBe(25 * 1024 * 1024)
  })

  it('caps the size setting at the platform limit', () => {
    expect(resolveUploadPolicy({ uploads: { maxUploadMb: 5000 } }).maxBytes).toBe(100 * 1024 * 1024)
  })

  it('refuses a type the admin has switched off', () => {
    const pdfOnly = resolveUploadPolicy({ uploads: { allowedExtensions: 'pdf' } })
    expect(inspectUpload(file('a.pdf', 'application/pdf', samples.pdf), pdfOnly).mimeType).toBe('application/pdf')
    expect(refused(file('a.png', 'image/png', png), pdfOnly).message).toMatch(/not allowed/)
    expect(refused(file('a.zip', 'application/zip', samples.zip), pdfOnly).message).toMatch(/Media settings/)
  })

  it('applies the admin policy through the upload hook and keeps it for the engine step', async () => {
    const pdfOnly = resolveUploadPolicy({ uploads: { allowedExtensions: 'pdf' } })
    const deps = { readSettings: async (): Promise<never> => { throw new Error('not for documents') }, binding: async (): Promise<null> => null, readPolicy: async () => pdfOnly }
    await expect(prepareUploadFile(file('a.png', 'image/png', png), deps as never)).rejects.toBeInstanceOf(ValidationError)
    const prepared = await prepareUploadFile(file('a.pdf', 'application/pdf', samples.pdf), deps as never)
    expect(prepared.policy).toBe(pdfOnly)
    await expect(generateUploadFields({ file: file('a.png', 'image/png', png), filenameExists: async () => false, optimisation: { originalSize: 1, optimised: false, policy: pdfOnly } })).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('storing documents', () => {
  it('skips optimisation for a non-picture and never reads settings for it', async () => {
    const readSettings = vi.fn(async (): Promise<never> => {
      throw new Error('should not be read')
    })
    const binding = vi.fn(async () => null)
    const prepared = await prepareUploadFile(file('deck.pptx', 'application/octet-stream', samples.pptx), { readSettings, binding } as never)
    expect(readSettings).not.toHaveBeenCalled()
    expect(binding).not.toHaveBeenCalled()
    expect(prepared.optimised).toBe(false)
    expect(prepared.file.mimetype).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation')
  })

  it('records the real type and size, with no dimensions, for a document', async () => {
    const fields = await generateUploadFields({ file: file('Report.PDF', 'application/octet-stream', samples.pdf), filenameExists: async () => false })
    expect(fields).toMatchObject({ filename: 'Report.pdf', mimeType: 'application/pdf', filesize: samples.pdf.byteLength })
    expect(fields.width).toBeUndefined()
    expect(fields.height).toBeUndefined()
  })

  it('gives a second file with the same name a numbered name', async () => {
    const taken = new Set(['menu.pdf', 'menu-1.pdf'])
    const fields = await generateUploadFields({ file: file('menu.pdf', 'application/pdf', samples.pdf), filenameExists: async (name) => taken.has(name) })
    expect(fields.filename).toBe('menu-2.pdf')
  })

  it('still reads picture dimensions', async () => {
    const fields = await generateUploadFields({ file: file('dot.png', 'image/png', png), filenameExists: async () => false })
    expect(fields).toMatchObject({ mimeType: 'image/png', width: 1, height: 1 })
  })
})

describe('serving headers', () => {
  const headersFor = (contentType: string, name = 'report.pdf') => {
    const headers = new Headers({ 'Content-Type': contentType })
    applySafeServingHeaders(headers, name)
    return headers
  }

  it('sends nosniff and an attachment disposition for anything that is not a plain picture', () => {
    for (const type of ['application/zip', 'text/plain', 'audio/mpeg', 'video/mp4', 'text/html', 'image/svg+xml', '']) {
      const headers = headersFor(type)
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(headers.get('Content-Disposition')).toMatch(/^attachment; filename="report.pdf"/)
      expect(headers.get('Content-Security-Policy')).toContain('sandbox')
    }
  })

  it('serves PDFs inline, sandboxed, with nosniff', () => {
    const headers = headersFor('application/pdf; charset=binary')
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Content-Disposition')).toBe('inline')
    expect(headers.get('Content-Security-Policy')).toBe('sandbox')
  })

  it('shows plain pictures inline, still with nosniff', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif']) {
      const headers = headersFor(type, 'a.png')
      expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
      expect(headers.get('Content-Disposition')).toBeNull()
    }
  })

  it('cannot be broken out of through the file name', () => {
    const headers = headersFor('application/zip', 'x"; filename=evil.html\r\n.pdf')
    expect(headers.get('Content-Disposition')).not.toMatch(/\r|\n/)
    expect(headers.get('Content-Disposition')).toMatch(/^attachment; filename="x_; filename=evil.html__.pdf"; filename\*=UTF-8''/)
  })
})

describe('file kinds', () => {
  it('groups stored types for icons', () => {
    expect(fileKindOf('application/pdf')).toBe('pdf')
    expect(fileKindOf('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document')
    expect(fileKindOf('application/vnd.ms-excel')).toBe('spreadsheet')
    expect(fileKindOf('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('presentation')
    expect(fileKindOf('text/csv')).toBe('text')
    expect(fileKindOf('application/zip')).toBe('archive')
    expect(fileKindOf('audio/wav')).toBe('audio')
    expect(fileKindOf('video/quicktime')).toBe('video')
    expect(fileKindOf('image/png')).toBe('image')
    expect(fileKindOf(null)).toBe('other')
  })
})

describe('POST /api/admin-media-upload', () => {
  const post = async (form: FormData, headers: Record<string, string> = {}) => {
    const { POST } = await import('../../src/app/(engage)/api/admin-media-upload/route')
    return POST(new Request('http://localhost/api/admin-media-upload', { method: 'POST', body: form, headers }))
  }
  type Reply = { doc: Record<string, unknown>; altDrafted: boolean; error: string }
  const json = async (response: Response): Promise<Reply> => (await response.json()) as Reply
  const formWith = (upload: UploadFile, extra: Record<string, string> = {}) => {
    const form = new FormData()
    form.append('file', new File([upload.data as BlobPart], upload.name, { type: upload.mimetype }))
    for (const [key, value] of Object.entries(extra)) form.append(key, value)
    return form
  }
  const makeEngine = (settings: unknown = null) => {
    const create = vi.fn(async (args: { data: Record<string, unknown>; file: UploadFile }) => {
      // The real engine path: type checks, then the stored fields.
      const prepared = await prepareUploadFile(args.file, { readSettings: async () => ({}) as never, binding: async () => null, readPolicy: async () => resolveUploadPolicy(settings) })
      const fields = await generateUploadFields({ file: prepared.file, filenameExists: async () => false, optimisation: prepared })
      return { id: 7, url: `/api/media/file/${fields.filename}`, alt: args.data.alt, ...fields }
    })
    return { create, findGlobal: vi.fn(async () => settings) }
  }

  it('uploads a PDF with no alt text', async () => {
    const engine = makeEngine()
    authorize.engine = engine
    authorize.allowed = true
    const response = await post(formWith(file('Menu.pdf', 'application/pdf', samples.pdf)))
    expect(response.status).toBe(200)
    const body = await json(response)
    expect(body.doc).toMatchObject({ id: 7, filename: 'Menu.pdf', mimeType: 'application/pdf', alt: '' })
    expect(body.altDrafted).toBe(false)
  })

  it('drafts alt text from the name for a picture and says so', async () => {
    const engine = makeEngine()
    authorize.engine = engine
    const response = await post(formWith(file('harbour_sunset-2.png', 'image/png', png)))
    const body = await json(response)
    expect(body.doc.alt).toBe('harbour sunset 2')
    expect(body.altDrafted).toBe(true)
    // A typed alt text is kept and not flagged.
    const typed = await json(await post(formWith(file('a.png', 'image/png', png), { alt: 'A harbour at dusk' })))
    expect(typed.doc.alt).toBe('A harbour at dusk')
    expect(typed.altDrafted).toBe(false)
  })

  it('answers 415 for a spoofed file and 413 for an oversized one', async () => {
    authorize.engine = makeEngine()
    const spoof = await post(formWith(file('x.pdf', 'application/pdf', pad([0x4d, 0x5a]))))
    expect(spoof.status).toBe(415)
    expect((await json(spoof)).error).toMatch(/not a real PDF/)

    const small = makeEngine({ uploads: { maxUploadMb: 1 } })
    authorize.engine = small
    const big = new Uint8Array(1024 * 1024 + 10)
    big.set(samples.pdf)
    const tooBig = await post(formWith(file('big.pdf', 'application/pdf', big)))
    expect(tooBig.status).toBe(413)
    expect(small.create).not.toHaveBeenCalled()
  })

  it('refuses early from the declared body length, before reading the body', async () => {
    authorize.engine = makeEngine()
    const response = await post(formWith(file('a.pdf', 'application/pdf', samples.pdf)), { 'content-length': String(500 * 1024 * 1024) })
    expect(response.status).toBe(413)
  })

  it('rejects svg with 415 and a missing file with 400', async () => {
    authorize.engine = makeEngine()
    const svg = await post(formWith(file('logo.svg', 'image/svg+xml', text('<svg/>'))))
    expect(svg.status).toBe(415)
    const none = await post(new FormData())
    expect(none.status).toBe(400)
  })

  it('answers 403 to someone without media access', async () => {
    authorize.allowed = false
    const response = await post(formWith(file('a.pdf', 'application/pdf', samples.pdf)))
    expect(response.status).toBe(403)
    authorize.allowed = true
  })

  it('GET tells the browser what is allowed', async () => {
    authorize.engine = makeEngine({ uploads: { allowedExtensions: 'pdf, png', maxUploadMb: 5 } })
    const { GET } = await import('../../src/app/(engage)/api/admin-media-upload/route')
    const body = await (await GET()).json()
    expect(body).toEqual({ accept: ['.png', '.pdf'], maxBytes: 5 * 1024 * 1024 })
  })
})
