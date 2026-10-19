'use client'

import React, { useState } from 'react'

import './saveStatusChip.css'

const SEEN_KEY = 've-coach-marks-seen'

/** Three first-use tips, in the order a new editor user meets the panels. */
export const COACH_STEPS: { title: string; text: string }[] = [
  {
    title: 'Elements tab',
    text: 'Open the Elements tab to browse blocks and elements. Click one to add it to the page.',
  },
  {
    title: 'Select on the canvas',
    text: 'Click any block in the preview to select it. Its settings open in the Settings tab.',
  },
  {
    title: 'Settings tab',
    text: 'Use the Settings tab to change the selected block content, style and layout.',
  },
]

/** True once the tips were dismissed or finished in this browser. Storage errors count as not seen. */
export function coachMarksSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === '1'
  } catch {
    return false
  }
}

function markCoachMarksSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, '1')
  } catch {
    // Storage is blocked or full: the tips simply show again next time.
  }
}

/**
 * Non-modal first-use tips. No backdrop and no focus trap, so editing is never blocked.
 * Skip, Don't show again and finishing the last step all remember the choice for this browser.
 */
export const CoachMarks: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [index, setIndex] = useState(0)

  if (!open) return null

  const step = COACH_STEPS[index]
  const last = index === COACH_STEPS.length - 1
  // Resetting the step here (not in an effect) means every opening starts at tip 1.
  const close = () => {
    setIndex(0)
    markCoachMarksSeen()
    onClose()
  }

  return (
    <div className="ve-coach" role="region" aria-label="Editor tips">
      <p className="ve-coach__count">
        Tip {index + 1} of {COACH_STEPS.length}
      </p>
      <p className="ve-coach__title">{step.title}</p>
      <p className="ve-coach__text">{step.text}</p>
      <div className="ve-coach__actions">
        <button type="button" className="ve-btn ve-btn--ghost" onClick={close}>
          Skip
        </button>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={close}>
          Don&apos;t show again
        </button>
        <button
          type="button"
          className="ve-btn ve-btn--primary"
          onClick={() => (last ? close() : setIndex((i) => i + 1))}
        >
          {last ? 'Finish' : 'Next'}
        </button>
      </div>
    </div>
  )
}

export default CoachMarks
