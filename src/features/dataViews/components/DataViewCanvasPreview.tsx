'use client'

import React, { useEffect, useState } from 'react'

import type { DataViewModel } from '../types'

import { DataViewView } from './DataViewView'

type State = { id: number; model: DataViewModel | null; failed: boolean }

/**
 * What the visual editor canvas shows for the Table or chart element: the real table or chart, built
 * from the saved view by the preview endpoint (the page itself is server rendered, so the canvas
 * cannot call the resolver directly). Falls back to a short note while loading or when nothing is chosen.
 */
export function DataViewCanvasPreview({ viewId }: { viewId: number | null }): React.ReactElement {
  const [state, setState] = useState<State | null>(null)

  useEffect(() => {
    if (!viewId) return
    let cancelled = false
    fetch(`/api/admin-data-view-preview?id=${viewId}`, { credentials: 'include' })
      .then((response) => (response.ok ? (response.json() as Promise<{ model?: DataViewModel }>) : Promise.reject(new Error('failed'))))
      .then((json) => {
        if (!cancelled) setState({ id: viewId, model: json.model ?? null, failed: !json.model })
      })
      .catch(() => {
        if (!cancelled) setState({ id: viewId, model: null, failed: true })
      })
    return () => {
      cancelled = true
    }
  }, [viewId])

  if (!viewId) return <div className="dv-missing">Table or chart: pick one in the panel to finish setting this up.</div>
  const current = state && state.id === viewId ? state : null
  if (!current) return <div className="dv-missing">Loading the table or chart...</div>
  if (current.failed || !current.model) return <div className="dv-missing">This table or chart could not be loaded. It may have been deleted, or you may not have access.</div>
  return <DataViewView model={current.model} enhance={false} />
}
