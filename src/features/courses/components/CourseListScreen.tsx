import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'

import type { Media } from '@/engage-types'

import { learnerContext, publishedCourses } from '../queries'
import { CourseStyles } from './styles'

const ACCESS_LABEL: Record<string, string> = {
  free: 'Free',
  purchase: 'Paid course',
  tier: 'Members only',
}

/** The /courses index. Every published course, gated or not - the gate is on the lessons. */
export const CourseListScreen: React.FC = async () => {
  const { engine, flags } = await learnerContext()
  if (!flags.lms) notFound()

  const courses = await publishedCourses(engine)

  return (
    <div className="page-shell">
      <CourseStyles />
      <div className="section-heading">
        <h1>Courses</h1>
      </div>

      {courses.length === 0 ? (
        <p className="empty-state">No courses published yet.</p>
      ) : (
        <div className="product-grid">
          {courses.map((course) => {
            const cover = course.coverImage && typeof course.coverImage === 'object' ? (course.coverImage as Media) : null
            return (
              <Link key={course.id} href={`/courses/${course.slug}`} className="product-card">
                {cover?.url ? (
                  <div className="product-card__image">
                    <Image
                      src={cover.url}
                      alt={course.title}
                      width={640}
                      height={420}
                      style={{ width: '100%', height: 'auto', objectFit: 'cover' }}
                    />
                  </div>
                ) : (
                  <div className="product-card__placeholder" />
                )}
                <div className="product-card__body">
                  <span className="product-card__category">{ACCESS_LABEL[course.accessType ?? 'free']}</span>
                  <h2>{course.title}</h2>
                  {course.description && <p>{course.description}</p>}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
