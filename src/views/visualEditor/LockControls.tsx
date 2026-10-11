'use client'

import React from 'react'

import type { LockEntry, LockMode } from '@/features/roles/locks'

import type { EffectiveLock } from './lockState'

export type LockUi = {
  /** What applies to the selected node for this person (null = not locked). */
  lock: EffectiveLock | null
  /** The node's own stored lock entry, if any. */
  entry?: LockEntry
  /** False for a top-level block that has not been saved yet (no stable id to lock). */
  hasKey: boolean
  /** May this person create/change/remove the node's own lock? */
  canEditLock: boolean
  textFields: { name: string; label: string }[]
  roleChoices: string[]
  onChangeLock: (entry: LockEntry | null) => void
}

/** Lock status plus, for permitted roles, the Lock/Unlock control. Everyone else just sees the lock. */
export const LockControls: React.FC<{ ui: LockUi }> = ({ ui }) => {
  const { lock, entry, canEditLock } = ui
  const mode: LockMode | 'none' = entry?.mode ?? 'none'
  const set = (next: Partial<LockEntry> & { mode: LockMode }) =>
    ui.onChangeLock({ unlockRoles: entry?.unlockRoles ?? [], editableProps: entry?.editableProps ?? [], ...entry, ...next })
  const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((x) => x !== value) : [...list, value])

  if (!lock && !canEditLock) return null
  return (
    <div className="ve-lock" data-testid="ve-lock">
      {lock && (
        <p className="ve-lock__status">
          <span aria-hidden="true">🔒</span>{' '}
          {lock.source === 'inherited' ? 'Inside a locked section. ' : lock.source === 'document' ? 'The whole document is locked. ' : ''}
          {lock.mode === 'full' ? 'Fully locked.' : 'Structure and styling locked; chosen text can be edited.'}{' '}
          {lock.blocked
            ? lock.unlockRoles.length > 0
              ? `Unlock roles: ${lock.unlockRoles.join(', ')} (and admins).`
              : 'Only admins can unlock.'
            : 'You may edit it.'}
        </p>
      )}
      {canEditLock && !ui.hasKey && <p className="ve-panel__hint">Save the page once before locking this block.</p>}
      {canEditLock && ui.hasKey && (
        <div className="ve-lock__form">
          <label>
            Lock{' '}
            <select value={mode} onChange={(e) => (e.target.value === 'none' ? ui.onChangeLock(null) : set({ mode: e.target.value as LockMode }))}>
              <option value="none">Unlocked</option>
              <option value="structure">Structure fixed, text editable</option>
              <option value="full">Fully locked</option>
            </select>
          </label>
          {entry && entry.mode === 'structure' && (
            <fieldset className="ve-lockset">
              <legend>Editable text</legend>
              {ui.textFields.map((f) => (
                <label key={f.name} className="ve-lock__check">
                  <input type="checkbox" checked={entry.editableProps.includes(f.name)} onChange={() => set({ mode: 'structure', editableProps: toggle(entry.editableProps, f.name) })} /> {f.label}
                </label>
              ))}
            </fieldset>
          )}
          {entry && (
            <fieldset className="ve-lockset">
              <legend>Roles that may unlock</legend>
              {ui.roleChoices.map((r) => (
                <label key={r} className="ve-lock__check">
                  <input type="checkbox" checked={entry.unlockRoles.includes(r)} onChange={() => set({ mode: entry.mode, unlockRoles: toggle(entry.unlockRoles, r) })} /> {r}
                </label>
              ))}
            </fieldset>
          )}
        </div>
      )}
    </div>
  )
}
