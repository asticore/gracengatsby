'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import { useAdminRoot } from '@/admin/adminRoute/AdminRouteProvider'
import { DEFAULT_ADMIN_PATH, normaliseAdminPath, validateAdminPath, type AdminPathError } from '@/features/security/adminPath'
import type { UiStringKey } from '@/features/uiStrings'

type AdminUrlFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

const ERROR_KEYS: Record<AdminPathError, UiStringKey> = {
  format: 'adminurl.err_format',
  length: 'adminurl.err_length',
  reserved: 'adminurl.err_reserved',
}

/**
 * The Admin URL setting on the Security screen. Shows the live address the admin is
 * served at, a bookmark warning, the env override note, and a message when the saved
 * path is the one in use. Validation here is for the editor's feedback; the server
 * validator still decides what is saved.
 */
export function AdminUrlField({ field, path, readOnly }: AdminUrlFieldProps) {
  const t = useAdminT()
  const activeRoot = useAdminRoot()
  const { value, setValue } = useField<string | undefined | null>({ path })

  const typed = typeof value === 'string' ? value : ''
  const normalised = normaliseAdminPath(typed) || DEFAULT_ADMIN_PATH
  const error = typed.trim() === '' ? null : validateAdminPath(typed)
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const currentUrl = `${origin}${activeRoot}`
  const isActive = activeRoot !== DEFAULT_ADMIN_PATH && normalised === activeRoot

  return (
    <div className="field-type">
      <FieldLabel label={t('adminurl.label')} name={field.name} path={path} required={fieldRequired(field)} />
      <input
        id={`field-${path}`}
        type="text"
        value={typed}
        onChange={(e) => setValue(e.target.value.trim() === '' ? null : e.target.value.trim())}
        placeholder={DEFAULT_ADMIN_PATH}
        disabled={readOnly}
        aria-invalid={error ? true : undefined}
        style={{
          width: '100%',
          padding: '8px 12px',
          border: error ? '1px solid #b3261e' : '1px solid #ccc',
          borderRadius: '4px',
          fontFamily: 'monospace',
          fontSize: '13px',
        }}
      />
      {error && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#b3261e' }}>{t(ERROR_KEYS[error])}</p>}
      <p style={{ margin: '6px 0 0', fontSize: '13px', opacity: 0.7 }}>{t('adminurl.hint', { url: currentUrl })}</p>
      <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.7 }}>{t('adminurl.bookmark')}</p>
      <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.7 }}>{t('adminurl.env_note')}</p>
      {isActive && (
        <p role="status" style={{ margin: '8px 0 0', fontSize: '13px', fontWeight: 600 }}>
          {t('adminurl.active_notice', { url: `${origin}${normalised}` })}
        </p>
      )}
    </div>
  )
}
