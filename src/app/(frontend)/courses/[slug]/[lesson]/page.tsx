import React from 'react'
import type { Metadata } from 'next'

import { LessonScreen } from '@/features/courses'
import { buildMetadata } from '@/utilities/seo'

export const dynamic = 'force-dynamic'

/**
 * Deliberately generic: a lesson title in the tab, in a link preview or in a
 * search result would describe paid content to someone who has not bought it,
 * and metadata is generated before the access-enforced fetch would have had a
 * chance to refuse. The lesson body itself carries the real heading.
 */
export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({ title: 'Lesson', seo: { noIndex: true } })
}

export default async function LessonRoute({ params }: { params: Promise<{ slug: string; lesson: string }> }) {
  const { slug, lesson } = await params
  return <LessonScreen courseSlug={slug} lessonSlug={lesson} />
}
