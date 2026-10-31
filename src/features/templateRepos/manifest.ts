import { LIMITS } from './types'
import type {
  IndexedRepo,
  Manifest,
  ManifestCategory,
  ManifestTemplate,
  Result,
  TemplateFile,
  TemplateKind,
  TemplateNode,
  TemplateRepoConfig,
  TemplateRepoSettings,
} from './types'

/**
 * Strict validators for everything that comes from a template repository or
 * from the saved settings. Anything malformed is refused with a plain-English
 * reason; nothing is repaired or guessed. Pure functions, no network.
 */

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
export const OWNER_RE = /^[A-Za-z0-9-]{1,39}$/
export const REPO_RE = /^[A-Za-z0-9._-]{1,100}$/
export const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/
const CATEGORY_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/
const PATH_SEGMENT_RE = /^[A-Za-z0-9._-]{1,100}$/

export const failure = <T>(error: string): Result<T> => ({ ok: false, error })
const fail = failure
const ok = <T>(value: T): Result<T> => ({ ok: true, value })

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

const byteLength = (text: string): number => new TextEncoder().encode(text).length

/**
 * A relative path made of plain segments only. Refuses empty segments, "." and
 * "..", backslashes, a leading slash, drive letters, percent escapes and
 * anything outside letters, digits, dot, dash and underscore. Returns the
 * cleaned path (no leading or trailing slash) or null.
 */
export function cleanRelativePath(input: unknown, options: { allowEmpty?: boolean; maxLength?: number; strict?: boolean } = {}): string | null {
  if (typeof input !== 'string') return null
  const maxLength = options.maxLength ?? 200
  if (input.length > maxLength) return null
  // Strict mode (file paths) refuses a leading or trailing slash instead of tidying it.
  if (options.strict && (input.startsWith('/') || input.endsWith('/') || input !== input.trim())) return null
  const trimmed = input.trim().replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return options.allowEmpty ? '' : null
  const segments = trimmed.split('/')
  for (const segment of segments) {
    if (segment === '.' || segment === '..') return null
    if (!PATH_SEGMENT_RE.test(segment)) return null
    if (/^\.+$/.test(segment)) return null
  }
  return segments.join('/')
}

/** A branch name is allowed to contain slashes, but never ".." / empty parts / a leading or trailing slash. */
export function isSafeBranch(branch: unknown): branch is string {
  if (typeof branch !== 'string' || !BRANCH_RE.test(branch)) return false
  if (branch.startsWith('/') || branch.endsWith('/') || branch.includes('//') || branch.includes('..')) return false
  if (branch.split('/').some((part) => part === '.' || part === '' || part.endsWith('.lock'))) return false
  return true
}

/** Validates one saved repository row. */
export function validateRepoConfig(raw: unknown): Result<TemplateRepoConfig> {
  if (!raw || typeof raw !== 'object') return fail('This repository entry is empty.')
  const row = raw as Record<string, unknown>
  const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

  const owner = text(row.owner)
  if (!OWNER_RE.test(owner) || owner.startsWith('-') || owner.endsWith('-')) {
    return fail('The GitHub user or organisation name is missing or not valid.')
  }
  const repo = text(row.repo)
  if (!REPO_RE.test(repo) || repo === '.' || repo === '..') return fail('The repository name is missing or not valid.')
  const branch = text(row.branch) || 'main'
  if (!isSafeBranch(branch)) return fail('The branch name is not valid.')
  const path = cleanRelativePath(text(row.path), { allowEmpty: true })
  if (path === null) return fail('The folder is not valid. Use a plain folder path such as "site/templates".')

  const label = text(row.label).slice(0, 80) || `${owner}/${repo}`
  // A new row defaults to enabled; only an explicit "off" disables it.
  const enabled = !(row.enabled === false || row.enabled === 0 || row.enabled === '0' || row.enabled === 'false')
  return ok({ label, owner, repo, branch, path, enabled })
}

