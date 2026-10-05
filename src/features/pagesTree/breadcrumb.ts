import type { PageRecord } from '@/cms/db/collections/pages'

export interface BreadcrumbItem {
  id: string
  title: string
  slug: string
}

export function buildBreadcrumb(
  page: PageRecord,
  allPages: PageRecord[],
): BreadcrumbItem[] {
  const breadcrumb: BreadcrumbItem[] = []
  let currentPage: PageRecord | undefined = page

  while (currentPage) {
    breadcrumb.unshift({
      id: currentPage.id,
      title: currentPage.title,
      slug: currentPage.slug,
    })

    if (currentPage.parent_id) {
      currentPage = allPages.find((p) => p.id === currentPage?.parent_id)
    } else {
      currentPage = undefined
    }
  }

  return breadcrumb
}
