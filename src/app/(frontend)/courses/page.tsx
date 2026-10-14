import React from 'react'
import type { Metadata } from 'next'

import { CourseListScreen } from '@/features/courses'
import { buildPageJsonLd } from '@/features/seo/pageSchema'
import { listBreadcrumbs } from '@/features/seo/schemaNodes'
import { getSeoContext } from '@/features/seo/settings'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: 'Courses', path: '/courses' })
}

export default async function CoursesIndexRoute() {
  const context = await getSeoContext()
  const jsonLd = context.enabled
    ? buildPageJsonLd({
        collection: 'pages',
        schemaType: 'CollectionPage',
        title: 'Courses',
        url: context.baseUrl + '/courses',
        baseUrl: context.baseUrl,
        siteName: context.siteName,
        breadcrumbs: listBreadcrumbs({ baseUrl: context.baseUrl, path: '/courses', name: 'Courses' }),
      })
    : null

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replaceAll('</', '</\\/') }}
        />
      )}
      <CourseListScreen />
    </>
  )
}
