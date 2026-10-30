import { SOURCE_COLLECTIONS, type FieldInfo, type SourceCollection } from '@/features/dataViews/catalogue'
import { MAX_ENDPOINTS, isEndpointCollectionAllowed, isSecretLikeField, validateEndpoint, type ApiEndpoint, type ApiEndpointConfig, type ValidationResult } from './core'
import type { EndpointStore } from './store'

/**
 * The builder's write rules, shared by the server actions and the tests. Reads and writes go
 * through an `EndpointStore`, so this file has no database or session of its own. Callers check
 * the `api` permission before they call anything here.
 */

export type CollectionChoice = { slug: string; label: string; fields: Array<{ key: string; label: string; kind: FieldInfo['kind'] }> }

/** Collections an endpoint may point at, with the fields it may expose. Secret-like fields are never offered. */
export function collectionChoices(sources: readonly SourceCollection[] = SOURCE_COLLECTIONS): CollectionChoice[] {
  return sources
    .filter((c) => isEndpointCollectionAllowed(c.slug))
    .map((c) => ({
      slug: c.slug,
      label: c.label,
      fields: c.fields.filter((f) => !isSecretLikeField(f.key)).map((f) => ({ key: f.key, label: f.label, kind: f.kind })),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export type EndpointInputContext = {
  reserved: ReadonlySet<string>
  keyIds: ReadonlySet<number>
  sources?: readonly SourceCollection[]
}

/** Validates one definition against the live collection catalogue. Used for create and update alike. */
export function checkEndpointInput(input: unknown, context: EndpointInputContext): ValidationResult<ApiEndpointConfig> {
  const sources = context.sources ?? SOURCE_COLLECTIONS
  const raw = (input ?? {}) as Record<string, unknown>
  const source = sources.find((c) => c.slug === raw.collection)
  if (!source) return { ok: false, error: 'Choose a collection this API may read.' }
  const exposable = new Set(source.fields.map((f) => f.key).filter((k) => !isSecretLikeField(k)))
  return validateEndpoint(input, {
    exposable,
    collectionFields: new Set(source.fields.map((f) => f.key)),
    reserved: context.reserved,
    keyIds: context.keyIds,
  })
}

/** Creates an endpoint. Refuses a duplicate path, and stops at MAX_ENDPOINTS. */
export async function createEndpoint(store: EndpointStore, input: unknown, context: EndpointInputContext, at: string): Promise<ValidationResult<ApiEndpoint>> {
  if ((await store.count()) >= MAX_ENDPOINTS) return { ok: false, error: `An API can have at most ${MAX_ENDPOINTS} endpoints.` }
  const checked = checkEndpointInput(input, context)
  if (checked.ok === false) return checked
  if (await store.findByPath(checked.value.version, checked.value.slug)) {
    return { ok: false, error: `Another endpoint already uses /api/x/${checked.value.version}/${checked.value.slug}.` }
  }
  const id = await store.insert(checked.value, at)
  const saved = await store.findById(id)
  return saved ? { ok: true, value: saved } : { ok: false, error: 'The endpoint could not be saved.' }
}

/** Updates an endpoint. A path change must not collide with another endpoint. */
export async function updateEndpoint(store: EndpointStore, id: number, input: unknown, context: EndpointInputContext, at: string): Promise<ValidationResult<ApiEndpoint>> {
  const existing = await store.findById(id)
  if (!existing) return { ok: false, error: 'That endpoint no longer exists.' }
  const checked = checkEndpointInput(input, context)
  if (checked.ok === false) return checked
  const clash = await store.findByPath(checked.value.version, checked.value.slug)
  if (clash && clash.id !== id) return { ok: false, error: `Another endpoint already uses /api/x/${checked.value.version}/${checked.value.slug}.` }
  await store.update(id, checked.value, at)
  const saved = await store.findById(id)
  return saved ? { ok: true, value: saved } : { ok: false, error: 'The endpoint could not be saved.' }
}

/** Turns the endpoint on or off without touching anything else. */
export async function setEndpointEnabled(store: EndpointStore, id: number, enabled: boolean, at: string): Promise<ValidationResult<ApiEndpoint>> {
  const existing = await store.findById(id)
  if (!existing) return { ok: false, error: 'That endpoint no longer exists.' }
  const { id: _id, createdAt: _c, updatedAt: _u, ...config } = existing
  await store.update(id, { ...config, enabled }, at)
  const saved = await store.findById(id)
  return saved ? { ok: true, value: saved } : { ok: false, error: 'The endpoint could not be saved.' }
}

export async function deleteEndpoint(store: EndpointStore, id: number): Promise<ValidationResult<true>> {
  if (!(await store.findById(id))) return { ok: false, error: 'That endpoint no longer exists.' }
  await store.remove(id)
  return { ok: true, value: true }
}
