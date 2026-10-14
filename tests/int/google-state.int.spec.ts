// @vitest-environment node
/**
 * The Google sign-in state: a signed value that must match the browser's cookie,
 * and the e-mail read from the id_token. Pure functions, no database.
 */
import { describe, expect, it } from 'vitest'

import { emailFromIdToken } from '@/features/google/idToken'
import { createOauthState, STATE_MAX_AGE_MS, verifyOauthState } from '@/features/google/state'

const SECRET = 'test-engage-secret-value'
const NOW = 1_800_000_000_000

describe('Google sign-in state', () => {
  it('accepts a fresh state that matches its cookie', () => {
    const { state, nonce } = createOauthState(SECRET, NOW)
    expect(verifyOauthState(state, nonce, SECRET, NOW + 1000)).toBe(true)
  })

  it('rejects a state whose cookie belongs to another browser', () => {
    const { state } = createOauthState(SECRET, NOW)
    const other = createOauthState(SECRET, NOW)
    expect(verifyOauthState(state, other.nonce, SECRET, NOW)).toBe(false)
  })

  it('rejects a missing cookie or a missing state', () => {
    const { state, nonce } = createOauthState(SECRET, NOW)
    expect(verifyOauthState(state, null, SECRET, NOW)).toBe(false)
    expect(verifyOauthState(null, nonce, SECRET, NOW)).toBe(false)
  })

  it('rejects a state signed with another secret', () => {
    const { state, nonce } = createOauthState('a-different-secret', NOW)
    expect(verifyOauthState(state, nonce, SECRET, NOW)).toBe(false)
  })

  it('rejects a tampered timestamp', () => {
    const { state, nonce } = createOauthState(SECRET, NOW)
    const [n, , sig] = state.split('.')
    expect(verifyOauthState(`${n}.${NOW + 60_000}.${sig}`, nonce, SECRET, NOW)).toBe(false)
  })

  it('rejects a state older than ten minutes', () => {
    const { state, nonce } = createOauthState(SECRET, NOW)
    expect(verifyOauthState(state, nonce, SECRET, NOW + STATE_MAX_AGE_MS + 1)).toBe(false)
  })

  it('rejects an empty secret', () => {
    const { state, nonce } = createOauthState(SECRET, NOW)
    expect(verifyOauthState(state, nonce, '', NOW)).toBe(false)
  })

  it('reads the e-mail from an id_token payload', () => {
    const payload = Buffer.from(JSON.stringify({ email: ' owner@example.com ', sub: '1' })).toString('base64url')
    expect(emailFromIdToken(`header.${payload}.signature`)).toBe('owner@example.com')
  })

  it('returns an empty e-mail for a missing or broken id_token', () => {
    expect(emailFromIdToken(undefined)).toBe('')
    expect(emailFromIdToken('not-a-token')).toBe('')
    expect(emailFromIdToken('a.!!!.c')).toBe('')
  })
})
