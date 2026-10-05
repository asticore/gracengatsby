import { describe, it, expect } from 'vitest'
import {
  toggleCell,
  copyMatrix,
  validateRoleName,
  slugify,
  groupResources,
  isSecretResource,
  getActionsForResource,
} from '@/features/roles/matrixUi'
import {
  RESOURCES,
  SECRET_RESOURCES,
  BUILT_IN_ROLES,
  type PermissionMatrix,
} from '@/features/roles/permissions'

describe('matrixUi', () => {
  it('toggleCell flips a permission', () => {
    const matrix: Partial<PermissionMatrix> = {
      pages: { read: true },
      posts: {},
    }
    const result = toggleCell(matrix as PermissionMatrix, 'pages', 'read')
    expect(result.pages.read).toBe(false)
    expect(result.posts.read).toBeUndefined()
  })

  it('toggleCell enables a false/undefined permission', () => {
    const matrix: Partial<PermissionMatrix> = { pages: {} }
    const result = toggleCell(matrix as PermissionMatrix, 'pages', 'create')
    expect(result.pages.create).toBe(true)
  })

  it('copyMatrix copies all resources', () => {
    const source: Partial<PermissionMatrix> = {
      pages: { read: true, create: true },
      posts: { read: true },
    }
    const result = copyMatrix(source, [...RESOURCES] as any)
    expect(result.pages).toEqual({ read: true, create: true })
    expect(result.posts).toEqual({ read: true })
  })

  it('copyMatrix initializes missing resources', () => {
    const source: Partial<PermissionMatrix> = { pages: { read: true } }
    const result = copyMatrix(source, [...RESOURCES] as any)
    expect(result.pages.read).toBe(true)
    expect(result.posts).toBeDefined()
  })

  it('validateRoleName rejects empty names', () => {
    const result = validateRoleName('', Object.keys(BUILT_IN_ROLES))
    expect(result.valid).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('validateRoleName rejects reserved names', () => {
    const result = validateRoleName('admin', Object.keys(BUILT_IN_ROLES))
    expect(result.valid).toBe(false)
  })

  it('validateRoleName accepts valid names', () => {
    const result = validateRoleName('Custom Role', Object.keys(BUILT_IN_ROLES))
    expect(result.valid).toBe(true)
  })

  it('slugify converts to lowercase and dashes', () => {
    expect(slugify('My Test Role')).toBe('my-test-role')
    expect(slugify('Admin Manager')).toBe('admin-manager')
  })

  it('groupResources categorizes correctly', () => {
    const groups = groupResources(RESOURCES as any)
    expect(groups['Collections']).toContain('pages')
    expect(groups['Settings screens']).toContain('settings:site-settings')
    expect(groups['Actions/named']).toContain('admin-edit-lock')
  })

  it('isSecretResource identifies secret resources', () => {
    expect(isSecretResource('users', SECRET_RESOURCES)).toBe(true)
    expect(isSecretResource('roles', SECRET_RESOURCES)).toBe(true)
    expect(isSecretResource('pages', SECRET_RESOURCES)).toBe(false)
  })

  it('getActionsForResource returns all four actions', () => {
    const actions = getActionsForResource('pages')
    expect(actions).toEqual(['read', 'create', 'update', 'delete'])
  })
})
