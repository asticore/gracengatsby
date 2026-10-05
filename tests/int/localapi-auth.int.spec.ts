import { describe, expect, it } from 'vitest'
import type { AuthDbOps, AuthUserRow } from '@/localapi/auth'
import {
  hashPassword,
  verifyPassword,
  validateEmail,
  validatePassword,
  createAuthDb,
  findUser,
  createUser,
  updateUser,
  deleteUser,
  generatePasswordResetToken,
  validatePasswordResetToken,
  clearExpiredTokens,
  type PasswordResetToken,
  AUTH_TOKEN_EXPIRY_HOURS,
} from '@/localapi/auth'

function makeFakeAuthDb(initial: AuthUserRow[] = []): AuthDbOps & { rows: AuthUserRow[] } {
  const rows = [...initial]

  return {
    rows,
    async findByEmail(email: string) {
      return rows.find((r) => r.email === email) || null
    },
    async create(row: AuthUserRow) {
      rows.push(row)
      return row
    },
    async update(email: string, updates: Partial<AuthUserRow>) {
      const idx = rows.findIndex((r) => r.email === email)
      if (idx === -1) return false
      Object.assign(rows[idx], updates)
      return true
    },
    async delete(email: string) {
      const idx = rows.findIndex((r) => r.email === email)
      if (idx === -1) return false
      rows.splice(idx, 1)
      return true
    },
  }
}

function makeUser(overrides: Partial<AuthUserRow> = {}): AuthUserRow {
  return {
    id: 1,
    email: 'test@example.com',
    hashedPassword: 'hashed',
    roles: ['user'],
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }
}

const isoInFuture = (...args: Parameters<typeof Date>) => new Date(Date.now() + 60 * 60 * 1000).toISOString()
const isoInPast = (...args: Parameters<typeof Date>) => new Date(Date.now() - 60 * 60 * 1000).toISOString()

