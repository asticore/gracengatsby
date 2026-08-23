'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo, useField } from '@payloadcms/ui'

import { CustomFieldInput } from './CustomFieldInput'
import { fetchFieldGroups, type CustomFieldValues, type FieldGroupDoc } from './types'
import './customFields.css'

/**
 * The native-admin editor for a collection's custom fields.
 *
 * Reads the Field Groups targeting this collection at runtime and renders real
 * inputs for each, writing every value into the single `customFields` JSON
 * field. Renders nothing at all when no Field Group targets this collection, so
 * the edit screen stays clean until the user actually defines some fields.
 */
export const CustomFieldsPanel: React.FC<{ path?: string }> = ({ path = 'customFields' }) => {
  const { value, setValue } = useField<CustomFieldValues>({ path })
  const { collectionSlug } = useDocumentInfo()

  const [groups, setGroups] = useState<FieldGroupDoc[]>([])
  // Starts false when there is no collection to look up, so the effect never
  // has to synchronously flip loading state just to say "nothing to do".
  const [loading, setLoading] = useState(() => Boolean(collectionSlug))

  useEffect(() => {
    let cancelled = false
    if (!collectionSlug) return

    fetchFieldGroups(collectionSlug)
      .then((docs) => {
        if (!cancelled) setGroups(docs)
      })
      .catch(() => {
        if (!cancelled) setGroups([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [collectionSlug])

  const values: CustomFieldValues = value && typeof value === 'object' ? value : {}

  const setFieldValue = (name: string, next: unknown) => {
    const updated = { ...values }
    if (next === undefined || next === '') {
      delete updated[name]
    } else {
      updated[name] = next
    }
    setValue(updated)
  }

  if (loading) return null
  if (groups.length === 0) return null

  return (
    <div className="cf-panel">
      {groups.map((group) => (
        <div className="cf-group" key={group.id}>
          <h3 className="cf-group__title">{group.name}</h3>
          {group.description && <p className="cf-group__description">{group.description}</p>}
          <div className="cf-group__fields">
            {(group.fields || []).map((def) => (
              <CustomFieldInput
                key={def.name}
                def={def}
                value={values[def.name]}
                onChange={(next) => setFieldValue(def.name, next)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default CustomFieldsPanel
