'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useSyncExternalStore } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { bypassLinkPath } from '@/features/site/maintenance'

const noSubscribe = (): (() => void) => () => undefined
const readOrigin = (): string => window.location.origin
const serverOrigin = (): string => ''

/**
 * Shows the preview link for maintenance mode under the stored token. The token itself is created by
 * the server, so this field is read-only. The link is built from the address the admin is using now.
 */
export function MaintenanceBypassField({ field, path }: { field: Field; path: string; readOnly?: boolean }) {
  const t = useAdminT()
  const { value } = useField<string | null | undefined>({ path })
  const origin = useSyncExternalStore(noSubscribe, readOrigin, serverOrigin)
  const token = typeof value === 'string' ? value : ''
  const link = token ? `${origin}${bypassLinkPath(token)}` : ''

  return (
    <div className="field-type">
      <FieldLabel label={fieldLabel(field)} name={field.name} path={path} required={fieldRequired(field)} />
      {token ? (
        <>
          <input type="text" readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label={t('aria.previewLink')} style={{ width: '100%' }} />
          <p className="field-description">Anyone with this link can see the site while maintenance mode is on. It works for 7 days after they open it.</p>
        </>
      ) : (
        <p className="field-description">Turn on maintenance mode and save to create the preview link.</p>
      )}
    </div>
  )
}
