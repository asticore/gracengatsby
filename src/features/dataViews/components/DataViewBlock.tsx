import React from 'react'

import { loadDataView } from '../load'

import { DataViewView } from './DataViewView'

/**
 * A saved table or chart placed on a page: the `data-view` element, the `[data-view]` shortcode and the
 * `{{data-view:...}}` merge tag all end up here. Only views marked public render here: any editor can
 * place a shortcode, so a private view must not be pulled onto a page by someone without the Tables and
 * charts permission. A private or missing view renders nothing on the live site.
 */
export const DataViewBlock = async ({ viewRef }: { viewRef: string | number | null | undefined }): Promise<React.ReactElement | null> => {
  if (viewRef === null || viewRef === undefined || viewRef === '') return null
  const result = await loadDataView(String(viewRef), { requirePublic: true })
  if (result.status !== 'ok') return null
  return <DataViewView model={result.model} />
}
