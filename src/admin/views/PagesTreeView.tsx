import type { Engine } from '@/engine'
import type { TreePage } from '@/features/pagesTree/plan'
import { PagesTreeClient } from './PagesTreeClient'

interface PagesTreeViewProps {
  engine?: Engine
  hasCreatePermission?: boolean
  newDocumentURL?: string
  searchParams?: Record<string, string | string[] | undefined>
}

/**
 * Server component that fetches pages and renders the tree view.
 * Mirrors the MediaGalleryView signature.
 */
/** A relationship value is a bare id at depth 0, or an object (`id` or `value`) when populated. */
export function parentId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'object') {
    const o = raw as { id?: unknown; value?: unknown }
    return parentId(o.id ?? o.value ?? null)
  }
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function PagesTreeView(props: PagesTreeViewProps) {
  const { engine, hasCreatePermission = false, newDocumentURL = '' } = props

  let pages: TreePage[] = []

  if (engine) {
    try {
      const result = await engine.find({
        collection: 'pages',
        limit: 0,
        depth: 0,
        overrideAccess: false,
      })

      if (result.docs && Array.isArray(result.docs)) {
        pages = result.docs.map((doc: any) => ({
          id: Number(doc.id),
          title: String(doc.title || ''),
          slug: String(doc.slug || ''),
          parent: parentId(doc.parent),
          sortOrder: Number(doc.sortOrder ?? 0),
          isHomepage: doc.isHomepage === true,
          status: doc._status === 'published' ? ('published' as const) : ('draft' as const),
        }))
      }
    } catch (err) {
      console.error('Failed to fetch pages for tree view:', err)
    }
  }

  return <PagesTreeClient pages={pages} canEdit={hasCreatePermission} newDocumentURL={newDocumentURL} />
}

export default PagesTreeView
