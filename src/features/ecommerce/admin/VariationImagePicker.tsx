'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'

type MediaRef = number | { id: number; alt?: string | null; filename?: string | null } | null

/**
 * The image on one variation row, chosen from the product's own gallery (Images above). The list is
 * read from the top-level `images` field, so it follows the gallery as it is being edited. Anything
 * not in the gallery is dropped again on save (see productHooks.ts).
 */
export function VariationImagePicker({ field, path, readOnly }: { field: Field; path: string; readOnly?: boolean }) {
  const image = useField<MediaRef | undefined>({ path })
  const gallery = useField<MediaRef[] | undefined>({ path: 'images' })

  const options = (gallery.value ?? []).map((item) => {
    if (typeof item === 'number') return { id: item, label: `Image ${item}` }
    if (item && typeof item === 'object') return { id: item.id, label: item.alt || item.filename || `Image ${item.id}` }
    return null
  })
  const choices = options.filter((option): option is { id: number; label: string } => option !== null)
  const current = image.value && typeof image.value === 'object' ? image.value.id : typeof image.value === 'number' ? image.value : ''

  return (
    <div className="field-type select">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} name={field.name} required={fieldRequired(field)} />
      {choices.length === 0 ? (
        <p style={{ opacity: 0.7 }}>Add images to this product (the Images field) first. They appear here to choose from.</p>
      ) : (
        <select
          id={`field-${path}`}
          name={path}
          disabled={readOnly}
          value={current === '' ? '' : String(current)}
          onChange={(event) => image.setValue(event.target.value === '' ? null : Number(event.target.value))}
        >
          <option value="">No image</option>
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}