/** Turns the raw `templateRepos` group of the Integrations global into validated settings. */
export function normaliseSettings(raw: unknown): TemplateRepoSettings {
  const group = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const token = typeof group.token === 'string' && group.token.trim() ? group.token.trim() : null
  const rows = Array.isArray(group.repos) ? group.repos.slice(0, LIMITS.maxRepos) : []
  const repos = rows.map((row, index) => {
    const label =
      row && typeof row === 'object' && typeof (row as { label?: unknown }).label === 'string' && (row as { label: string }).label.trim()
        ? (row as { label: string }).label.trim().slice(0, 80)
        : `Repository ${index + 1}`
    const checked = validateRepoConfig(row)
    if (checked.ok) return { index, label: checked.value.label, config: checked.value, error: null as string | null }
    return { index, label, config: null as TemplateRepoConfig | null, error: checked.error as string | null }
  })
  return { enabled: group.enabled === true || group.enabled === 1, token, repos }
}

/** The repositories that should actually be fetched: master switch on, row on, row valid. */
export function activeRepos(settings: TemplateRepoSettings): IndexedRepo[] {
  if (!settings.enabled) return []
  const out: IndexedRepo[] = []
  for (const row of settings.repos) {
    if (row.config && row.config.enabled) out.push({ ...row.config, index: row.index })
  }
  return out
}

/** Parses JSON text under a byte cap. */
function parseJsonText(text: unknown, maxBytes: number, what: string): Result<unknown> {
  if (typeof text !== 'string') return fail(`The ${what} is not text.`)
  if (byteLength(text) > maxBytes) return fail(`The ${what} is too large (the limit is ${Math.round(maxBytes / 1024)} KB).`)
  try {
    return ok(JSON.parse(text))
  } catch {
    return fail(`The ${what} is not valid JSON.`)
  }
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  // Control characters have no place in a title or label.
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null
  return trimmed
}

/** Validates the parsed manifest object. */
export function validateManifest(data: unknown): Result<Manifest> {
  if (!isPlainObject(data)) return fail('The manifest must be a JSON object.')
  if (data.schemaVersion !== 1) return fail('The manifest "schemaVersion" must be 1.')
  const name = cleanText(data.name, 120)
  if (!name) return fail('The manifest needs a "name" of up to 120 characters.')

  if (!Array.isArray(data.categories)) return fail('The manifest needs a "categories" list.')
  if (data.categories.length > LIMITS.maxCategories) return fail(`The manifest has more than ${LIMITS.maxCategories} categories.`)
  const categories: ManifestCategory[] = []
  const categoryKeys = new Set<string>()
  for (const entry of data.categories) {
    if (!isPlainObject(entry)) return fail('Every category must be an object with a "key" and a "label".')
    const key = typeof entry.key === 'string' ? entry.key : ''
    const label = cleanText(entry.label, 80)
    if (!CATEGORY_KEY_RE.test(key)) return fail(`The category key "${String(entry.key).slice(0, 40)}" is not valid.`)
    if (!label) return fail(`The category "${key}" needs a label.`)
    if (categoryKeys.has(key)) return fail(`The category "${key}" appears twice.`)
    categoryKeys.add(key)
    categories.push({ key, label })
  }

  if (!Array.isArray(data.templates)) return fail('The manifest needs a "templates" list.')
  if (data.templates.length > LIMITS.maxTemplates) return fail(`The manifest lists more than ${LIMITS.maxTemplates} templates.`)
  const templates: ManifestTemplate[] = []
  const slugs = new Set<string>()
  for (const entry of data.templates) {
    if (!isPlainObject(entry)) return fail('Every template must be an object.')
    const slug = typeof entry.slug === 'string' ? entry.slug : ''
    if (!SLUG_RE.test(slug)) return fail(`The template name "${String(entry.slug).slice(0, 40)}" is not valid. Use lower case letters, numbers and dashes.`)
    if (slugs.has(slug)) return fail(`The template "${slug}" appears twice.`)
    slugs.add(slug)
    const title = cleanText(entry.title, 120)
    if (!title) return fail(`The template "${slug}" needs a title of up to 120 characters.`)
    if (entry.kind !== 'page' && entry.kind !== 'section') return fail(`The template "${slug}" must be a "page" or a "section".`)
    const category = typeof entry.category === 'string' ? entry.category : ''
    if (!categoryKeys.has(category)) return fail(`The template "${slug}" uses a category that is not in the categories list.`)

    let tags: string[] = []
    if (entry.tags !== undefined) {
      if (!Array.isArray(entry.tags) || entry.tags.length > 10) return fail(`The tags of "${slug}" must be a list of up to 10 words.`)
      for (const tag of entry.tags) {
        const clean = cleanText(tag, 40)
        if (!clean) return fail(`A tag on "${slug}" is not valid.`)
        tags.push(clean)
      }
      tags = Array.from(new Set(tags))
    }

    const file = cleanRelativePath(entry.file, { strict: true })
    if (file !== `templates/${slug}/template.json`) return fail(`The file for "${slug}" must be "templates/${slug}/template.json".`)
    const preview = cleanRelativePath(entry.preview, { strict: true })
    if (!preview || !new RegExp(`^templates/${slug}/preview\\.(png|jpg|jpeg|webp)$`).test(preview)) {
      return fail(`The preview for "${slug}" must be "templates/${slug}/preview.png" (or .jpg, .jpeg, .webp).`)
    }
    templates.push({ slug, title, kind: entry.kind as TemplateKind, category, tags, preview, file })
  }
  return ok({ schemaVersion: 1, name, categories, templates })
}

