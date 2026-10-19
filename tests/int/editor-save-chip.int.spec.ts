import { afterEach, describe, expect, it, vi } from 'vitest'

import { chipText } from '@/views/visualEditor/SaveStatusChip'
import { COACH_STEPS, coachMarksSeen } from '@/views/visualEditor/CoachMarks'
import { resolveShortcut, SHORTCUT_LIST } from '@/views/visualEditor/useEditorShortcuts'

const MIN = 60_000
const T0 = 1_700_000_000_000

describe('chipText', () => {
  it('shows nothing before any save or edit', () => {
    expect(chipText('idle', false, null, T0)).toBeNull()
  })

  it('reports unsaved edits when dirty', () => {
    expect(chipText('idle', true, null, T0)).toBe('Unsaved changes')
    expect(chipText('saved', true, T0, T0)).toBe('Unsaved changes')
  })

  it('reports in-flight saves and publishes', () => {
    expect(chipText('saving', true, null, T0)).toBe('Saving...')
    expect(chipText('publishing', false, T0, T0)).toBe('Publishing...')
  })

  it('reports a failed save with a retry prompt, ahead of dirty state', () => {
    expect(chipText('error', true, T0, T0)).toBe('Save failed - retry')
  })

  it('reports how long ago the last save finished', () => {
    expect(chipText('saved', false, T0, T0)).toBe('Saved just now')
    expect(chipText('saved', false, T0, T0 + 59_000)).toBe('Saved just now')
    expect(chipText('saved', false, T0, T0 + 2 * MIN)).toBe('Saved 2 min ago')
    expect(chipText('published', false, T0, T0 + 17 * MIN + 30_000)).toBe('Saved 17 min ago')
  })

  it('never shows a negative age when the clock has not caught up yet', () => {
    expect(chipText('saved', false, T0, T0 - 5_000)).toBe('Saved just now')
  })
})

describe('help shortcut', () => {
  it('maps "?" to help, with or without Shift held', () => {
    expect(resolveShortcut({ key: '?', ctrl: false, meta: false, shift: true, alt: false })).toBe('help')
    expect(resolveShortcut({ key: '?', ctrl: false, meta: false, shift: false, alt: false })).toBe('help')
  })

  it('leaves Ctrl+? and Alt+? to other handling', () => {
    expect(resolveShortcut({ key: '?', ctrl: true, meta: false, shift: true, alt: false })).toBeNull()
    expect(resolveShortcut({ key: '?', ctrl: false, meta: false, shift: true, alt: true })).toBeNull()
  })

  it('lists the help key in the shortcuts panel', () => {
    expect(SHORTCUT_LIST.some((item) => item.keys === '?')).toBe(true)
  })
})

describe('coach marks', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has three first-use steps', () => {
    expect(COACH_STEPS).toHaveLength(3)
  })

  it('treats blocked storage as not seen instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => coachMarksSeen()).not.toThrow()
    expect(coachMarksSeen()).toBe(false)
  })

  it('reads the seen flag from localStorage', () => {
    window.localStorage.setItem('ve-coach-marks-seen', '1')
    expect(coachMarksSeen()).toBe(true)
    window.localStorage.removeItem('ve-coach-marks-seen')
    expect(coachMarksSeen()).toBe(false)
  })
})