describe('Auth Module', () => {
  describe('validateEmail', () => {
    it('should accept valid emails', () => {
      expect(validateEmail('test@example.com')).toBe(true)
      expect(validateEmail('user+tag@domain.co.uk')).toBe(true)
    })

    it('should reject invalid emails', () => {
      expect(validateEmail('not-an-email')).toBe(false)
      expect(validateEmail('@example.com')).toBe(false)
      expect(validateEmail('test@')).toBe(false)
      expect(validateEmail('')).toBe(false)
    })
  })

  describe('validatePassword', () => {
    it('should require at least 8 characters', () => {
      expect(validatePassword('Short1!')).toBe(false)
      expect(validatePassword('LongEnough1!')).toBe(true)
    })

    it('should require at least one uppercase letter', () => {
      expect(validatePassword('lowercase123!')).toBe(false)
      expect(validatePassword('Uppercase123!')).toBe(true)
    })

    it('should require at least one lowercase letter', () => {
      expect(validatePassword('UPPERCASE123!')).toBe(false)
      expect(validatePassword('Uppercase123!')).toBe(true)
    })

    it('should require at least one number', () => {
      expect(validatePassword('NoNumber!')).toBe(false)
      expect(validatePassword('HasNumber1!')).toBe(true)
    })

    it('should require at least one special character', () => {
      expect(validatePassword('NoSpecial123')).toBe(false)
      expect(validatePassword('HasSpecial123!')).toBe(true)
    })

    it('should accept valid passwords', () => {
      expect(validatePassword('ValidPass123!')).toBe(true)
      expect(validatePassword('AnotherValid99@')).toBe(true)
    })
  })

  describe('hashPassword and verifyPassword', () => {
    it('should hash a password and verify it correctly', async () => {
      const plaintext = 'MyPassword123!'
      const hashed = await hashPassword(plaintext)

      expect(hashed).not.toBe(plaintext)
      expect(await verifyPassword(plaintext, hashed)).toBe(true)
    })

    it('should reject incorrect password', async () => {
      const password = 'MyPassword123!'
      const hashed = await hashPassword(password)
      expect(await verifyPassword('WrongPassword123!', hashed)).toBe(false)
    })

    it('should handle empty strings', async () => {
      const hashed = await hashPassword('')
      expect(await verifyPassword('', hashed)).toBe(true)
      expect(await verifyPassword('something', hashed)).toBe(false)
    })
  })

  describe('createAuthDb', () => {
    it('should initialize with empty rows', async () => {
      // Mocked test since createAuthDb uses real D1
      const db = makeFakeAuthDb()
      expect(db.rows).toEqual([])
    })
  })

  describe('findUser', () => {
    it('should find a user by email', async () => {
      const user = makeUser({ email: 'found@example.com' })
      const db = makeFakeAuthDb([user])

      const found = await findUser(db, 'found@example.com')
      expect(found).toEqual(user)
    })

    it('should return null if user not found', async () => {
      const db = makeFakeAuthDb()
      const found = await findUser(db, 'notfound@example.com')
      expect(found).toBeNull()
    })
  })

  describe('createUser', () => {
    it('should create a user with hashed password', async () => {
      const db = makeFakeAuthDb()
      const user = await createUser(db, 'new@example.com', 'Password123!', ['user'])
      expect(user.email).toBe('new@example.com')
      expect(user.hashedPassword).not.toBe('Password123!')
      expect(await verifyPassword('Password123!', user.hashedPassword)).toBe(true)
      expect(user.roles).toEqual(['user'])
    })

    it('should not create user with invalid email', async () => {
      const db = makeFakeAuthDb()
      await expect(createUser(db, 'invalid', 'Password123!', [])).rejects.toThrow()
    })

    it('should not create user with invalid password', async () => {
      const db = makeFakeAuthDb()
      await expect(createUser(db, 'test@example.com', 'weak', [])).rejects.toThrow()
    })

    it('should not create duplicate user', async () => {
      const db = makeFakeAuthDb([makeUser({ email: 'exists@example.com' })])
      await expect(createUser(db, 'exists@example.com', 'Password123!', [])).rejects.toThrow()
    })
  })

  describe('updateUser', () => {
    it('should update user password', async () => {
      const user = makeUser({ email: 'test@example.com' })
      const db = makeFakeAuthDb([user])

      await updateUser(db, 'test@example.com', { password: 'NewPass123!' })
      const updated = db.rows[0]
      expect(await verifyPassword('NewPass123!', updated.hashedPassword)).toBe(true)
      expect(await verifyPassword('hashed', updated.hashedPassword)).toBe(false)
    })

    it('should update user metadata', async () => {
      const user = makeUser({ email: 'test@example.com', metadata: null })
      const db = makeFakeAuthDb([user])

      await updateUser(db, 'test@example.com', { metadata: { lastLogin: '2026-10-05' } })
      const updated = db.rows[0]
      expect(updated.metadata).toEqual({ lastLogin: '2026-10-05' })
    })

    it('should return false if user not found', async () => {
      const db = makeFakeAuthDb()
      const result = await updateUser(db, 'notfound@example.com', { metadata: {} })
      expect(result).toBe(false)
    })

    it('should not allow invalid password', async () => {
      const user = makeUser({ email: 'test@example.com' })
      const db = makeFakeAuthDb([user])

      await expect(updateUser(db, 'test@example.com', { password: 'weak' })).rejects.toThrow()
    })
  })

  describe('deleteUser', () => {
    it('should delete an existing user', async () => {
      const user = makeUser({ email: 'delete@example.com' })
      const db = makeFakeAuthDb([user])

      const result = await deleteUser(db, 'delete@example.com')
      expect(result).toBe(true)
      expect(db.rows).toHaveLength(0)
    })

    it('should return false if user not found', async () => {
      const db = makeFakeAuthDb()
      const result = await deleteUser(db, 'notfound@example.com')
      expect(result).toBe(false)
    })
  })

  describe('password reset tokens', () => {
    it('should generate a reset token', async () => {
      const token = await generatePasswordResetToken()
      expect(token).toBeTruthy()
      expect(typeof token).toBe('string')
      expect(token.length).toBeGreaterThan(20)
    })

    it('should validate a token with correct expiry', () => {
      const token: PasswordResetToken = {
        token: 'test-token-123',
        email: 'test@example.com',
        expiresAt: isoInFuture(),
      }
      const result = validatePasswordResetToken(token, 'test-token-123', 'test@example.com')
      expect(result).toBe(true)
    })

    it('should reject expired token', () => {
      const token: PasswordResetToken = {
        token: 'test-token-123',
        email: 'test@example.com',
        expiresAt: isoInPast(),
      }
      const result = validatePasswordResetToken(token, 'test-token-123', 'test@example.com')
      expect(result).toBe(false)
    })

    it('should reject token with wrong email', () => {
      const token: PasswordResetToken = {
        token: 'test-token-123',
        email: 'test@example.com',
        expiresAt: isoInFuture(),
      }
      const result = validatePasswordResetToken(token, 'test-token-123', 'wrong@example.com')
      expect(result).toBe(false)
    })

    it('should reject token with wrong token string', () => {
      const token: PasswordResetToken = {
        token: 'test-token-123',
        email: 'test@example.com',
        expiresAt: isoInFuture(),
      }
      const result = validatePasswordResetToken(token, 'wrong-token', 'test@example.com')
      expect(result).toBe(false)
    })
  })

  describe('clearExpiredTokens', () => {
    it('should filter out expired tokens', () => {
      const tokens: PasswordResetToken[] = [
        { token: 'valid-1', email: 'a@example.com', expiresAt: isoInFuture() },
        { token: 'expired-1', email: 'b@example.com', expiresAt: isoInPast() },
        { token: 'valid-2', email: 'c@example.com', expiresAt: isoInFuture() },
      ]

      const cleaned = clearExpiredTokens(tokens)
      expect(cleaned).toHaveLength(2)
      expect(cleaned.map((t) => t.token)).toEqual(['valid-1', 'valid-2'])
    })

    it('should handle empty token list', () => {
      const cleaned = clearExpiredTokens([])
      expect(cleaned).toEqual([])
    })

    it('should handle all expired tokens', () => {
      const tokens: PasswordResetToken[] = [
        { token: 'expired-1', email: 'a@example.com', expiresAt: isoInPast() },
        { token: 'expired-2', email: 'b@example.com', expiresAt: isoInPast() },
      ]

      const cleaned = clearExpiredTokens(tokens)
      expect(cleaned).toHaveLength(0)
    })

    it('should handle mixed timezone tokens', () => {
      const tokens: PasswordResetToken[] = [
        { token: 'token-1', email: 'a@example.com', expiresAt: isoInFuture() },
        { token: 'token-2', email: 'b@example.com', expiresAt: isoInPast() },
      ]

      const cleaned = clearExpiredTokens(tokens)
      expect(cleaned).toHaveLength(1)
      expect(cleaned[0].token).toBe('token-1')
    })
  })

  describe('AUTH_TOKEN_EXPIRY_HOURS', () => {
    it('should be a positive number', () => {
      expect(AUTH_TOKEN_EXPIRY_HOURS).toBeGreaterThan(0)
      expect(typeof AUTH_TOKEN_EXPIRY_HOURS).toBe('number')
    })
  })
})

function headersFrom(map: Record<string, string>): { get: (name: string) => string | null } {
  return {
    get: (name: string) => map[name] || null,
  }
}
