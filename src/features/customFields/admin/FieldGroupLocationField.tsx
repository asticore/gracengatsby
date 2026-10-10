'use client'

import React from 'react'
import { useField } from '@/engine/ui'

import { LOCATION_PARAMS, type LocationGroups, type LocationParam, type LocationRule } from '@/fields/customFields/types'

import { rawLocationGroups } from '../normalize'

/**
 * "Show on" editor for a Field Group. OR of AND-rules, same as the stored
 * `location` JSON. An empty list falls back to the quick "Applies to" list.
 */

const PARAM_LABELS: Record<LocationParam, string> = {
  collection: 'Collection',
  optionsPage: 'Options page',
  pageTemplate: 'Page template ID (or "none")',
  pageParent: 'Parent page ID (or "none")',
  postCategory: 'Post category name',
  postTag: 'Post tag',
  userRole: 'Editor role',
  status: 'Status',
}

const COLLECTIONS = ['pages', 'posts', 'products', 'events', 'faqs']
const ROLES = ['admin', 'editor', 'viewer']
const STATUSES = ['draft', 'published']

const inputClass =
  'rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-[var(--theme-input-bg,#fff)] px-[8px] py-[6px] text-[13px] text-inherit [font-family:inherit]'
const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192]'

function ValueInput({ rule, onChange }: { rule: LocationRule; onChange: (value: string) => void }) {
  if (rule.param === 'collection') {
    return (
      <select className={inputClass} aria-label="Value" value={rule.value} onChange={(e) => onChange(e.target.value)}>
        {COLLECTIONS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    )
  }
  if (rule.param === 'userRole') {
    return (
      <select className={inputClass} aria-label="Value" value={rule.value} onChange={(e) => onChange(e.target.value)}>
        {ROLES.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>
    )
  }
  if (rule.param === 'status') {
    return (
      <select className={inputClass} aria-label="Value" value={rule.value} onChange={(e) => onChange(e.target.value)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    )
  }
  return <input className={inputClass} aria-label="Value" value={rule.value} onChange={(e) => onChange(e.target.value)} />
}

export const FieldGroupLocationField: React.FC<{ path?: string }> = ({ path = 'location' }) => {
  const { value, setValue } = useField<unknown>({ path })
  // Raw, so a rule being filled in is not dropped while it is still blank.
  const groups: LocationGroups = rawLocationGroups(value)
  const update = (next: LocationGroups) => setValue(next)
  const blank = (): LocationRule => ({ param: 'collection', operator: 'equals', value: 'pages' })

  return (
    <div className="mb-[24px] flex flex-col gap-[8px]">
      <h3 className="m-0 text-[15px]">Show on</h3>
      <p className="m-0 text-[12px] opacity-70">
        Rows in one block must all match (AND). Blocks are alternatives (OR). Leave empty to use the quick &quot;Applies to&quot; list instead.
      </p>
      {groups.map((rules, gi) => (
        <div key={gi} className="flex flex-col gap-[6px] rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] p-[10px]">
          {gi > 0 && <span className="text-[11px] font-semibold uppercase opacity-60">or</span>}
          {rules.map((rule, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-[6px]">
              {ri > 0 && <span className="text-[11px] uppercase opacity-60">and</span>}
              <select
                className={inputClass}
                aria-label="Rule"
                value={rule.param}
                onChange={(e) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, param: e.target.value as LocationParam, value: '' } : r)) : g)))}
              >
                {LOCATION_PARAMS.map((p) => (
                  <option key={p} value={p}>
                    {PARAM_LABELS[p]}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                aria-label="Operator"
                value={rule.operator}
                onChange={(e) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, operator: e.target.value as 'equals' | 'notEquals' } : r)) : g)))}
              >
                <option value="equals">is</option>
                <option value="notEquals">is not</option>
              </select>
              <ValueInput
                rule={rule}
                onChange={(v) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, value: v } : r)) : g)))}
              />
              <button type="button" className={buttonClass} onClick={() => update(groups.map((g, i) => (i === gi ? g.filter((_, j) => j !== ri) : g)).filter((g) => g.length))}>
                ✕
              </button>
            </div>
          ))}
          <div>
            <button type="button" className={buttonClass} onClick={() => update(groups.map((g, i) => (i === gi ? [...g, blank()] : g)))}>
              + and
            </button>
          </div>
        </div>
      ))}
      <div>
        <button type="button" className={buttonClass} onClick={() => update([...groups, [blank()]])}>
          + or
        </button>
      </div>
    </div>
  )
}

export default FieldGroupLocationField
