'use server'

/**
 * What the lesson page's mark-complete button calls.
 *
 * A server action rather than an API route because the only caller is one
 * button on one page, and the action inherits the session cookie without any
 * of a route's hand-rolled auth. Everything it needs to decide - who is asking,
 * whether the feature is on, whether they may open this lesson - it works out
 * here; nothing is taken on trust from the form.
 */

import { revalidatePath } from 'next/cache'

import { markLessonComplete, type MarkOutcome } from './progress'
import { learnerContext } from './queries'

export async function setLessonCompleteAction(
  lessonId: number,
  completed: boolean,
  coursePath?: string,
): Promise<MarkOutcome> {
  const { engine, flags, user } = await learnerContext()
  const outcome = await markLessonComplete(engine, user, flags, lessonId, completed)

  // The tick changes the progress bar on the course page as well as this one.
  if (outcome.ok && coursePath) revalidatePath(coursePath)

  return outcome
}
