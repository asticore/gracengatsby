import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import { BlockRenderer } from '@/components/blocks/BlockRenderer'
import type { Media } from '@/engage-types'

import { progressForCourse } from '../progress'
import {
  courseBySlug,
  courseEntitlement,
  curriculumFor,
  learnerContext,
  neighbours,
  readableLesson,
} from '../queries'
import { MarkCompleteButton } from './MarkCompleteButton'
import { CourseStyles } from './styles'

/**
 * One lesson.
 *
 * There is no "are you allowed?" branch in here on purpose. `readableLesson`
 * queries with the collection's access control in force, so a lesson the
 * visitor has not paid for comes back as nothing and the page 404s on a missing
 * document - the same response an invented URL gets. The content is never
 * loaded into this process at all, which is a stronger guarantee than
 * loading it and choosing not to draw it.
 */
export const LessonScreen: React.FC<{ courseSlug: string; lessonSlug: string }> = async ({
  courseSlug,
  lessonSlug,
}) => {
  const context = await learnerContext()
  if (!context.flags.lms) notFound()

  const course = await courseBySlug(context.engine, courseSlug)
  if (!course) notFound()

  const lesson = await readableLesson(context, course.id, lessonSlug)
  if (!lesson) notFound()

  const [curriculum, progress, entitlement] = await Promise.all([
    curriculumFor(context.engine, course.id),
    progressForCourse(context.engine, context.user, course.id),
    courseEntitlement(context, course),
  ])

  // Someone reading a free preview of a paid course walks between previews
  // only. Offering them the next locked lesson would send them to a 404 and
  // read as a broken site rather than as a paywall.
  const navigable = entitlement.granted ? curriculum : curriculum.filter((entry) => entry.isPreview)
  const { previous, next } = neighbours(navigable, lesson.id)
  const coursePath = `/courses/${course.slug}`
  const isDone = progress.completedLessonIds.includes(lesson.id)

  return (
    <article className="page-shell">
      <CourseStyles />
      <p className="curriculum__meta">
        <Link href={coursePath}>{course.title}</Link>
      </p>
      <div className="section-heading">
        <h1>{lesson.title}</h1>
      </div>

      {lesson.videoUrl && (
        <p className="lesson-video">
          <a href={lesson.videoUrl} target="_blank" rel="noreferrer">
            Watch the video
          </a>
        </p>
      )}

      {(lesson.content ?? []).map((block, index) => (
        <BlockRenderer key={(block as { id?: string }).id || index} block={block} index={index} />
      ))}

      {lesson.resources && lesson.resources.length > 0 && (
        <>
          <h2>Resources</h2>
          <ul className="lesson-resources">
            {lesson.resources.map((resource, index) => {
              const file = resource.file && typeof resource.file === 'object' ? (resource.file as Media) : null
              if (!file?.url) return null
              return (
                <li key={index}>
                  <a href={file.url} download>
                    {resource.label || file.filename}
                  </a>
                </li>
              )
            })}
          </ul>
        </>
      )}

      {context.user && <MarkCompleteButton lessonId={lesson.id} completed={isDone} coursePath={coursePath} />}

      <nav className="lesson-nav">
        {previous?.slug ? (
          <Link className="btn btn--ghost" href={`${coursePath}/${previous.slug}`}>
            ← {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next?.slug ? (
          <Link className="btn btn--ghost" href={`${coursePath}/${next.slug}`}>
            {next.title} →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </article>
  )
}
