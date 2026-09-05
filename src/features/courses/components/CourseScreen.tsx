import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import type { Media } from '@/engage-types'

import { progressForCourse } from '../progress'
import { courseBySlug, courseEntitlement, curriculumFor, learnerContext, type CourseDoc } from '../queries'
import type { Entitlement } from '../types'
import { CourseStyles } from './styles'

/**
 * What to say to someone who cannot open the lessons yet.
 *
 * One branch per reason rather than a single "you need access" - the whole
 * point of carrying the reason out of `entitlementFor` is that the next step
 * differs: buy it, sign in, upgrade, or (when Members is switched off) nothing
 * the visitor can do at all, which is the site owner's problem to fix and
 * should read as such rather than as a broken button.
 */
const Gate: React.FC<{ entitlement: Entitlement; course: CourseDoc }> = ({ entitlement, course }) => {
  const product = course.product && typeof course.product === 'object' ? (course.product as { slug?: string }) : null

  switch (entitlement.reason) {
    case 'anonymous':
      return (
        <div className="course-gate">
          <h2>Sign in to continue</h2>
          <p>This course is not open to the public. Sign in with the account you enrolled with.</p>
          <Link className="btn btn--primary" href="/admin">
            Sign in
          </Link>
        </div>
      )
    case 'payment-required':
      return (
        <div className="course-gate">
          <h2>Buy this course</h2>
          <p>Lessons unlock as soon as your order is paid.</p>
          {product?.slug ? (
            <Link className="btn btn--primary" href={`/shop/${product.slug}`}>
              View in the shop
            </Link>
          ) : (
            <p className="empty-state">This course has no product attached yet.</p>
          )}
        </div>
      )
    case 'tier-required':
      return (
        <div className="course-gate">
          <h2>Included with membership</h2>
          <p>This course comes with the {course.tierSlug} membership. Upgrade to unlock every lesson.</p>
        </div>
      )
    case 'tier-unavailable':
      return (
        <div className="course-gate">
          <h2>Not available</h2>
          <p>This course is reserved for members, and memberships are not switched on for this site.</p>
        </div>
      )
    default:
      return null
  }
}

const ProgressBar: React.FC<{ percent: number; completed: number; total: number }> = ({
  percent,
  completed,
  total,
}) => (
  <div className="course-progress">
    <div className="course-progress__track">
      <div className="course-progress__fill" style={{ width: `${percent}%` }} />
    </div>
    <p className="course-progress__label">
      {completed} of {total} lessons complete - {percent}%
    </p>
  </div>
)

export const CourseScreen: React.FC<{ slug: string }> = async ({ slug }) => {
  const context = await learnerContext()
  if (!context.flags.lms) notFound()

  const course = await courseBySlug(context.engine, slug)
  if (!course) notFound()

  const [entitlement, curriculum] = await Promise.all([
    courseEntitlement(context, course),
    curriculumFor(context.engine, course.id),
  ])
  const progress = await progressForCourse(context.engine, context.user, course.id)

  const cover = course.coverImage && typeof course.coverImage === 'object' ? (course.coverImage as Media) : null

  return (
    <article className="page-shell">
      <CourseStyles />
      <div className="section-heading">
        <h1>{course.title}</h1>
      </div>
      {course.description && <p>{course.description}</p>}

      {cover?.url && (
        <div className="relative mb-12 aspect-[16/6] w-full bg-[var(--color-cream-dim)]">
          <Image
            src={cover.url}
            alt={course.title}
            width={1200}
            height={630}
            style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
          />
        </div>
      )}

      {entitlement.granted && context.user && progress.totalLessons > 0 && (
        <ProgressBar percent={progress.percent} completed={progress.completedLessons} total={progress.totalLessons} />
      )}

      <Gate entitlement={entitlement} course={course} />

      <h2>Curriculum</h2>
      {curriculum.length === 0 ? (
        <p className="empty-state">No lessons in this course yet.</p>
      ) : (
        <ol className="curriculum">
          {curriculum.map((entry, index) => {
            const open = entitlement.granted || entry.isPreview
            const done = progress.completedLessonIds.includes(entry.id)
            const body = (
              <>
                <span className="curriculum__index">{index + 1}</span>
                <span className="curriculum__title">
                  {entry.title}
                  {!entitlement.granted && entry.isPreview ? ' - free preview' : ''}
                </span>
                <span className="curriculum__meta">
                  {done && <span className="curriculum__tick">✓ </span>}
                  {entry.durationMinutes ? `${entry.durationMinutes} min` : open ? '' : 'Locked'}
                </span>
              </>
            )

            return (
              <li key={entry.id} className="curriculum__item">
                {open && entry.slug ? (
                  <Link className="curriculum__link" href={`/courses/${course.slug}/${entry.slug}`}>
                    {body}
                  </Link>
                ) : (
                  <span className="curriculum__locked">{body}</span>
                )}
              </li>
            )
          })}
        </ol>
      )}
    </article>
  )
}
