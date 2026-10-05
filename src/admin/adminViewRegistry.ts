import type { ComponentType } from 'react'

export interface AdminView {
  id: string
  label: string
  component: ComponentType
}

const adminViews: AdminView[] = [
  {
    id: 'roles',
    label: 'Manage Roles',
    component: () => null, // Imported dynamically
  },
  {
    id: 'settings',
    label: 'Site Settings',
    component: () => null, // Imported dynamically
  },
  {
    id: 'header-footer',
    label: 'Header & Footer',
    component: () => null, // Imported dynamically
  },
]

export function getAdminViews(): AdminView[] {
  return adminViews
}

export function getAdminView(id: string): AdminView | undefined {
  return adminViews.find((view) => view.id === id)
}
