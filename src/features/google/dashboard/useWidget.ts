import { useEffect, useState } from 'react'

import type { WidgetKind, WidgetState } from './types'

/**
 * Loads one dashboard widget from its API route. The first render is always "loading", so the server
 * and the browser agree. A failed request becomes an error state, never a blank card.
 */

export type Loadable<T> = { phase: 'loading' } | { phase: 'done'; result: WidgetState<T> }

const FAILED: WidgetState<never> = { state: 'error', message: 'Could not load this card. Refresh the page to try again.' }

export function useWidget<T>(kind: WidgetKind): Loadable<T> {
  const [loaded, setLoaded] = useState<{ kind: WidgetKind; result: WidgetState<T> } | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin-google-dashboard?widget=${kind}`, { headers: { Accept: 'application/json' } })
      .then((response) => (response.ok ? (response.json() as Promise<WidgetState<T>>) : Promise.resolve(FAILED as WidgetState<T>)))
      .catch((): WidgetState<T> => FAILED as WidgetState<T>)
      .then((result) => {
        if (alive) setLoaded({ kind, result })
      })
    return () => {
      alive = false
    }
  }, [kind])

  if (!loaded || loaded.kind !== kind) return { phase: 'loading' }
  return { phase: 'done', result: loaded.result }
}
