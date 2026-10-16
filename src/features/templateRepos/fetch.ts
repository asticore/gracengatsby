import { activeRepos, cleanRelativePath, failure, isSafeBranch, OWNER_RE, REPO_RE, parseManifest, parseTemplate, SLUG_RE } from './manifest'
import { LIMITS } from './types'
import type {
  IndexedRepo,
  Manifest,
  ManifestTemplate,
  Result,
  TemplateFile,
  TemplateListResult,
  TemplateRepoConfig,
  TemplateRepoSettings,
} from './types'

/**
 * Fetching from GitHub. The browser never supplies a URL: every address is
 * built here from an owner, repository, branch and folder that have already
 * been validated, and only for two hosts:
 *
 *   public repository   https://raw.githubusercontent.com/<owner>/<repo>/<branch>/<path>
 *   with a token        https://api.github.com/repos/<owner>/<repo>/contents/<path>?ref=<branch>
 *
 * Redirects are refused (so a token can never be forwarded anywhere else), each
 * request has a timeout and a byte cap, and successful text responses are kept
 * in memory for five minutes.
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export type FetchDeps = {
  fetchImpl?: FetchLike
  now?: () => number
}

export type BuiltRequest = { url: string; headers: Record<string, string>; authed: boolean }

/** Builds the one address (and headers) for a file inside a repository. Returns null for anything unsafe. */
export function buildFileRequest(repo: TemplateRepoConfig, relativePath: string, token: string | null): BuiltRequest | null {
  if (!OWNER_RE.test(repo.owner) || !REPO_RE.test(repo.repo) || repo.repo === '.' || repo.repo === '..') return null
  if (!isSafeBranch(repo.branch)) return null
  const folder = cleanRelativePath(repo.path, { allowEmpty: true })
  const file = cleanRelativePath(relativePath, { strict: true })
  if (folder === null || file === null) return null
  const full = folder ? `${folder}/${file}` : file
  const encodedPath = full.split('/').map(encodeURIComponent).join('/')

  if (token) {
    const url =
      `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}` +
      `/contents/${encodedPath}?ref=${encodeURIComponent(repo.branch)}`
    return {
      url,
      authed: true,
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'engage-template-repos',
      },
    }
  }
  const branchPath = repo.branch.split('/').map(encodeURIComponent).join('/')
  return {
    url: `https://raw.githubusercontent.com/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/${branchPath}/${encodedPath}`,
    authed: false,
    headers: { 'User-Agent': 'engage-template-repos' },
  }
}

// ---- cache ------------------------------------------------------------------

const MAX_CACHE_ENTRIES = 200
const cache = new Map<string, { at: number; text: string }>()

export function clearTemplateRepoCache(): void {
  cache.clear()
}

function cacheGet(key: string, now: number): string | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (now - hit.at > LIMITS.cacheTtlMs) {
    cache.delete(key)
    return null
  }
  return hit.text
}

function cacheSet(key: string, text: string, now: number): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, { at: now, text })
}

// ---- low level fetch --------------------------------------------------------

type BytesResult =
  | { ok: true; bytes: Uint8Array; contentType: string; error?: undefined }
  | { ok: false; error: string; bytes?: undefined; contentType?: undefined }

function statusMessage(status: number, authed: boolean): string {
  if (status === 404) {
    return authed
      ? 'GitHub could not find that file. Check the repository, branch and folder names, and that the token can read this repository.'
      : 'GitHub could not find that file. Check the repository, branch and folder names. If the repository is private, add an access token.'
  }
  if (status === 401 || status === 403) {
    return authed
      ? 'GitHub refused the access token. Check that it has not expired and can read this repository.'
      : 'GitHub refused access. If the repository is private, add an access token.'
  }
  if (status === 429) return 'GitHub is limiting requests right now. Try again in a few minutes.'
  return `GitHub answered with an error (${status}). Try again in a few minutes.`
}

async function fetchBytes(request: BuiltRequest, maxBytes: number, deps: FetchDeps): Promise<BytesResult> {
  const fetchImpl: FetchLike = deps.fetchImpl ?? ((input, init) => fetch(input, init))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LIMITS.fetchTimeoutMs)
  try {
    const response = await fetchImpl(request.url, {
      method: 'GET',
      headers: request.headers,
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) return { ok: false, error: statusMessage(response.status, request.authed) }
    const declared = Number(response.headers.get('content-length') ?? '')
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, error: 'That file is larger than the allowed size.' }

    let bytes: Uint8Array
    if (response.body) {
      const reader = response.body.getReader()
      const chunks: Uint8Array[] = []
      let total = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        total += value.byteLength
        if (total > maxBytes) {
          await reader.cancel().catch((): void => undefined)
          return { ok: false, error: 'That file is larger than the allowed size.' }
        }
        chunks.push(value)
      }
      bytes = new Uint8Array(total)
      let offset = 0
      for (const chunk of chunks) {
        bytes.set(chunk, offset)
        offset += chunk.byteLength
      }
    } else {
      bytes = new Uint8Array(await response.arrayBuffer())
      if (bytes.byteLength > maxBytes) return { ok: false, error: 'That file is larger than the allowed size.' }
    }
    return { ok: true, bytes, contentType: (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() }
  } catch (error) {
    const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
    return { ok: false, error: aborted ? 'GitHub took too long to answer. Try again.' : 'Could not reach GitHub. Try again.' }
  } finally {
    clearTimeout(timer)
  }
}

