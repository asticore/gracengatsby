'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from './shared'

type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

type RelDoc = { id: number | string; [key: string]: unknown }

const LABEL_FIELD_CANDIDATES = ['title', 'name', 'filename', 'email', 'slug', 'label']

function labelFor(doc: RelDoc): string {
  for (const key of LABEL_FIELD_CANDIDATES) {
    const v = doc[key]
    if (typeof v === 'string' && v) return v
  }
  return `#${doc.id}`
}

function relationTo(field: Field): string | undefined {
  const r = (field as { relationTo?: unknown }).relationTo
  return typeof r === 'string' ? r : undefined
}

/**
 * Real search-select picker for `relationship`/`upload` fields (Stage 11
 * Phase 3) - replaces the by-ID text-input stopgap. This app's own field-type
 * inventory confirms every relationship/upload field here uses a single
 * (non-polymorphic) `relationTo`, so this component only ever handles that
 * shape - a real Payload polymorphic `relationTo: string[]` field (none
 * exist in this app today) would need a collection-picker dropdown added on
 * top of this, not supported here.
 *
 * SEARCH IS CLIENT-SIDE, not a server `where` query - deliberately. An
 * earlier version of this component searched via
 * `GET /api/<relationTo>?where[or][<i>][<field>][contains]=<q>` over a fixed
 * candidate field list (title/name/filename/email/slug/label), matching
 * `sanitizeFieldsForClient`'s convention of not threading target-collection
 * admin config (`useAsTitle`) into the client bundle. That 500'd for any
 * collection missing ALL of those columns (`users` has none of them) -
 * `src/cms/db/where.ts`'s `buildWhere` deliberately THROWS on an unmapped
 * field key rather than silently matching nothing (see its own doc comment),
 * and the fetch here swallows a non-2xx into an empty result, so the search
 * box just silently never found anything on affected collections. Found live
 * via `/admin/collections/posts/create`'s `author` (relationTo: 'users')
 * field. Fixed by fetching one unfiltered page (`limit=100&depth=0`) per
 * collection and filtering client-side by `labelFor()`/id substring match -
 * no `where` clause is ever sent, so this can't hit that throw for any
 * collection shape. Traded off: only the first 100 docs of a collection are
 * searchable at all; a real fix would need each target collection's actual
 * `useAsTitle` field threaded through (not done - same tier as the rest of
 * Phase 3's rough-but-functional stopgaps).
 */
function useRelationOptions(collection: string | undefined): { all: RelDoc[]; loading: boolean } {
  const [all, setAll] = useState<RelDoc[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!collection) return
    let cancelled = false
    const handle = setTimeout(() => {
      setLoading(true)
      fetch(`/api/${collection}?limit=100&depth=0`, { credentials: 'include' })
        .then((r) => (r.ok ? r.json() : { docs: [] as RelDoc[] }))
        .then((body: { docs?: RelDoc[] }) => {
          if (!cancelled) setAll(Array.isArray(body.docs) ? body.docs : [])
        })
        .catch(() => {
          if (!cancelled) setAll([])
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 0)
    return () => {
      cancelled = true
      clearTimeout(handle)
    }
  }, [collection])

  return { all, loading }
}

function filterOptions(all: RelDoc[], query: string): RelDoc[] {
  const q = query.trim().toLowerCase()
  const matches = q ? all.filter((doc) => labelFor(doc).toLowerCase().includes(q) || String(doc.id).toLowerCase().includes(q)) : all
  return matches.slice(0, 20)
}

/** Single-value picker (`hasMany` false/absent): a text search box + a dropdown list of matches below it; clicking a row sets the value to that doc's `id` and shows the resolved label above the box with a "Clear" button. */
function SingleRelationPicker({ field, path, readOnly }: ScalarFieldRendererProps) {
  const { value, setValue } = useField<number | string | undefined>({ path })
  const collection = relationTo(field)
  const [query, setQuery] = useState('')
  const { all, loading } = useRelationOptions(collection)
  const options = useMemo(() => filterOptions(all, query), [all, query])

  return (
    <div className="field-type relationship">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      {value !== undefined && value !== null && value !== '' && (
        <div className="field-relationship-selected">
          Selected: {String(value)}{' '}
          {!readOnly && (
            <button type="button" onClick={() => setValue(undefined)}>
              Clear
            </button>
          )}
        </div>
      )}
      {!readOnly && (
        <>
          <input
            id={`field-${path}`}
            className="field-type text"
            placeholder={`Search ${collection ?? 'documents'}...`}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="field-relationship-options">
            {loading && <div>Loading...</div>}
            {!loading && options.length === 0 && <div>No matches.</div>}
            {!loading &&
              options.map((doc) => (
                <button
                  key={String(doc.id)}
                  type="button"
                  onClick={() => {
                    setValue(doc.id)
                    setQuery('')
                  }}
                >
                  {labelFor(doc)} (#{doc.id})
                </button>
              ))}
          </div>
        </>
      )}
      <div className="field-description">
        Search-select picker (first 100 docs, client-filtered) - real Payload&apos;s own title/thumbnail preview not reproduced (Phase 3 stopgap-plus, see plan doc).
      </div>
    </div>
  )
}

/** Multi-value picker (`hasMany` true): same search box, selected values shown as removable chips above it; clicking a search result ADDS to the array (no duplicates) instead of replacing it. */
function MultiRelationPicker({ field, path, readOnly }: ScalarFieldRendererProps) {
  const { value, setValue } = useField<Array<number | string>>({ path })
  const collection = relationTo(field)
  const [query, setQuery] = useState('')
  const { all, loading } = useRelationOptions(collection)
  const options = useMemo(() => filterOptions(all, query), [all, query])
  const selected = Array.isArray(value) ? value : []

  return (
    <div className="field-type relationship">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <div className="field-relationship-chips">
        {selected.map((id) => (
          <span key={String(id)} className="field-relationship-chip">
            #{String(id)}
            {!readOnly && (
              <button type="button" onClick={() => setValue(selected.filter((v) => v !== id))}>
                x
              </button>
            )}
          </span>
        ))}
      </div>
      {!readOnly && (
        <>
          <input
            id={`field-${path}`}
            className="field-type text"
            placeholder={`Search ${collection ?? 'documents'}...`}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="field-relationship-options">
            {loading && <div>Loading...</div>}
            {!loading && options.length === 0 && <div>No matches.</div>}
            {!loading &&
              options.map((doc) => (
                <button
                  key={String(doc.id)}
                  type="button"
                  disabled={selected.includes(doc.id)}
                  onClick={() => {
                    if (!selected.includes(doc.id)) setValue([...selected, doc.id])
                    setQuery('')
                  }}
                >
                  {labelFor(doc)} (#{doc.id})
                </button>
              ))}
          </div>
        </>
      )}
      <div className="field-description">
        Search-select picker (first 100 docs, client-filtered) - real Payload&apos;s own title/thumbnail preview not reproduced (Phase 3 stopgap-plus, see plan doc).
      </div>
    </div>
  )
}

export const RelationshipFieldRenderer: React.FC<ScalarFieldRendererProps> = (props) => {
  const hasMany = Boolean((props.field as { hasMany?: boolean }).hasMany)
  return hasMany ? <MultiRelationPicker {...props} /> : <SingleRelationPicker {...props} />
}
