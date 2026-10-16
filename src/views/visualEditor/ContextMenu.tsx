'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type ContextMenuItem = { id: string; label: string; hint?: string; disabled?: boolean; danger?: boolean }

/**
 * Right-click menu drawn in the parent document (the canvas is an iframe, so the frame only
 * reports where the click happened). Arrow keys move, Enter/Space choose, Escape closes;
 * a click anywhere outside, or focus leaving the window (a click inside the iframe), closes it.
 */
export const ContextMenu: React.FC<{
  x: number
  y: number
  items: ContextMenuItem[]
  onChoose: (id: string) => void
  onClose: () => void
}> = ({ x, y, items, onChoose, onClose }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })
  const [active, setActive] = useState(() => Math.max(0, items.findIndex((i) => !i.disabled)))

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    })
    el.focus()
  }, [x, y])

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  const step = (from: number, dir: 1 | -1): number => {
    for (let n = 1; n <= items.length; n += 1) {
      const i = (from + dir * n + items.length * n) % items.length
      if (!items[i].disabled) return i
    }
    return from
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') setActive((a) => step(a, 1))
    else if (event.key === 'ArrowUp') setActive((a) => step(a, -1))
    else if (event.key === 'Home') setActive(step(-1, 1))
    else if (event.key === 'End') setActive(step(items.length, -1))
    else if (event.key === 'Enter' || event.key === ' ') {
      const item = items[active]
      if (item && !item.disabled) onChoose(item.id)
    } else if (event.key === 'Escape' || event.key === 'Tab') onClose()
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <div
      ref={ref}
      className="ve-ctxmenu"
      role="menu"
      aria-label="Block actions"
      tabIndex={-1}
      aria-activedescendant={`ve-ctx-${items[active]?.id}`}
      style={{ left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          id={`ve-ctx-${item.id}`}
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={item.disabled}
          className={`ve-ctxmenu__item ${i === active ? 've-ctxmenu__item--active' : ''} ${item.danger ? 've-ctxmenu__item--danger' : ''}`}
          onMouseEnter={() => !item.disabled && setActive(i)}
          onClick={() => onChoose(item.id)}
        >
          <span>{item.label}</span>
          {item.hint && <span className="ve-ctxmenu__hint">{item.hint}</span>}
        </button>
      ))}
    </div>
  )
}

export default ContextMenu
