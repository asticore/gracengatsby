import React from 'react'
import type { Metadata } from 'next'

import { CourseScreen, courseBySlug } from '@/features/courses'
import { getEngine } from '@/lib/engine'
import { getFeatureFlags } from '@/utilities/features'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const flags = await getFeatureFlags()
  if (!flags.lms) return {}

  const { slug } = await params
  const course = await courseBySlug(await getEngine(), slug)
  if (!course) return {}
  return buildMetadata({ title: course.title, seo: course.seo as never, path: `/courses/${course.slug}` })
}

export default async function CourseRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <CourseScreen slug={slug} />
}
