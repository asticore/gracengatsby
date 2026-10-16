'use client'

import { useCallback, useEffect } from 'react'

export type KeyInfo = { key: string; ctrl: boolean; meta: boolean; shift: boolean; alt: boolean }

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete'
  | 'clear'
  | 'moveUp'
  | 'moveDown'

/** Which actions need a selected node (the rest work with nothing selected). */
const NEEDS_SELECTION: ReadonlySet<ShortcutAction> = new Set(['copy', 'cut', 'duplicate', 'delete', 'clear', 'moveUp', 'moveDown'])

/** Maps a key press to an editor action, or null. Pure. */
export function resolveShortcut(k: KeyInfo): ShortcutAction | null {
  const mod = k.ctrl || k.meta
  const key = k.key.length === 1 ? k.key.toLowerCase() : k.key
  if (mod && !k.alt) {
    if (key === 'z') return k.shift ? 'redo' : 'undo'
    if (key === 'y' && !k.shift) return 'redo'
    if (k.shift) return null
    if (key === 'c') return 'copy'
    if (key === 'x') return 'cut'
    if (key === 'v') return 'paste'
    if (key === 'd') return 'duplicate'
    return null
  }
  if (mod || k.shift) return null
  if (k.alt) {
    if (key === 'ArrowUp') return 'moveUp'
    if (key === 'ArrowDown') return 'moveDown'
    return null
  }
  if (key === 'Delete' || key === 'Backspace') return 'delete'
  if (key === 'Escape') return 'clear'
  return null
}

/** True when typing should win over editor shortcuts (inputs, selects, contenteditable). */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el || typeof el !== 'object' || !('tagName' in el)) return false
  const tag = String(el.tagName).toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return Boolean(el.isContentEditable) || (typeof el.closest === 'function' && Boolean(el.closest('[contenteditable=""],[contenteditable="true"]')))
}

/** Shortcut reference shown in the top bar. `mod` is Ctrl or Cmd. */
export const SHORTCUT_LIST: { keys: string; label: string }[] = [
  { keys: 'Mod+Z', label: 'Undo' },
  { keys: 'Mod+Shift+Z or Mod+Y', label: 'Redo' },
  { keys: 'Mod+C', label: 'Copy the selected block' },
  { keys: 'Mod+X', label: 'Cut the selected block' },
  { keys: 'Mod+V', label: 'Paste after the selected block (or into a selected column)' },
  { keys: 'Mod+D', label: 'Duplicate the selected block' },
  { keys: 'Delete or Backspace', label: 'Delete the selected block (undo brings it back)' },
  { keys: 'Escape', label: 'Clear the selection' },
  { keys: 'Alt+Up / Alt+Down', label: 'Move the selected block up or down in its list' },
  { keys: 'Right-click a block', label: 'Open the block menu' },
]

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>

/**
 * One handler for both the parent document's own key presses and the ones the canvas iframe
 * forwards. Returns `handleKey` for the forwarded messages. Pass `enabled: false` while a dialog is open.
 */
export function useEditorShortcuts(options: { enabled: boolean; hasSelection: boolean; handlers: ShortcutHandlers }): {
  handleKey: (k: KeyInfo, event?: KeyboardEvent) => boolean
} {
  const { enabled, hasSelection, handlers } = options

  const handleKey = useCallback((k: KeyInfo, event?: KeyboardEvent): boolean => {
    if (!enabled) return false
    if (event && isEditableTarget(event.target)) return false
    const action = resolveShortcut(k)
    if (!action) return false
    const run = handlers[action]
    if (!run) return false
    if (NEEDS_SELECTION.has(action) && !hasSelection) return false
    // Leave a real text selection in the page chrome (e.g. the field panel) to the browser.
    if ((action === 'copy' || action === 'cut') && event && typeof window !== 'undefined' && String(window.getSelection?.() ?? '').length > 0) return false
    event?.preventDefault()
    run()
    return true
  }, [enabled, hasSelection, handlers])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      handleKey({ key: event.key, ctrl: event.ctrlKey, meta: event.metaKey, shift: event.shiftKey, alt: event.altKey }, event)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleKey])

  return { handleKey }
}
