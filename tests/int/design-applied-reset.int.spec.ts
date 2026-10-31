// @vitest-environment jsdom
// Style panel: a set value shows the applied dot and a per-setting Reset that clears only that setting.
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlockStyle } from '@/lib/blockStyle'
import { DesignPanel } from '@/views/visualEditor/DesignPanel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(value: BlockStyle, onChange: (next: BlockStyle) => void) {
  act(() => {
    root.render(React.createElement(DesignPanel, { value, onChange, device: 'desktop' }))
  })
}

/** Opens every accordion (closed sections render no rows), including nested ones. */
function openAll() {
  for (let guard = 0; guard < 10; guard++) {
    const closed = Array.from(host.querySelectorAll<HTMLButtonElement>('.ve-acc__head')).filter(
      (head) => !head.parentElement?.classList.contains('ve-acc--open'),
    )
    if (closed.length === 0) return
    for (const head of closed) act(() => head.click())
  }
}

/** The setting row (a label element) whose visible label text starts with `name`. */
function rowFor(name: string, pick: (row: HTMLLabelElement) => boolean = () => true): HTMLLabelElement {
  openAll()
  const rows = Array.from(host.querySelectorAll<HTMLLabelElement>('label.ve-row'))
  const row = rows.find((r) => (r.querySelector('.ve-row__label')?.textContent ?? '').trim().startsWith(name) && pick(r))
  if (!row) throw new Error(`no row for ${name}`)
  return row
}

describe('style panel applied dot and per-setting reset', () => {
  it('shows the applied dot and a Reset only on rows whose setting is set', () => {
    render({ borderWidth: 2, boxShadow: 'md' } as BlockStyle, () => {})
    expect(rowFor('Border width').querySelector('.ve-d51-dot')).not.toBeNull()
    expect(rowFor('Shadow', (r) => r.querySelector('option')?.textContent === 'None').querySelector('.ve-d51-dot')).not.toBeNull()
    expect(rowFor('Corner radius').querySelector('.ve-d51-dot')).toBeNull()
    expect(rowFor('Corner radius').querySelector('button.ve-dev__reset')).toBeNull()
  })

  it('Reset on a set row clears only that setting', () => {
    const onChange = vi.fn()
    render({ borderWidth: 2, boxShadow: 'md' } as BlockStyle, onChange)
    const reset = rowFor('Border width').querySelector<HTMLButtonElement>('button.ve-dev__reset')
    expect(reset).not.toBeNull()
    act(() => {
      reset!.click()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as Record<string, unknown>
    expect(next.borderWidth).toBeUndefined()
    expect(next.boxShadow).toBe('md')
  })

  it('a colour row shows the dot when set and Reset clears it', () => {
    const onChange = vi.fn()
    render({ bgType: 'color', bgColor: '#112233' } as BlockStyle, onChange)
    const row = rowFor('Colour')
    expect(row.querySelector('.ve-d51-dot')).not.toBeNull()
    const reset = row.querySelector<HTMLButtonElement>('button.ve-dev__reset')
    act(() => {
      reset!.click()
    })
    const next = onChange.mock.calls[0][0] as Record<string, unknown>
    expect(next.bgColor).toBeUndefined()
    expect(next.bgType).toBe('color')
  })

  it('an unset colour row shows no dot', () => {
    render({ bgType: 'color' } as BlockStyle, () => {})
    expect(rowFor('Colour').querySelector('.ve-d51-dot')).toBeNull()
  })
})