export function parseManifest(text: unknown): Result<Manifest> {
  const parsed = parseJsonText(text, LIMITS.manifestBytes, 'manifest')
  return parsed.ok ? validateManifest(parsed.value) : fail(parsed.error)
}

/**
 * Deny list for the tree. A template is data for the visual editor, never code,
 * so element types that carry raw HTML, scripts or frames are refused, and so is
 * any string value that contains a script tag, a frame tag or a javascript: link.
 * This is a first line of defence; the editor and renderer still escape their
 * own output. Types are compared lower case with dashes, underscores and spaces
 * removed, so "raw-html", "rawHtml" and "RAW_HTML" are all the same entry.
 */
export const DENIED_NODE_TYPES: ReadonlySet<string> = new Set([
  'html',
  'rawhtml',
  'customhtml',
  'htmlembed',
  'code',
  'customcode',
  'customscript',
  'script',
  'scripts',
  'embed',
  'iframe',
  'frame',
  'object',
  'shortcode',
  'php',
  'style',
  'headscripts',
  'bodyscripts',
])

const TYPE_KEYS = ['type', 'blockType', 'elementType'] as const
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype', 'dangerouslySetInnerHTML'])
const DANGEROUS_TEXT = /<\s*(script|iframe|object|embed)\b|javascript\s*:|data\s*:\s*text\/html|vbscript\s*:/i

export function isDeniedNodeType(value: string): boolean {
  return DENIED_NODE_TYPES.has(value.toLowerCase().replace(/[-_\s]/g, ''))
}

function checkTree(nodes: unknown, depth: number, counter: { nodes: number }): string | null {
  if (!Array.isArray(nodes)) return 'A "children" or "columns" list is not a list.'
  if (depth > LIMITS.maxTreeDepth) return `The template is nested more than ${LIMITS.maxTreeDepth} levels deep.`
  for (const node of nodes) {
    if (!isPlainObject(node)) return 'Every item in the template must be an object.'
    counter.nodes += 1
    if (counter.nodes > LIMITS.maxTreeNodes) return `The template has more than ${LIMITS.maxTreeNodes} items.`
    let hasType = false
    for (const key of TYPE_KEYS) {
      const value = node[key]
      if (value === undefined) continue
      if (typeof value !== 'string' || !value || value.length > 80) return 'An item has a type that is not valid.'
      hasType = true
      if (isDeniedNodeType(value)) return `The template uses "${value}" content, which is not allowed in shared templates.`
    }
    if (!hasType) return 'Every item in the template needs a type.'
    const valueProblem = checkValue(node, 0)
    if (valueProblem) return valueProblem
    for (const childKey of ['children', 'blocks', 'elements']) {
      if (node[childKey] === undefined) continue
      // Only nested node lists recurse; a "columns" count given as a number is plain data.
      if (Array.isArray(node[childKey])) {
        const problem = checkTree(node[childKey], depth + 1, counter)
        if (problem) return problem
      }
    }
    // A section's columns are containers ({ width, blocks }), not nodes: their blocks are the nodes to check.
    if (Array.isArray(node.columns)) {
      for (const column of node.columns) {
        if (!isPlainObject(column)) return 'A column of a section is not an object.'
        if (Array.isArray(column.blocks)) {
          const problem = checkTree(column.blocks, depth + 1, counter)
          if (problem) return problem
        }
      }
    }
  }
  return null
}

