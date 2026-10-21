'use client'

import React, { useState } from 'react'
import { useField } from '@/engine/ui'

import type { LocationGroups, LocationParam, LocationRule } from '@/fields/customFields/types'

import { CONDITION_KINDS, fromStoredConditions, summariseConditions, toStoredConditions, validateConditions } from '../conditionsSummary'

const inputClass =
  'rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-[var(--theme-input-bg,#fff)] px-[8px] py-[6px] text-[13px] text-inherit [font-family:inherit]'
const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192]'

const blank = (): LocationRule => ({ param: 'templateKind', operator: 'equals', value: '' })

/** Friendly editor for a site template's `conditions` JSON (OR of AND-rules). Falls back to raw JSON when the stored shape is unknown. */
export const ConditionsField: React.FC<{ path?: string }> = ({ path = 'conditions' }) => {
  const { value, setValue } = useField<unknown>({ path })
  const [raw, setRaw] = useState<string | null>(null)
  const understood = fromStoredConditions(value)
  // Rows being typed stay in local state so blank rows are not dropped; only complete rows are written.
  const [draft, setDraft] = useState<LocationGroups | null>(null)
  const groups: LocationGroups = draft ?? understood ?? []
  const update = (next: LocationGroups) => {
    setDraft(next)
    setValue(toStoredConditions(next))
  }
  const patch = (gi: number, ri: number, p: Partial<LocationRule>) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, ...p } : r)) : g)))

  if (understood === null) {
    const text = raw ?? (typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2))
    return (
      <div className="mb-[24px] flex flex-col gap-[6px]">
        <h3 className="m-0 text-[15px]">Where it applies</h3>
        <p className="m-0 text-[12px] text-red-700">{validateConditions(value)} Edit the JSON below.</p>
        <textarea
          className={`${inputClass} min-h-[120px] font-mono`}
          aria-label="Conditions JSON"
          value={text}
          onChange={(e) => {
            setRaw(e.target.value)
            try {
              setValue(JSON.parse(e.target.value))
            } catch {
              setValue(e.target.value)
            }
          }}
        />
      </div>
    )
  }

  return (
    <div className="mb-[24px] flex flex-col gap-[8px]">
      <h3 className="m-0 text-[15px]">Where it applies</h3>
      <p className="m-0 rounded-[5px] bg-[var(--theme-elevation-50,#f4f2ec)] p-[8px] text-[13px]" data-testid="conditions-summary">
        {summariseConditions(toStoredConditions(groups))}
      </p>
      <p className="m-0 text-[12px] opacity-70">Rows in one block must all match (AND). Blocks are alternatives (OR). No blocks means everywhere for this template type.</p>
      {groups.map((rules, gi) => (
        <div key={gi} className="flex flex-col gap-[6px] rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] p-[10px]">
          {gi > 0 && <span className="text-[11px] font-semibold uppercase opacity-60">or</span>}
          {rules.map((rule, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-[6px]">
              {ri > 0 && <span className="text-[11px] uppercase opacity-60">and</span>}
              <select className={inputClass} aria-label="Operator" value={rule.operator} onChange={(e) => patch(gi, ri, { operator: e.target.value as LocationRule['operator'] })}>
                <option value="equals">Include</option>
                <option value="notEquals">Exclude</option>
              </select>
              <select className={inputClass} aria-label="Condition" value={rule.param} onChange={(e) => patch(gi, ri, { param: e.target.value as LocationParam, value: '' })}>
                {CONDITION_KINDS.map((k) => (
                  <option key={k.param} value={k.param}>
                    {k.label}
                  </option>
                ))}
              </select>
              <input
                className={inputClass}
                aria-label="Value"
                maxLength={200}
                placeholder={CONDITION_KINDS.find((k) => k.param === rule.param)?.hint}
                value={rule.value}
                onChange={(e) => patch(gi, ri, { value: e.target.value })}
              />
              <button type="button" className={buttonClass} aria-label="Remove rule" onClick={() => update(groups.map((g, i) => (i === gi ? g.filter((_, j) => j !== ri) : g)).filter((g) => g.length))}>
                {String.fromCharCode(0x2715)}
              </button>
            </div>
          ))}
          <div>
            <button type="button" className={buttonClass} disabled={rules.length >= 10} onClick={() => update(groups.map((g, i) => (i === gi ? [...g, blank()] : g)))}>
              + and
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className={buttonClass} disabled={groups.length >= 10} onClick={() => update([...groups, [blank()]])}>
          + or
        </button>
      </div>
    </div>
  )
}

export default ConditionsField
