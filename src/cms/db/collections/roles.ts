import type { TypedRecord } from '@/engine'

export interface RoleRecord extends TypedRecord {
  name: string
  description?: string
  permissions: string[]
  created_at: string
  updated_at: string
}

export const rolesCollection = {
  name: 'roles',
  schema: {
    id: 'text primary key',
    name: 'text not null unique',
    description: 'text',
    permissions: 'text not null',
    created_at: 'text not null',
    updated_at: 'text not null',
  },
}
