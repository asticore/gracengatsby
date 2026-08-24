import { getPayload } from 'payload'
import config from '../../src/engage.config.js'

export const testUser = {
  email: 'dev@asticore.test',
  password: 'test',
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const engine = await getPayload({ config })

  // Delete existing test user if any
  await engine.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })

  // Create fresh test user
  await engine.create({
    collection: 'users',
    data: testUser,
  })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  const engine = await getPayload({ config })

  await engine.delete({
    collection: 'users',
    where: {
      email: {
        equals: testUser.email,
      },
    },
  })
}
