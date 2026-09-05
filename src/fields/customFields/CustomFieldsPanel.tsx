'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo, useField } from '@/engine/ui'

import { CustomFieldInput } from './CustomFieldInput'
import { fetchFieldGroups, type CustomFieldValues, type FieldGroupDoc } from './types'

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
    <div className="mb-[24px] flex flex-col gap-[24px]">
      {groups.map((group) => (
        <div
          className="rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] bg-[var(--theme-elevation-0,#fff)] pt-[16px] px-[18px] pb-[18px]"
          key={group.id}
        >
          <h3 className="mx-0 mt-0 mb-[4px] text-[15px]">{group.name}</h3>
          {group.description && <p className="mx-0 mt-0 mb-[14px] text-[12px] opacity-70">{group.description}</p>}
          <div className="flex flex-wrap gap-[16px]">
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
