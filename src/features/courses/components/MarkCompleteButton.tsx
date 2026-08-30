'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

import { setLessonCompleteAction } from '../actions'
import type { MarkOutcome } from '../progress'

/**
 * The tick on a lesson page.
 *
 * Optimistic only as far as the button's own label: the authoritative answer
 * comes back from the action, and a refusal (a session that expired mid-lesson,
 * a membership that lapsed) puts the label back and says why. The router
 * refresh is what re-renders the progress bar from the server rather than
 * duplicating the percentage arithmetic in the browser.
 */
export const MarkCompleteButton: React.FC<{
  lessonId: number
  completed: boolean
  coursePath: string
}> = ({ lessonId, completed, coursePath }) => {
  const router = useRouter()
  const [isDone, setIsDone] = React.useState(completed)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, startTransition] = React.useTransition()

  const toggle = () => {
    const next = !isDone
    setError(null)
    setIsDone(next)
    startTransition(async () => {
      const outcome: MarkOutcome = await setLessonCompleteAction(lessonId, next, coursePath)
      if (outcome.ok === false) {
        setIsDone(!next)
        setError(outcome.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="lesson-complete">
      <button
        type="button"
        className={isDone ? 'btn btn--ghost' : 'btn btn--primary'}
        onClick={toggle}
        disabled={pending}
        aria-pressed={isDone}
      >
        {isDone ? 'Completed - undo' : 'Mark as complete'}
      </button>
      {error && <p className="lesson-complete__error">{error}</p>}
    </div>
  )
}
