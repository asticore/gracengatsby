import React from 'react'
import type { Metadata } from 'next'

import { CourseListScreen } from '@/features/courses'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: 'Courses', path: '/courses' })
}

export default async function CoursesIndexRoute() {
  return <CourseListScreen />
}
