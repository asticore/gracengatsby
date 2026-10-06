'use client'

import React, { useState, useEffect } from 'react'
import { FieldLabel, useField, useFormFields } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel } from '@/admin/fields/shared'
import { PermissionTable } from './PermissionTable'
import type { PermissionMatrix, PermissionOverrides } from '@/features/roles/permissions'
import { effectiveMatrix, sanitizeOverrides } from '@/features/roles/permissions'
import styles from '@/admin/admin.module.css'

type UserPermissionOverridesFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * Field component for editing a user's permission overrides.
 * Shows the user's roles as context and allows granting/denying individual permissions.
 */
export function UserPermissionOverridesField({ field, path, readOnly }: UserPermissionOverridesFieldProps) {
  const { value, setValue } = useField<string | PermissionOverrides | undefined | null>({ path })

  // Parse the current value
   
  const overrides: PermissionOverrides = React.useMemo(() => {
    if (!value) return {}
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return typeof parsed === 'object' && parsed !== null ? parsed : {}
      } catch {
        return {}
      }
    }
    return value as PermissionOverrides
  }, [value])

  // Sibling values from the same user form: the role list and the custom role.
  const { rolesValue, customRoleValue } = useFormFields(([fields]) => ({
    rolesValue: fields?.roles?.value,
    customRoleValue: fields?.customRole?.value,
  }))
  const userRoles: string[] = Array.isArray(rolesValue) ? rolesValue.filter((r): r is string => typeof r === 'string') : []
  const customRoleId: string | null =
    typeof customRoleValue === 'number' || typeof customRoleValue === 'string'
      ? String(customRoleValue)
      : customRoleValue && typeof customRoleValue === 'object' && 'id' in customRoleValue
        ? String((customRoleValue as { id: unknown }).id)
        : null

  const isAdmin = userRoles.includes('admin')

  // Fetch the custom role's matrix. State is only set from the async callbacks;
  // a stale result (for a role no longer selected) is ignored when reading it.
  const [loaded, setLoaded] = useState<{ id: string; matrix: Partial<PermissionMatrix> | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!customRoleId) return
    let cancelled = false
    fetch(`/api/roles/${customRoleId}?depth=0`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load the custom role')
        return r.json() as Promise<{ permissions?: Partial<PermissionMatrix> }>
      })
      .then((data) => {
        if (!cancelled) setLoaded({ id: customRoleId, matrix: data.permissions || {}, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoaded({ id: customRoleId, matrix: null, error: err instanceof Error ? err.message : 'Failed to load the custom role' })
      })
    return () => {
      cancelled = true
    }
  }, [customRoleId])
  const current = customRoleId && loaded?.id === customRoleId ? loaded : null
  const customRoleMatrix = current?.matrix ?? null
  const isLoading = Boolean(customRoleId) && !current
  const error = current?.error ?? null

  // Compute the inherited effective matrix (without overrides)
   
  const inherited = React.useMemo(() => {
    const user: any = {
      roles: userRoles,
      id: 1, // placeholder
      permissionOverrides: undefined,
    }
    return effectiveMatrix(user, customRoleMatrix || undefined)
  }, [userRoles, customRoleMatrix])

  const handleOverridesChange = (newOverrides: PermissionOverrides) => {
    const sanitized = sanitizeOverrides(newOverrides)
    setValue(sanitized)
  }

  if (isAdmin) {
    return (
      <div className="field-type">
        <FieldLabel label={fieldLabel(field)} />
        <div style={{
          padding: '1rem',
          background: 'var(--color-bg-secondary, #f5f5f5)',
          borderRadius: '4px',
          fontSize: '0.9rem',
          color: 'var(--color-text-secondary, #666)',
        }}>
          Admins have every permission; overrides do not apply.
        </div>
      </div>
    )
  }

  return (
    <div className="field-type">
      <FieldLabel label={fieldLabel(field)} />

      {isLoading && (
        <div style={{ padding: '1rem', color: 'var(--color-text-secondary, #666)' }}>
          Loading custom role...
        </div>
      )}

      {error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {!isLoading && (
        <>
          {userRoles.length > 0 && (
            <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: 'var(--color-text-secondary, #666)' }}>
              User roles: <strong>{userRoles.join(', ')}</strong>
              {customRoleId && ' + custom role'}
            </div>
          )}

          <PermissionTable
            value={overrides}
            onChange={handleOverridesChange}
            readOnly={readOnly}
            secretLocked={true}
            mode="override"
            inherited={inherited}
          />

          {field.admin?.description && (
            <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', opacity: 0.7 }}>
              {String(field.admin.description)}
            </p>
          )}
        </>
      )}
    </div>
  )
}
