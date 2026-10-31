'use client'

import { useAdminT } from '@/admin/i18n/AdminUiProvider'
import React, { useEffect, useState } from 'react'
import { useField } from '@/engine/ui'

import { TEMPLATE_AUDIENCES, type LocationGroups, type LocationParam, type LocationRule } from '@/fields/customFields/types'

import { CONDITION_KINDS, fromStoredConditions, summariseConditions, toStoredConditions, validateConditions, type PageTitles } from '../conditionsSummary'

/** The pages a `page` rule can pick from. Read once when the editor opens; a failure leaves the picker empty with a note. */
type PageOption = { id: string; title: string }
const usePageOptions = (): { pages: PageOption[]; state: 'loading' | 'ready' | 'failed' } => {
  const [result, setResult] = useState<{ pages: PageOption[]; state: 'loading' | 'ready' | 'failed' }>({ pages: [], state: 'loading' })
  useEffect(() => {
    let alive = true
    fetch('/api/pages?limit=1000&depth=0', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { docs?: Array<{ id: number | string; title?: string | null; slug?: string | null }> }) => {
        if (!alive) return
        const pages = (body.docs ?? []).map((doc) => ({ id: String(doc.id), title: doc.title || doc.slug || String(doc.id) }))
        setResult({ pages, state: 'ready' })
      })
      .catch(() => {
        if (alive) setResult({ pages: [], state: 'failed' })
      })
    return () => {
      alive = false
    }
  }, [])
  return result
}

const inputClass =
  'rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-[var(--theme-input-bg,#fff)] px-[8px] py-[6px] text-[13px] text-inherit [font-family:inherit]'
const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192]'

const blank = (): LocationRule => ({ param: 'templateKind', operator: 'equals', value: '' })

/** Page ids of a `page` rule (a comma separated list, as stored). */
const pageIdsOf = (value: string): string[] => value.split(',').map((id) => id.trim()).filter((id) => id !== '')

/** Multi-select of pages. Stores the picked ids as one comma separated value, so one row holds several pages. */
const PagePicker: React.FC<{ value: string; pages: PageOption[]; state: 'loading' | 'ready' | 'failed'; onChange: (value: string) => void }> = ({ value, pages, state, onChange }) => {
  const t = useAdminT()
  const selected = pageIdsOf(value)
  // A page that was deleted (or is not published) still shows, so the rule can be fixed.
  const known = new Set(pages.map((page) => page.id))
  const options = [...pages, ...selected.filter((id) => !known.has(id)).map((id) => ({ id, title: `Page ${id}` }))]
  if (state === 'loading') return <span className="text-[12px] opacity-70">{t('siteTemplates.pagesLoading')}</span>
  if (state === 'failed') return <span className="text-[12px] text-red-700">{t('siteTemplates.pagesFailed')}</span>
  if (options.length === 0) return <span className="text-[12px] opacity-70">{t('siteTemplates.pagesNone')}</span>
  return (
    <select
      className={`${inputClass} min-w-[220px]`}
      multiple
      size={Math.min(6, Math.max(3, options.length))}
      aria-label={t('siteTemplates.pagesLabel')}
      title={t('siteTemplates.pagesHint')}
      value={selected}
      onChange={(e) => onChange(Array.from(e.target.selectedOptions, (option) => option.value).join(','))}
    >
      {options.map((page) => (
        <option key={page.id} value={page.id}>
          {page.title}
        </option>
      ))}
    </select>
  )
}

/** Friendly editor for a site template's `conditions` JSON (OR of AND-rules). Falls back to raw JSON when the stored shape is unknown. */
export const ConditionsField: React.FC<{ path?: string }> = ({ path = 'conditions' }) => {
  const t = useAdminT()
  const { value, setValue } = useField<unknown>({ path })
  const [raw, setRaw] = useState<string | null>(null)
  const understood = fromStoredConditions(value)
  const pageOptions = usePageOptions()
  // Rows being typed stay in local state so blank rows are not dropped; only complete rows are written.
  const [draft, setDraft] = useState<LocationGroups | null>(null)
  const groups: LocationGroups = draft ?? understood ?? []
  const update = (next: LocationGroups) => {
    setDraft(next)
    setValue(toStoredConditions(next))
  }
  const patch = (gi: number, ri: number, p: Partial<LocationRule>) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, ...p } : r)) : g)))
  const pageTitles: PageTitles = Object.fromEntries(pageOptions.pages.map((page) => [page.id, page.title]))

  if (understood === null) {
    const text = raw ?? (typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2))
    return (
      <div className="mb-[24px] flex flex-col gap-[6px]">
        <h3 className="m-0 text-[15px]">Where it applies</h3>
        <p className="m-0 text-[12px] text-red-700">{validateConditions(value)} Edit the JSON below.</p>
        <textarea
          className={`${inputClass} min-h-[120px] font-mono`}
          aria-label={t('aria.conditionsJson')}
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
        {summariseConditions(toStoredConditions(groups), pageTitles)}
      </p>
      <p className="m-0 text-[12px] opacity-70">Rows in one block must all match (AND). Blocks are alternatives (OR). No blocks means everywhere for this template type.</p>
      {groups.map((rules, gi) => (
        <div key={gi} className="flex flex-col gap-[6px] rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] p-[10px]">
          {gi > 0 && <span className="text-[11px] font-semibold uppercase opacity-60">or</span>}
          {rules.map((rule, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-[6px]">
              {ri > 0 && <span className="text-[11px] uppercase opacity-60">and</span>}
              <select className={inputClass} aria-label={t('al.operator')} value={rule.operator} onChange={(e) => patch(gi, ri, { operator: e.target.value as LocationRule['operator'] })}>
                <option value="equals">Include</option>
                <option value="notEquals">Exclude</option>
              </select>
              <select className={inputClass} aria-label={t('al.condition')} value={rule.param} onChange={(e) => patch(gi, ri, { param: e.target.value as LocationParam, value: '' })}>
                {CONDITION_KINDS.map((k) => (
                  <option key={k.param} value={k.param}>
                    {k.label}
                  </option>
                ))}
              </select>
              {rule.param === 'audience' ? (
                <select className={inputClass} aria-label={t('siteTemplates.audienceLabel')} value={rule.value} onChange={(e) => patch(gi, ri, { value: e.target.value })}>
                  <option value="">{t('siteTemplates.audienceLabel')}</option>
                  {TEMPLATE_AUDIENCES.map((audience) => (
                    <option key={audience} value={audience}>
                      {audience === 'members' ? t('siteTemplates.audienceMembers') : audience === 'guests' ? t('siteTemplates.audienceGuests') : t('siteTemplates.audienceEveryone')}
                    </option>
                  ))}
                </select>
              ) : rule.param === 'page' ? (
                <PagePicker value={rule.value} pages={pageOptions.pages} state={pageOptions.state} onChange={(value) => patch(gi, ri, { value })} />
              ) : (
                <input
                  className={inputClass}
                  aria-label={t('al.value')}
                  maxLength={200}
                  placeholder={CONDITION_KINDS.find((k) => k.param === rule.param)?.hint}
                  value={rule.value}
                  onChange={(e) => patch(gi, ri, { value: e.target.value })}
                />
              )}
              <button type="button" className={buttonClass} aria-label={t('al.removeRule')} onClick={() => update(groups.map((g, i) => (i === gi ? g.filter((_, j) => j !== ri) : g)).filter((g) => g.length))}>
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
