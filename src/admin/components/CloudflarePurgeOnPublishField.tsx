'use client'

import React from 'react'
import { useField } from '@/engine/ui'
import type { Field } from '@/engine'

import { CloudflarePurgeButton } from './CloudflarePurgeButton'

type Props = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * The Cloudflare "purge on publish" checkbox plus a "Purge everything now"
 * button. The button lives here (not in a `ui` field) because the
 * Integrations global's shadow schema in src/cms/db cannot hold a `ui` field.
 */
export function CloudflarePurgeOnPublishField({ path, readOnly }: Props) {
  const { value, setValue } = useField<boolean | null | undefined>({ path })
  const checked = value !== false
  return (
    <div className="field-type checkbox" style={{ display: 'grid', gap: 8 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          type="checkbox"
          checked={checked}
          disabled={readOnly}
          onChange={(event) => setValue(event.target.checked)}
        />
        <span>Purge the Cloudflare cache when content is published</span>
      </label>
      <CloudflarePurgeButton />
    </div>
  )
}
