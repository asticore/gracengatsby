'use client'

import { useEffect, useState } from 'react'

/**
 * Loads one admin results page. The result is tagged with the URL it came
 * from, so a page change reads as loading until its own response lands and a
 * late response for an older page is never shown. A failed request is an
 * error state, not a thrown one.
 */
export function useResultsPage<T>(url: string): { data: T | null; error: boolean; loading: boolean } {
  const [state, setState] = useState<{ url: string; data: T | null; error: boolean }>({
    url: '',
    data: null,
    error: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return (await response.json()) as T
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ url, data, error: false })
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ url, data: null, error: true })
      })
    return () => controller.abort()
  }, [url])

  const current = state.url === url
  return { data: current ? state.data : null, error: current && state.error, loading: !current }
}
