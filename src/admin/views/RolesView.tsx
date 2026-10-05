'use client'

import React, { useState } from 'react'
import styles from './RolesView.module.css'

interface Role {
  id: string
  name: string
  permissions: string[]
}

export function RolesView() {
  const [roles, setRoles] = useState<Role[]>([])
  const [newRole, setNewRole] = useState('')

  const handleAddRole = () => {
    if (newRole.trim()) {
      const role: Role = {
        id: `role-${Math.random().toString(36).slice(2, 8)}`,
        name: newRole,
        permissions: [],
      }
      setRoles([...roles, role])
      setNewRole('')
    }
  }

  const handleDeleteRole = (id: string) => {
    setRoles((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className={styles.container}>
      <h1>Roles</h1>
      <div className={styles.createRole}>
        <input
          type="text"
          value={newRole}
          onChange={(e) => setNewRole(e.currentTarget.value)}
          placeholder="New role name"
        />
        <button onClick={handleAddRole}>Add Role</button>
      </div>
      <ul className={styles.rolesList}>
        {roles.map((role) => (
          <li key={role.id} className={styles.roleItem}>
            <span>{role.name}</span>
            <button onClick={() => handleDeleteRole(role.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
