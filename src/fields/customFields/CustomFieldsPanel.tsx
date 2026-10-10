'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { useDocumentInfo, useField, useFormFields } from '@/engine/ui'

import { isFieldVisible } from '@/features/customFields/conditions'
import { matchesLocation, type LocationContext } from '@/features/customFields/location'
import { applyDefaults, definitionsFor, validateFieldValues } from '@/features/customFields/validate'
import { collectMediaIds } from '@/features/customFields/stringify'

import { CustomFieldInput, CustomFieldMediaContext, useMediaUrlsFor, type MediaUrlMap } from './CustomFieldInput'
import { fetchFieldGroups, type CustomFieldValues, type FieldGroupDoc } from './types'

/**
 * The editing-screen panel for a collection's custom fields.
 *
 * Loads the normalised groups for this collection, keeps only the ones whose
 * location matches the document as it is being edited right now (so changing a
 * page's template or a post's category immediately shows or hides groups), then
 * renders every visible field. Writes into the single `customFields` JSON field.
 * Renders nothing when no group applies, so the screen stays clean.
 */

const idOf = (value: unknown): string | number | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return null
}

export const CustomFieldsPanel: React.FC<{ path?: string }> = ({ path = 'customFields' }) => {
  const { value, setValue } = useField<CustomFieldValues | undefined>({ path })
  const { collectionSlug, id: docId } = useDocumentInfo()

  // The live form values that location rules read.
  const template = useFormFields(([f]) => f?.template?.value)
  const parent = useFormFields(([f]) => f?.parent?.value)
  const status = useFormFields(([f]) => f?.['_status']?.value)
  const categoriesKey = useFormFields(([f]) => JSON.stringify(f?.categories?.value ?? null))

  const [groups, setGroups] = useState<FieldGroupDoc[]>([])
  const [userRoles, setUserRoles] = useState<string[]>([])
  // Starts false when there is no collection to look up, so the effect never
  // has to synchronously flip loading state just to say "nothing to do".
  const [loading, setLoading] = useState(() => Boolean(collectionSlug))
  const [touched, setTouched] = useState<Record<string, true>>({})
  const [mediaUrls, setMediaUrls] = useState<MediaUrlMap>({})

  useEffect(() => {
    let cancelled = false
    if (!collectionSlug) return

    fetchFieldGroups(collectionSlug)
      .then(({ groups: docs, userRoles: roles }) => {
        if (cancelled) return
        setGroups(docs)
        setUserRoles(roles)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [collectionSlug])

  const remember = useCallback((id: number, url: string) => {
    setMediaUrls((prev) => (prev[String(id)] === url ? prev : { ...prev, [String(id)]: url }))
  }, [])

  const values: CustomFieldValues = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  if (!collectionSlug || loading || groups.length === 0) return null

  const categories = (() => {
    try {
      const parsed = JSON.parse(categoriesKey) as unknown
      return Array.isArray(parsed) ? parsed.map((c) => (c && typeof c === 'object' ? (c as { name?: unknown }).name : null)).filter((n): n is string => typeof n === 'string') : []
    } catch {
      return []
    }
  })()

  const ctx: LocationContext = {
    collection: collectionSlug,
    status: typeof status === 'string' ? status : undefined,
    userRoles,
  }
  if (collectionSlug === 'pages') {
    ctx.pageTemplate = idOf(template)
    ctx.pageParent = idOf(parent)
  }
  if (collectionSlug === 'posts') {
    ctx.postCategories = categories
    ctx.postTags = []
  }

  const matching = groups.filter((group) => matchesLocation(group.location, ctx))
  if (matching.length === 0) return null

  // New documents get defaults; validation runs against what will be saved.
  const isNew = docId === undefined || docId === null || docId === ''
  const allDefs = definitionsFor(matching, ctx)
  const effective = isNew ? applyDefaults(allDefs, values) : values
  const problems = validateFieldValues(allDefs, effective)
  const errorFor = (name: string): string | undefined => (touched[name] ? problems.find((p) => p.field === name)?.message : undefined)

  const setFieldValue = (name: string, next: unknown) => {
    const updated = { ...values }
    if (next === undefined || next === '') {
      delete updated[name]
    } else {
      updated[name] = next
    }
    setTouched((prev) => (prev[name] ? prev : { ...prev, [name]: true }))
    setValue(updated)
  }

  const mediaIds = collectMediaIds(allDefs, values)

  return (
    <CustomFieldMediaContext.Provider value={{ urls: mediaUrls, remember }}>
      <MediaUrlsLoader ids={mediaIds} remember={remember} />
      <div className="mb-[24px] flex flex-col gap-[24px]">
        {matching.map((group) => {
          const visible = group.fields.filter((def) => isFieldVisible(def, values))
          return (
            <div
              className="rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] bg-[var(--theme-elevation-0,#fff)] pt-[16px] px-[18px] pb-[18px]"
              key={group.id}
            >
              <h3 className="mx-0 mt-0 mb-[4px] text-[15px]">{group.name}</h3>
              {group.description && <p className="mx-0 mt-0 mb-[14px] text-[12px] opacity-70">{group.description}</p>}
              <div className="flex flex-wrap gap-[16px]">
                {visible.map((def) => (
                  <CustomFieldInput
                    key={def.name}
                    def={def}
                    value={values[def.name]}
                    error={errorFor(def.name)}
                    onChange={(next) => setFieldValue(def.name, next)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </CustomFieldMediaContext.Provider>
  )
}

/** Mounts the media-URL fetch for the ids currently in use. Renders nothing. */
function MediaUrlsLoader({ ids, remember }: { ids: number[]; remember: (id: number, url: string) => void }): null {
  useMediaUrlsFor(ids, remember)
  return null
}

export default CustomFieldsPanel
