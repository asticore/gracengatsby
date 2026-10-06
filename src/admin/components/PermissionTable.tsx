'use client'

import React, { useMemo, useState } from 'react'
import styles from '@/admin/admin.module.css'
import {
  type PermissionMatrix,
  type PermissionOverrides,
  type Resource,
  type Action,
  SECRET_RESOURCES,
  PERMISSION_CATEGORIES,
} from '@/features/roles/permissions'
import {
  toggleColumn,
  filterBySearch,
  setOverrideState,
} from '@/features/roles/permissionTable'


// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface PermissionTableProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (next: any) => void
  readOnly?: boolean
  secretLocked?: boolean
  mode?: 'matrix' | 'override'
  inherited?: Partial<PermissionMatrix>
}

/**
 * Renders a permission matrix or override table with collapsible categories,
 * column/category toggles, and tri-state controls in override mode.
 */
 
export function PermissionTable({
  value,
  onChange,
  readOnly = false,
  secretLocked = false,
  mode = 'matrix',
  inherited = {},
}: PermissionTableProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(PERMISSION_CATEGORIES.map(c => c.id)),
  )

  // Get the actual matrix from value (either direct matrix or overrides)
  const matrix = useMemo(() => {
    if (mode === 'override') {
      const overrides = value as PermissionOverrides
      // For display, show both grant and deny in the override matrix
      const result: Partial<PermissionMatrix> = {}
      if (overrides.grant) {
        for (const [resource, perms] of Object.entries(overrides.grant)) {
          result[resource as Resource] = { ...perms }
        }
      }
      if (overrides.deny) {
        for (const [resource, perms] of Object.entries(overrides.deny)) {
          result[resource as Resource] = { ...result[resource as Resource], ...perms }
        }
      }
      return result
    }
    return (value as Partial<PermissionMatrix>) || {}
  }, [value, mode])

  const filteredCategories = useMemo(
    () => filterBySearch(searchTerm),
    [searchTerm],
  )

  const toggleCategoryExpanded = (categoryId: string) => {
    const next = new Set(expandedCategories)
    if (next.has(categoryId)) {
      next.delete(categoryId)
    } else {
      next.add(categoryId)
    }
    setExpandedCategories(next)
  }

  const handleToggleColumn = (action: Action, enable: boolean) => {
    if (readOnly) return

    if (mode === 'override') {
      const overrides = value as PermissionOverrides
      let next = overrides

      for (const category of PERMISSION_CATEGORIES) {
        for (const row of category.rows) {
          if (enable) {
            next = setOverrideState(next, row.resource, action, 'allow')
          } else {
            next = setOverrideState(next, row.resource, action, 'inherit')
          }
        }
      }
      onChange(next)
    } else {
      const nextMatrix = toggleColumn(matrix, action, enable)
      onChange(nextMatrix)
    }
  }

  const handleToggleCell = (resource: Resource, action: Action) => {
    if (readOnly || (secretLocked && SECRET_RESOURCES.includes(resource))) return

    if (mode === 'override') {
      const overrides = value as PermissionOverrides
      const currentGrant = overrides.grant?.[resource]?.[action]
      const currentDeny = overrides.deny?.[resource]?.[action]

      let newState: 'allow' | 'deny' | 'inherit'
      if (currentGrant === true) {
        newState = 'deny'
      } else if (currentDeny === true) {
        newState = 'inherit'
      } else {
        newState = 'allow'
      }

      const next = setOverrideState(overrides, resource, action, newState)
      onChange(next)
    } else {
      const nextMatrix = { ...matrix }
      const resourcePerms = nextMatrix[resource] || {}
      nextMatrix[resource] = {
        ...resourcePerms,
        [action]: !(resourcePerms[action] ?? false),
      }
      onChange(nextMatrix)
    }
  }

  return (
    <div className={styles.matrixWrapper}>
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          placeholder="Search permissions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.input}
          style={{ flex: 1, maxWidth: '100%' }}
        />
      </div>

      <table className={styles.matrix}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', width: '200px' }}>Resource</th>
            {['read', 'create', 'update', 'delete', 'publish'].map((action) => {
              const actionLabels: Record<string, string> = {
                read: 'Read',
                create: 'Create',
                update: 'Edit',
                delete: 'Delete',
                publish: 'Publish',
              }
              return (
              <th key={action} className={styles.actionHeader}>
                <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <input
                    type="checkbox"
                    onChange={(e) => handleToggleColumn(action as Action, e.target.checked)}
                    disabled={readOnly}
                    className={styles.checkbox}
                  />
                  <span style={{ fontSize: '0.85rem' }}>{actionLabels[action]}</span>
                </label>
              </th>
            )
            })}
          </tr>
        </thead>
        <tbody>
          {filteredCategories.map((category) => {
            const isExpanded = expandedCategories.has(category.id)
            const enabledCount = category.rows.filter((row) => {
              const perms = matrix[row.resource]
              return row.actions.some(a => perms?.[a])
            }).length

            return [
              <tr key={`group-${category.id}`} className={styles.groupHeader}>
                <td colSpan={6} style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleCategoryExpanded(category.id)}>
                  <span style={{ marginRight: '0.5rem' }}>{isExpanded ? '▼' : '▶'}</span>
                  {category.label}
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.9rem', opacity: 0.7 }}>
                    {enabledCount} of {category.rows.length}
                  </span>
                </td>
              </tr>,
              ...(isExpanded
                ? category.rows.map((row) => {
                    const isSecret = secretLocked && SECRET_RESOURCES.includes(row.resource)
                    const perms = matrix[row.resource] || {}

                    return (
                      <tr
                        key={row.resource}
                        className={`${styles.resourceRow} ${isSecret ? styles.secretRow : ''}`}
                      >
                        <td className={styles.resourceLabel}>
                          {row.label}
                          {isSecret && <span className={styles.adminOnly}> Admin only</span>}
                        </td>
                        {['read', 'create', 'update', 'delete', 'publish'].map((action) => {
                          if (!row.actions.includes(action as Action)) {
                            return <td key={`${row.resource}-${action}`} className={styles.cellContainer} />
                          }

                          if (mode === 'override') {
                            const grant = (value as PermissionOverrides).grant?.[row.resource]?.[action as Action]
                            const deny = (value as PermissionOverrides).deny?.[row.resource]?.[action as Action]
                            const inheritedVal = inherited?.[row.resource]?.[action as Action]

                            let displayState = 'inherit'
                            if (grant === true) displayState = 'allow'
                            else if (deny === true) displayState = 'deny'

                            return (
                              <td
                                key={`${row.resource}-${action}`}
                                className={styles.cellContainer}
                                title={displayState}
                              >
                                <button
                                  onClick={() => handleToggleCell(row.resource, action as Action)}
                                  disabled={readOnly || isSecret}
                                  className={styles.checkbox}
                                  style={{
                                    appearance: 'none',
                                    width: '20px',
                                    height: '20px',
                                    border: '1px solid var(--color-border, #ccc)',
                                    borderRadius: '2px',
                                    cursor: readOnly || isSecret ? 'not-allowed' : 'pointer',
                                    background: displayState === 'allow' ? '#4caf50' : displayState === 'deny' ? '#f44336' : (inheritedVal ? '#ccc' : 'white'),
                                    color: 'white',
                                    fontSize: '12px',
                                    fontWeight: 'bold',
                                    opacity: isSecret ? 0.5 : 1,
                                  }}
                                >
                                  {displayState === 'allow' ? '✓' : displayState === 'deny' ? '✕' : inheritedVal ? '–' : ''}
                                </button>
                              </td>
                            )
                          } else {
                            const isEnabled = perms[action as Action] ?? false

                            return (
                              <td
                                key={`${row.resource}-${action}`}
                                className={styles.cellContainer}
                              >
                                <input
                                  type="checkbox"
                                  checked={isEnabled}
                                  onChange={() => handleToggleCell(row.resource, action as Action)}
                                  disabled={readOnly || isSecret}
                                  className={styles.checkbox}
                                />
                              </td>
                            )
                          }
                        })}
                      </tr>
                    )
                  })
                : []),
            ]
          })}
        </tbody>
      </table>
    </div>
  )
}
