'use client'

import { useEffect, useState } from 'react'
import { resolveName } from './authorName'

interface UserRecord {
  id?: number
  name?: string
  email?: string
}

/**
 * Extract the display name from a user record.
 * @param user - The user object from the API
 * @returns The user's display name (name or email) or 'Unknown'
 */
export function pickUserName(user: unknown): string {
  return resolveName(user)
}

/**
 * Cache for user fetch promises, keyed by user id.
 * Stores promises to avoid duplicate fetches and handle concurrent requests properly.
 */
const userFetchCache = new Map<string | number, Promise<UserRecord | null>>()

/**
 * Fetch a user by id with depth=0.
 * Uses a module-level cache to ensure each id is fetched only once.
 * @param id - The numeric or string user id
 * @returns Promise resolving to user record or null if fetch failed
 */
async function fetchUser(id: string | number): Promise<UserRecord | null> {
  const cacheKey = String(id)
  if (userFetchCache.has(cacheKey)) {
    return userFetchCache.get(cacheKey)!
  }

  const promise = (async () => {
    try {
      const response = await fetch(`/api/users/${id}?depth=0`, {
        credentials: 'include',
      })
      if (!response.ok) {
        return null
      }
      const user = (await response.json()) as UserRecord
      return user
    } catch {
      return null
    }
  })()

  userFetchCache.set(cacheKey, promise)
  return promise
}

/**
 * React hook to resolve user ids to display names.
 *
 * Collects distinct numeric/string ids from the provided values,
 * fetches them from the API (with caching), and returns a function
 * to resolve any value to a display name.
 *
 * @param values - Array of values that may contain numeric/string user ids
 * @returns Function that resolves any value to a display name
 */
export function useAuthorNames(values: unknown[]): (value: unknown) => string {
  const [users, setUsers] = useState<Record<string, UserRecord | null>>({})

  // Stable key of the distinct ids so the effect only re-runs when the set of ids changes.
  const ids = Array.from(new Set(values.filter((v): v is string | number => typeof v === 'number' || typeof v === 'string').map(String))).sort()
  const key = ids.join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const wanted = key.split(',')
    Promise.all(wanted.map((id) => fetchUser(id))).then((results) => {
      if (cancelled) return
      const next: Record<string, UserRecord | null> = {}
      wanted.forEach((id, index) => {
        next[id] = results[index] ?? null
      })
      setUsers(next)
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return (value: unknown): string => {
    // Populated objects resolve directly; ids resolve once their user has loaded.
    if (typeof value === 'number' || typeof value === 'string') {
      const user = users[String(value)]
      return user ? pickUserName(user) : 'Unknown'
    }
    return resolveName(value)
  }
}