/** Walks every value of a node: forbidden keys, script-like text, and non-JSON values. */
function checkValue(value: unknown, depth: number): string | null {
  if (depth > 60) return 'The template data is nested too deeply.'
  if (typeof value === 'string') return DANGEROUS_TEXT.test(value) ? 'The template contains script or frame content, which is not allowed.' : null
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = checkValue(item, depth + 1)
      if (problem) return problem
    }
    return null
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `The template uses a field called "${key}", which is not allowed.`
      // Also catches a denied type tucked inside props (a nested object that is not in a children list).
      if ((TYPE_KEYS as readonly string[]).includes(key) && typeof item === 'string' && isDeniedNodeType(item)) {
        return `The template uses "${item}" content, which is not allowed in shared templates.`
      }
      const problem = checkValue(item, depth + 1)
      if (problem) return problem
    }
    return null
  }
  return 'The template contains a value that is not plain data.'
}

/** Validates the parsed `engage-template` object. */
export function validateTemplate(data: unknown): Result<TemplateFile> {
  if (!isPlainObject(data)) return fail('The template must be a JSON object.')
  if (data.format !== 'engage-template') return fail('This file is not an engage-template.')
  if (data.schemaVersion !== 1) return fail('The template "schemaVersion" must be 1.')
  if (data.kind !== 'page' && data.kind !== 'section') return fail('The template "kind" must be "page" or "section".')
  if (!Array.isArray(data.tree) || data.tree.length === 0) return fail('The template needs a "tree" with at least one item.')
  const problem = checkTree(data.tree, 1, { nodes: 0 })
  if (problem) return fail(problem)

  const assets: Array<Record<string, string>> = []
  if (data.assets !== undefined) {
    if (!Array.isArray(data.assets) || data.assets.length > LIMITS.maxAssets) return fail('The template "assets" must be a list of up to 200 items.')
    for (const asset of data.assets) {
      if (!isPlainObject(asset)) return fail('Every asset must be an object.')
      const clean: Record<string, string> = {}
      for (const [key, value] of Object.entries(asset)) {
        if (FORBIDDEN_KEYS.has(key) || typeof value !== 'string' || value.length > 500) return fail('An asset has a value that is not valid.')
        if ((key === 'url' || key === 'src') && !/^https:\/\//i.test(value)) return fail('Asset links must start with https://.')
        if (DANGEROUS_TEXT.test(value)) return fail('An asset has a value that is not allowed.')
        clean[key] = value
      }
      assets.push(clean)
    }
  }

  let requires: Record<string, unknown> = {}
  if (data.requires !== undefined) {
    if (!isPlainObject(data.requires) || Object.keys(data.requires).length > 50) return fail('The template "requires" must be an object with up to 50 entries.')
    const requiresProblem = checkValue(data.requires, 0)
    if (requiresProblem) return fail(requiresProblem)
    requires = data.requires
  }

  return ok({
    format: 'engage-template',
    schemaVersion: 1,
    kind: data.kind,
    tree: data.tree as TemplateNode[],
    assets,
    requires,
  })
}

export function parseTemplate(text: unknown): Result<TemplateFile> {
  const parsed = parseJsonText(text, LIMITS.templateBytes, 'template')
  return parsed.ok ? validateTemplate(parsed.value) : fail(parsed.error)
}
