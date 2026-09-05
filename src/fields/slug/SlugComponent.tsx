'use client'

import React, { useEffect, useState } from 'react'
import { FieldLabel, TextInput, useField, useFormFields } from '@/engine/ui'
import type { TextFieldClientProps } from '@/engine'

import { slugify } from '@/utilities/formatSlug'

type SlugComponentProps = TextFieldClientProps & {
  /** Name of the sibling field to derive the slug from (defaults to "title"). */
  fieldToUse?: string
}

/**
 * Text field that live-populates itself from another field (usually the
 * title) as the user types, the same "auto-slug until you touch it"
 * behaviour used across most CMS admin panels. Editing the slug directly
 * takes over - it stops following the source field once you've typed
 * something in here yourself, for the rest of this editing session.
 */
export const SlugComponent: React.FC<SlugComponentProps> = ({ field, path, fieldToUse = 'title', readOnly }) => {
  const { setValue, value } = useField<string>({ path })
  const sourceValue = useFormFields(([fields]) => fields?.[fieldToUse]?.value) as string | undefined
  const [hasEdited, setHasEdited] = useState(false)

  useEffect(() => {
    if (hasEdited) return
    if (typeof sourceValue !== 'string' || sourceValue.length === 0) return
    const next = slugify(sourceValue)
    if (next && next !== value) setValue(next)
    // Only re-run when the source field changes - not when `value`/`setValue` change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceValue, hasEdited])

  return (
    <div className="field-type text slug-field-component">
      <FieldLabel htmlFor={`field-${path}`} label={field?.label} required={field?.required} />
      <TextInput
        path={path}
        value={value || ''}
        readOnly={readOnly}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          setHasEdited(true)
          setValue(e.target.value)
        }}
      />
      {!hasEdited && (
        <div className="field-description">Auto-filling from the title above - start typing here to take over.</div>
      )}
    </div>
  )
}

export default SlugComponent
