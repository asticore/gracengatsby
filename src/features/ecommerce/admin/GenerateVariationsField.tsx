'use client'

import React, { useEffect, useState } from 'react'

import { useField } from '@/engine/ui'

import {
  countCombinations,
  generateVariations,
  MAX_GENERATED_VARIATIONS,
  resolveAttributes,
  type ProductAttributeRow,
  type VariationRow,
} from '../variations'

/** Global attributes (product-attributes) keyed by id, so a row that only names one can use its terms. */
type GlobalAttribute = { id: number; name?: string; terms?: Array<{ name?: string | null }> | null }

/**
 * Sits above the variations list on a variable product. "Generate variations" builds one row for
 * every combination of the attributes ticked "Used for variations" (at most 100), keeping the rows
 * already there so SKUs, prices and stock are never lost.
 */
export function GenerateVariationsField() {
  const attributes = useField<ProductAttributeRow[] | undefined>({ path: 'attributes' })
  const variations = useField<VariationRow[] | undefined>({ path: 'variations' })
  const [globals, setGlobals] = useState<Record<number, GlobalAttribute>>({})
  const [message, setMessage] = useState('')

  const rows = attributes.value ?? []
  const wanted = rows.map((row) => (typeof row.attribute === 'number' ? row.attribute : null)).filter((id): id is number => id !== null)
  const missing = wanted.filter((id) => !globals[id])

  useEffect((): void | (() => void) => {
    if (missing.length === 0) return
    let cancelled = false
    void fetch(`/api/product-attributes?limit=100&depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { docs?: GlobalAttribute[] } | null) => {
        if (cancelled || !body?.docs) return
        setGlobals((current) => ({ ...current, ...Object.fromEntries(body.docs!.map((doc) => [doc.id, doc])) }))
      })
      .catch((): void => undefined)
    return () => {
      cancelled = true
    }
  }, [missing.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const resolved = resolveAttributes(rows.map((row) => ({ ...row, attribute: typeof row.attribute === 'number' ? (globals[row.attribute] ?? null) : row.attribute })))
  const combos = countCombinations(resolved)

  const run = () => {
    if (resolved.length === 0) {
      setMessage('Add an attribute with values and tick "Used for variations" first.')
      return
    }
    const result = generateVariations(resolved, variations.value ?? [], MAX_GENERATED_VARIATIONS)
    variations.setValue(result.variations)
    setMessage(
      `${result.added} variation${result.added === 1 ? '' : 's'} added, ${result.kept} kept.` +
        (result.truncated ? ` Only the first ${MAX_GENERATED_VARIATIONS} of ${result.total} combinations were created.` : '') +
        ' Save the product to keep them.',
    )
  }

  return (
    <div className="field-type" style={{ marginBottom: 16 }}>
      <button type="button" className="btn btn--secondary" onClick={run}>
        Generate variations
      </button>
      <span style={{ marginLeft: 12, opacity: 0.7 }}>
        {combos > 0 ? `${combos} combination${combos === 1 ? '' : 's'} from the attributes marked "Used for variations"` : 'No attributes marked "Used for variations" yet'}
      </span>
      {message ? (
        <p role="status" style={{ marginTop: 8 }}>
          {message}
        </p>
      ) : null}
    </div>
  )
}
