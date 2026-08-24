import { getPayload, Payload } from 'payload'
import config from '@/engage.config'

import { describe, it, beforeAll, expect } from 'vitest'

let engine: Payload

describe('API', () => {
  beforeAll(async () => {
    const engineConfig = await config
    engine = await getPayload({ config: engineConfig })
  })

  it('fetches users', async () => {
    const users = await engine.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })
})