async function fetchCachedText(repo: TemplateRepoConfig, relativePath: string, token: string | null, maxBytes: number, deps: FetchDeps): Promise<Result<string>> {
  const request = buildFileRequest(repo, relativePath, token)
  if (!request) return { ok: false, error: 'The repository details are not valid.' }
  const now = (deps.now ?? Date.now)()
  const key = `${request.authed ? 'api' : 'raw'}:${request.url}`
  const cached = cacheGet(key, now)
  if (cached !== null) return { ok: true, value: cached }
  const result = await fetchBytes(request, maxBytes, deps)
  if (!result.ok) return { ok: false, error: result.error }
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(result.bytes)
  } catch {
    return { ok: false, error: 'That file is not plain text.' }
  }
  cacheSet(key, text, now)
  return { ok: true, value: text }
}

// ---- repository operations --------------------------------------------------

export async function loadManifest(repo: TemplateRepoConfig, token: string | null, deps: FetchDeps = {}): Promise<Result<Manifest>> {
  const text = await fetchCachedText(repo, 'manifest.json', token, LIMITS.manifestBytes, deps)
  if (!text.ok) return failure(text.error)
  return parseManifest(text.value)
}

export async function loadTemplateFile(
  repo: TemplateRepoConfig,
  entry: ManifestTemplate,
  token: string | null,
  deps: FetchDeps = {},
): Promise<Result<TemplateFile>> {
  const text = await fetchCachedText(repo, entry.file, token, LIMITS.templateBytes, deps)
  if (!text.ok) return failure(text.error)
  const parsed = parseTemplate(text.value)
  if (!parsed.ok) return failure(parsed.error)
  if (parsed.value.kind !== entry.kind) return { ok: false, error: `The template "${entry.slug}" is listed as a ${entry.kind} but the file is a ${parsed.value.kind}.` }
  return parsed
}

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

/** Checks the first bytes really are the image type claimed, so a mislabelled file is never passed on. */
export function sniffImageType(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

/**
 * The preview image bytes. The content type must be png, jpeg or webp both in
 * the response header and in the file itself, and the file at most 2 MB.
 */
export async function loadPreviewImage(
  repo: TemplateRepoConfig,
  entry: ManifestTemplate,
  token: string | null,
  deps: FetchDeps = {},
): Promise<Result<{ bytes: Uint8Array; contentType: string }>> {
  const request = buildFileRequest(repo, entry.preview, token)
  if (!request) return { ok: false, error: 'The repository details are not valid.' }
  // The authenticated API returns the raw file; its content type can be generic, so the file's own bytes decide.
  const result = await fetchBytes(request, LIMITS.previewBytes, deps)
  if (!result.ok) return { ok: false, error: result.error }
  const sniffed = sniffImageType(result.bytes)
  const declaredOk = request.authed || IMAGE_TYPES.has(result.contentType)
  if (!sniffed || !declaredOk || (IMAGE_TYPES.has(result.contentType) && result.contentType !== sniffed)) {
    return { ok: false, error: 'The preview is not a PNG, JPEG or WebP picture.' }
  }
  return { ok: true, value: { bytes: result.bytes, contentType: sniffed } }
}

export function previewUrlFor(repoIndex: number, slug: string): string {
  return `/api/template-repos/preview?repo=${repoIndex}&slug=${encodeURIComponent(slug)}`
}

/** Finds a repository (enabled and valid) by the number the client sends. */
export function findActiveRepo(settings: TemplateRepoSettings, indexInput: unknown): IndexedRepo | null {
  const text = typeof indexInput === 'string' ? indexInput : ''
  if (!/^\d{1,3}$/.test(text)) return null
  const index = Number(text)
  return activeRepos(settings).find((repo) => repo.index === index) ?? null
}

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && SLUG_RE.test(slug)
}

/** Lists the templates of every active repository, side by side. One repository failing does not hide the others. */
export async function listTemplates(settings: TemplateRepoSettings, deps: FetchDeps = {}): Promise<TemplateListResult> {
  const result: TemplateListResult = { enabled: settings.enabled, templates: [], errors: [] }
  if (!settings.enabled) return result

  for (const row of settings.repos) {
    if (row.error) result.errors.push({ repoIndex: row.index, repoLabel: row.label, error: row.error })
  }
  const repos = activeRepos(settings)
  const loaded = await Promise.all(repos.map(async (repo) => ({ repo, manifest: await loadManifest(repo, settings.token, deps) })))
  for (const { repo, manifest } of loaded) {
    if (!manifest.ok) {
      result.errors.push({ repoIndex: repo.index, repoLabel: repo.label, error: manifest.error })
      continue
    }
    const labels = new Map(manifest.value.categories.map((category) => [category.key, category.label]))
    for (const entry of manifest.value.templates) {
      result.templates.push({
        repoIndex: repo.index,
        repoLabel: repo.label,
        slug: entry.slug,
        title: entry.title,
        kind: entry.kind,
        category: entry.category,
        categoryLabel: labels.get(entry.category) ?? entry.category,
        tags: entry.tags,
        previewUrl: previewUrlFor(repo.index, entry.slug),
      })
    }
  }
  result.errors.sort((a, b) => a.repoIndex - b.repoIndex)
  return result
}

/** Looks a template up in a repository's manifest. Only files the manifest lists can ever be fetched. */
export async function findManifestEntry(
  repo: TemplateRepoConfig,
  slug: string,
  token: string | null,
  deps: FetchDeps = {},
): Promise<Result<ManifestTemplate>> {
  if (!isValidSlug(slug)) return { ok: false, error: 'That template name is not valid.' }
  const manifest = await loadManifest(repo, token, deps)
  if (!manifest.ok) return failure(manifest.error)
  const entry = manifest.value.templates.find((item) => item.slug === slug)
  return entry ? { ok: true, value: entry } : { ok: false, error: 'That template is not in this repository.' }
}
