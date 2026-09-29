import { getEngine } from '@/engine'

export const testUser = {
  email: 'dev@asticore.test',
  password: 'test',
}

async function removeTestUser(): Promise<void> {
  const engine = await getEngine()
  const found = await engine.find({
    collection: 'users',
    where: { email: { equals: testUser.email } },
    limit: 100,
    overrideAccess: true,
  })
  for (const doc of found.docs) {
    await engine.delete({ collection: 'users', id: doc.id as number, overrideAccess: true })
  }
}

/**
 * Seeds a test user for e2e admin tests.
 */
export async function seedTestUser(): Promise<void> {
  const engine = await getEngine()
  await removeTestUser()
  await engine.create({ collection: 'users', data: testUser, overrideAccess: true })
}

/**
 * Cleans up test user after tests
 */
export async function cleanupTestUser(): Promise<void> {
  await removeTestUser()
}
