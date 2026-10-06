'use client'

import React, { useState, useCallback, useMemo } from 'react'
import styles from '@/admin/admin.module.css'
import {
  RESOURCES,
  BUILT_IN_ROLES,
  type PermissionMatrix,
  type Resource,
} from '@/features/roles/permissions'
import { PermissionTable } from '@/admin/components/PermissionTable'
import {
  copyMatrix,
  validateRoleName,
  slugify,
} from '@/features/roles/matrixUi'

interface RoleDoc {
  id: number
  name: string
  slug: string
  description?: string
  builtIn?: boolean
  permissions?: Partial<PermissionMatrix>
}

interface RolesViewClientProps {
  roles: RoleDoc[]
  canEdit: boolean
}

/**
 * Roles admin view client: list, select, create, edit matrix, save, delete.
 */
export function RolesViewClient({ roles: initialRoles, canEdit }: RolesViewClientProps) {

  // UI state
  const [roles, setRoles] = useState<RoleDoc[]>(initialRoles)
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [createForm, setCreateForm] = useState({ name: '', description: '' })
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Get selected role or create dialog state
  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId),
    [roles, selectedRoleId],
  )

  /**
   * Handle permission matrix changes
   */
  const handleMatrixChange = useCallback(
    (newMatrix: Partial<PermissionMatrix>) => {
      if (!selectedRole || selectedRole.builtIn) return
      setRoles((prev) =>
        prev.map((r) => {
          if (r.id === selectedRole.id) {
            return { ...r, permissions: newMatrix }
          }
          return r
        }),
      )
    },
    [selectedRole],
  )

  /**
   * Save role matrix to server
   */
  const handleSaveMatrix = useCallback(async () => {
    if (!selectedRole || !canEdit) return

    setSavingId(selectedRole.id)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/roles/${selectedRole.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: selectedRole.permissions }),
      })

      if (!res.ok) {
        const error = (await res.json()) as Record<string, unknown>
        setErrorMsg((error.message as string) || 'Failed to save role')
      } else {
        const updated = (await res.json()) as RoleDoc
        setRoles((prev) =>
          prev.map((r) => (r.id === selectedRole.id ? updated : r)),
        )
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error'
      setErrorMsg(errMsg)
    } finally {
      setSavingId(null)
    }
  }, [selectedRole, canEdit])

  /**
   * Create new custom role
   */
  const handleCreate = useCallback(async () => {
    const validation = validateRoleName(createForm.name, Object.keys(BUILT_IN_ROLES))
    if (!validation.valid) {
      setErrorMsg(validation.error || 'Invalid role name')
      return
    }

    setSavingId(-1)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: createForm.name,
          slug: slugify(createForm.name),
          description: createForm.description,
          builtIn: false,
          permissions: {} as PermissionMatrix,
        }),
      })

      if (!res.ok) {
        const error = (await res.json()) as Record<string, unknown>
        setErrorMsg((error.message as string) || 'Failed to create role')
      } else {
        const newRole = (await res.json()) as RoleDoc
        setRoles((prev: RoleDoc[]) => [...prev, newRole])
        setSelectedRoleId(newRole.id)
        setShowCreateDialog(false)
        setCreateForm({ name: '', description: '' })
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error'
      setErrorMsg(errMsg)
    } finally {
      setSavingId(null)
    }
  }, [createForm])

  /**
   * Duplicate role
   */
  const handleDuplicate = useCallback(async () => {
    if (!selectedRole || !canEdit) return

    setSavingId(-2)
    setErrorMsg(null)

    try {
      const newName = `${selectedRole.name} (copy)`
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName,
          slug: slugify(newName),
          description: selectedRole.description,
          builtIn: false,
          permissions: copyMatrix((selectedRole.permissions as PermissionMatrix) || {}, [...RESOURCES] as Resource[]),
        }),
      })

      if (!res.ok) {
        const error = (await res.json()) as Record<string, unknown>
        setErrorMsg((error.message as string) || 'Failed to duplicate role')
      } else {
        const newRole = (await res.json()) as RoleDoc
        setRoles((prev: RoleDoc[]) => [...prev, newRole])
        setSelectedRoleId(newRole.id)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error'
      setErrorMsg(errMsg)
    } finally {
      setSavingId(null)
    }
  }, [selectedRole, canEdit])

  /**
   * Delete role
   */
  const handleDelete = useCallback(async () => {
    if (!selectedRole || selectedRole.builtIn || !canEdit) return
    if (deletingId !== selectedRole.id) {
      setDeletingId(selectedRole.id)
      return
    }

    setSavingId(selectedRole.id)
    setErrorMsg(null)

    try {
      const res = await fetch(`/api/roles/${selectedRole.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        const error = (await res.json()) as Record<string, unknown>
        setErrorMsg((error.message as string) || 'Failed to delete role')
      } else {
        setRoles((prev) => prev.filter((r) => r.id !== selectedRole.id))
        setSelectedRoleId(null)
        setDeletingId(null)
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Network error'
      setErrorMsg(errMsg)
    } finally {
      setSavingId(null)
    }
  }, [selectedRole, canEdit, deletingId])

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Roles</h1>
        <p>Manage role permissions with a matrix grid.</p>
      </div>

      <div className={styles.rolesContainer}>
        {/* Left: role list */}
        <div className={styles.rolesList}>
          <div className={styles.rolesHeader}>
            <h2>Roles</h2>
            {canEdit && (
              <button
                onClick={() => setShowCreateDialog(true)}
                className={styles.btnPrimary}
              >
                + Create Role
              </button>
            )}
          </div>

          {/* Create dialog */}
          {showCreateDialog && (
            <div className={styles.dialog}>
              <div className={styles.dialogContent}>
                <h3>Create Custom Role</h3>
                <input
                  type="text"
                  placeholder="Role name"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  className={styles.input}
                />
                <textarea
                  placeholder="Description (optional)"
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className={styles.input}
                  rows={3}
                />
                <div className={styles.dialogActions}>
                  <button
                    onClick={() => {
                      setShowCreateDialog(false)
                      setCreateForm({ name: '', description: '' })
                      setErrorMsg(null)
                    }}
                    className={styles.btnSecondary}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={savingId === -1}
                    className={styles.btnPrimary}
                  >
                    {savingId === -1 ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Role list items */}
          {roles.map((role) => (
            <div
              key={role.id}
              onClick={() => setSelectedRoleId(role.id)}
              className={`${styles.roleItem} ${selectedRoleId === role.id ? styles.roleItemActive : ''}`}
            >
              <div className={styles.roleItemName}>{role.name}</div>
              {role.builtIn && <span className={styles.badge}>Built-in</span>}
            </div>
          ))}
        </div>

        {/* Right: matrix editor or empty state */}
        <div className={styles.matrixPanel}>
          {selectedRole ? (
            <div>
              <div className={styles.matrixHeader}>
                <div>
                  <h2>{selectedRole.name}</h2>
                  {selectedRole.description && <p className={styles.desc}>{selectedRole.description}</p>}
                  {selectedRole.builtIn && <p className={styles.readOnly}>Read-only (built-in role)</p>}
                </div>
                {!selectedRole.builtIn && canEdit && (
                  <div className={styles.matrixActions}>
                    <button
                      onClick={handleDuplicate}
                      disabled={savingId !== null}
                      className={styles.btnSecondary}
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={handleSaveMatrix}
                      disabled={savingId !== null || selectedRole.builtIn}
                      className={styles.btnPrimary}
                    >
                      {savingId === selectedRole.id ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={savingId !== null || selectedRole.builtIn}
                      className={styles.btnDanger}
                    >
                      {deletingId === selectedRole.id ? 'Confirm delete?' : 'Delete'}
                    </button>
                  </div>
                )}
              </div>

              {errorMsg && <div className={styles.error}>{errorMsg}</div>}

              {/* Permission matrix */}
              <PermissionTable
                value={selectedRole.permissions || {}}
                onChange={handleMatrixChange}
                readOnly={selectedRole.builtIn || !canEdit}
                secretLocked={true}
                mode="matrix"
              />
            </div>
          ) : (
            <div className={styles.emptyState}>
              <p>Select a role to edit its permissions.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}