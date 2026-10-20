'use client'

import { useEffect } from 'react'

import { evaluateRules, needsAuthState, parseRules, type VisContext, type VisRules } from '@/lib/visibilityRules'

const STORE_KEY = 'eg-vis-state'
const TTL_MS = 5 * 60 * 1000

type AuthState = { loggedIn: boolean | null; roles: string[] }

let inflight: Promise<AuthState> | null = null

function readCache(): AuthState | null {
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { t?: number; loggedIn?: boolean; roles?: string[] }
    if (typeof v.t !== 'number' || Date.now() - v.t > TTL_MS || typeof v.loggedIn !== 'boolean') return null
    return { loggedIn: v.loggedIn, roles: Array.isArray(v.roles) ? v.roles.filter((x) => typeof x === 'string') : [] }
  } catch {
    return null
  }
}

function writeCache(s: AuthState): void {
  try {
    window.sessionStorage.setItem(STORE_KEY, JSON.stringify({ t: Date.now(), loggedIn: s.loggedIn, roles: s.roles }))
  } catch {
    /* storage blocked: the next page just asks again */
  }
}

/** Who is signed in. Cached in sessionStorage; one in-flight request shared by every block. */
function loadAuth(): Promise<AuthState> {
  const cached = readCache()
  if (cached) return Promise.resolve(cached)
  if (!inflight) {
    inflight = fetch('/api/visibility-state', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { loggedIn?: unknown; roles?: unknown } | null): AuthState => {
        if (!j || typeof j.loggedIn !== 'boolean') return { loggedIn: null, roles: [] }
        const state = { loggedIn: j.loggedIn, roles: Array.isArray(j.roles) ? j.roles.filter((x): x is string => typeof x === 'string') : [] }
        writeCache(state)
        return state
      })
      .catch((): AuthState => ({ loggedIn: null, roles: [] }))
      .finally(() => {
        inflight = null
      })
  }
  return inflight
}

/** Evaluates every [data-eg-cond] block on the page and marks it shown (data-eg-ok) or hidden (data-eg-off). */
function apply(): void {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-eg-cond]'))
  const items: Array<{ el: HTMLElement; rules: VisRules }> = []
  for (const el of nodes) {
    const rules = parseRules(el.getAttribute('data-eg-cond'))
    if (rules) items.push({ el, rules })
  }
  if (items.length === 0) return
  const href = window.location.pathname + window.location.search
  const finish = (auth: AuthState) => {
    const ctx: VisContext = { now: Date.now(), loggedIn: auth.loggedIn, roles: auth.roles, href }
    for (const { el, rules } of items) {
      if (evaluateRules(rules, ctx)) {
        el.setAttribute('data-eg-ok', '')
        el.removeAttribute('data-eg-off')
      } else {
        el.setAttribute('data-eg-off', '')
        el.removeAttribute('data-eg-ok')
      }
    }
  }
  if (items.some((i) => needsAuthState(i.rules))) void loadAuth().then(finish)
  else finish({ loggedIn: null, roles: [] })
}

/** Mounted by StyledBlock for any block with rules; each mount re-scans the page (idempotent). */
export default function VisibilityGate(): null {
  useEffect(() => {
    apply()
  }, [])
  return null
}
