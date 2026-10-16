/**
 * Template repositories: GitHub repositories that hold page and section
 * templates for the visual editor. Types shared by the validators, the fetcher
 * and the API routes. Nothing here touches the network or the database.
 *
 * Repository layout (what an agency hosts):
 *
 *   manifest.json                      { schemaVersion: 1, name, categories, templates }
 *   templates/<slug>/template.json     { format: 'engage-template', schemaVersion, kind, tree, ... }
 *   templates/<slug>/preview.png       a picture shown in the picker
 *
 * All of it may sit inside a sub folder (the repository's `path`).
 */

export type TemplateKind = 'page' | 'section'

/** One repository row from the Integrations settings, validated. */
export type TemplateRepoConfig = {
  label: string
  owner: string
  repo: string
  branch: string
  /** Sub folder inside the repository, no leading or trailing slash. Empty means the top level. */
  path: string
  enabled: boolean
}

/** A validated row plus its position in the saved list (the client refers to repositories by this number). */
export type IndexedRepo = TemplateRepoConfig & { index: number }

export type TemplateRepoSettings = {
  enabled: boolean
  /** Decrypted access token for private repositories, or null. Server only: never sent to a browser. */
  token: string | null
  /** Every saved row, including ones that failed validation (reported as errors, never fetched). */
  repos: Array<{ index: number; label: string; config: TemplateRepoConfig | null; error: string | null }>
}

export type ManifestCategory = { key: string; label: string }

export type ManifestTemplate = {
  slug: string
  title: string
  kind: TemplateKind
  category: string
  tags: string[]
  /** Path inside the repository folder, always `templates/<slug>/preview.<png|jpg|jpeg|webp>`. */
  preview: string
  /** Path inside the repository folder, always `templates/<slug>/template.json`. */
  file: string
}

export type Manifest = {
  schemaVersion: 1
  name: string
  categories: ManifestCategory[]
  templates: ManifestTemplate[]
}

/** A node of the template tree. Opaque to this library apart from the safety checks. */
export type TemplateNode = Record<string, unknown>

export type TemplateFile = {
  format: 'engage-template'
  schemaVersion: 1
  kind: TemplateKind
  tree: TemplateNode[]
  assets: Array<Record<string, string>>
  requires: Record<string, unknown>
}

/**
 * Success or a plain-English failure. Both members declare both keys so reading
 * `.error` or `.value` type-checks without narrowing (this project does not run
 * with strict null checks, so a boolean `ok` alone does not narrow).
 */
export type Result<T> = { ok: true; value: T; error?: undefined } | { ok: false; error: string; value?: undefined }

/** One row of GET /api/template-repos. */
export type TemplateListItem = {
  repoIndex: number
  repoLabel: string
  slug: string
  title: string
  kind: TemplateKind
  category: string
  categoryLabel: string
  tags: string[]
  previewUrl: string
}

export type TemplateRepoError = { repoIndex: number; repoLabel: string; error: string }

export type TemplateListResult = {
  enabled: boolean
  templates: TemplateListItem[]
  errors: TemplateRepoError[]
}

export const LIMITS = {
  manifestBytes: 500 * 1024,
  templateBytes: 1024 * 1024,
  previewBytes: 2 * 1024 * 1024,
  maxTemplates: 500,
  maxCategories: 100,
  maxRepos: 20,
  maxTreeDepth: 24,
  maxTreeNodes: 5000,
  maxAssets: 200,
  fetchTimeoutMs: 8000,
  cacheTtlMs: 5 * 60 * 1000,
} as const
