import { validateRepoConfig } from '@/features/templateRepos/manifest'
import type { Result, TemplateRepoConfig } from '@/features/templateRepos/types'

import { LIBRARY_LIMITS } from './types'

/**
 * Turns the address a person pastes into a GitHub folder. Accepted shapes:
 *
 *   https://github.com/<owner>/<repo>                 the repository root, default branch main
 *   https://github.com/<owner>/<repo>/tree/<branch>   a branch
 *   https://github.com/<owner>/<repo>/tree/<branch>/<folder>
 *
 * Only https and the github.com host are accepted. No user name, password, port, query or fragment.
 * The result is the validated repository row used by the fetcher, which builds every request from
 * these parts itself (raw.githubusercontent.com or api.github.com, redirects refused).
 */
export function parseLibraryUrl(input: unknown, label?: string): Result<{ config: TemplateRepoConfig; url: string }> {
  const text = typeof input === 'string' ? input.trim() : ''
  const help = 'Enter the GitHub address of the library, for example https://github.com/owner/repo.'
  if (!text || text.length > LIBRARY_LIMITS.urlMaxLength) return { ok: false, error: help }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, error: help }
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'The library address must start with https://.' }
  if (url.hostname.toLowerCase() !== 'github.com') return { ok: false, error: 'Only GitHub addresses (github.com) can be added as a library.' }
  if (url.username || url.password) return { ok: false, error: 'The address must not contain a user name or password.' }
  if (url.port) return { ok: false, error: 'The address must not contain a port number.' }
  if (url.search || url.hash) return { ok: false, error: 'Remove everything after "?" or "#" from the address.' }

  const segments: string[] = []
  for (const raw of url.pathname.split('/').filter((part) => part !== '')) {
    let decoded: string
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      return { ok: false, error: help }
    }
    if (decoded.includes('/')) return { ok: false, error: help }
    segments.push(decoded)
  }
  if (segments.length < 2) return { ok: false, error: help }

  const [owner, repoSegment, ...rest] = segments
  const repo = repoSegment.replace(/\.git$/, '')
  let branch = 'main'
  let path = ''
  if (rest.length > 0) {
    if (rest[0] !== 'tree' || rest.length < 2) {
      return { ok: false, error: 'Use https://github.com/owner/repo, or https://github.com/owner/repo/tree/branch/folder for another branch or folder.' }
    }
    branch = rest[1]
    path = rest.slice(2).join('/')
  }

  const checked = validateRepoConfig({ label: label ?? '', owner, repo, branch, path, enabled: true })
  if (!checked.ok) return { ok: false, error: checked.error }

  const base = `https://github.com/${owner}/${repo}`
  const canonical = rest.length > 0 ? `${base}/tree/${branch}${path ? `/${path}` : ''}` : base
  return { ok: true, value: { config: checked.value, url: canonical } }
}
