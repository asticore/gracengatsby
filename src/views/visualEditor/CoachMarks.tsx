'use client'

import React, { useState } from 'react'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import type { UiStringKey } from '@/features/uiStrings'

import './saveStatusChip.css'

const SEEN_KEY = 've-coach-marks-seen'

/** Three first-use tips, in the order a new editor user meets the panels. */
export const COACH_STEPS: { titleKey: UiStringKey; textKey: UiStringKey }[] = [
  {
    titleKey: 've.coach.elementsTitle',
    textKey: 've.coach.elementsText',
  },
  {
    titleKey: 've.coach.selectTitle',
    textKey: 've.coach.selectText',
  },
  {
    titleKey: 've.coach.settingsTitle',
    textKey: 've.coach.settingsText',
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
  const t = useAdminT()
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
    <div className="ve-coach" role="region" aria-label={t('ve.coach.region')}>
      <p className="ve-coach__count">
        {t('ve.coach.tip', { index: index + 1, total: COACH_STEPS.length })}
      </p>
      <p className="ve-coach__title">{t(step.titleKey)}</p>
      <p className="ve-coach__text">{t(step.textKey)}</p>
      <div className="ve-coach__actions">
        <button type="button" className="ve-btn ve-btn--ghost" onClick={close}>
          {t('ve.coach.skip')}
        </button>
        <button type="button" className="ve-btn ve-btn--ghost" onClick={close}>
          {t('ve.coach.dontShow')}
        </button>
        <button
          type="button"
          className="ve-btn ve-btn--primary"
          onClick={() => (last ? close() : setIndex((i) => i + 1))}
        >
          {last ? t('ve.coach.finish') : t('ve.coach.next')}
        </button>
      </div>
    </div>
  )
}

export default CoachMarks
