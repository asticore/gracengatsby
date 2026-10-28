'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useField } from '@/engine/ui'

import { localeLabel } from '../locales'
import { parseTranslationRules, type TranslationRule, type TranslationRules } from '../translationStatus'

/**
 * Settings > Languages: who translates and who reviews, per language.
 *
 * Stored as one JSON text value on the Languages global, so the setting travels
 * with the rest of the site's settings (export, import, backups) without a
 * table of its own. The people are picked from the users collection, so the
 * stored ids always name real accounts.
 */

type UserOption = { id: number; label: string }

const fieldClass = 'flex flex-col gap-[6px]'
const listClass = 'flex flex-col gap-[4px] rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] p-[8px] max-h-[180px] overflow-auto'

function PeoplePicker({
  legend,
  options,
  selected,
  onChange,
}: {
  legend: string
  options: UserOption[]
  selected: number[]
  onChange: (ids: number[]) => void
}) {
  return (
    <fieldset className={fieldClass} style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="text-[12px] font-semibold">{legend}</legend>
      <div className={listClass}>
        {options.length === 0 ? <span className="text-[12px] opacity-70">No users found.</span> : null}
        {options.map((user) => (
          <label key={user.id} className="flex items-center gap-[6px] text-[13px]">
            <input
              type="checkbox"
              checked={selected.includes(user.id)}
              onChange={(event) =>
                onChange(event.target.checked ? [...selected, user.id] : selected.filter((id) => id !== user.id))
              }
            />
            {user.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function TranslationRulesField(props: { path?: string }) {
  const { value, setValue } = useField<string>({ path: props.path ?? 'multilingual.translationRules' })
  const { value: activeLocales } = useField<string[]>({ path: 'multilingual.activeLocales' })
  const { value: defaultLocale } = useField<string>({ path: 'multilingual.defaultLocale' })
  const [users, setUsers] = useState<UserOption[]>([])

  useEffect(() => {
    let cancelled = false
    type UsersBody = { docs?: Array<{ id: number; name?: string; email?: string }> }
    fetch('/api/users?limit=500&depth=0', { credentials: 'same-origin' })
      .then((response): Promise<UsersBody> => (response.ok ? response.json() as Promise<UsersBody> : Promise.resolve({ docs: [] })))
      .then((body) => {
        if (cancelled) return
        setUsers(
          (body.docs ?? []).map((user) => ({ id: Number(user.id), label: user.name || user.email || `User ${user.id}` })),
        )
      })
      .catch(() => {
        if (!cancelled) setUsers([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const rules = useMemo<TranslationRules>(() => parseTranslationRules(value ?? '{}'), [value])
  const targets = (Array.isArray(activeLocales) ? activeLocales : []).filter((code) => code !== defaultLocale)

  const update = (locale: string, patch: Partial<TranslationRule>) => {
    const current = rules[locale] ?? { translators: [], reviewers: [] }
    const next: TranslationRules = { ...rules, [locale]: { ...current, ...patch } }
    setValue(JSON.stringify(next))
  }

  if (targets.length === 0) {
    return (
      <p className="text-[13px] opacity-80">
        Choose at least one language besides your primary one, then assign translators and reviewers here.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-[16px]">
      <p className="text-[13px] opacity-80">
        Translators are asked to write or check translations into a language. Reviewers approve them. When review is on and a
        language has reviewers, only those reviewers (and admins, unless bypass is off) can approve.
      </p>
      {targets.map((code) => {
        const rule = rules[code] ?? { translators: [], reviewers: [] }
        return (
          <section key={code} className="flex flex-col gap-[8px] rounded-[8px] border border-[var(--theme-elevation-150,#cac7d1)] p-[12px]">
            <h4 className="text-[14px] font-semibold">{localeLabel(code)}</h4>
            <PeoplePicker legend="Translators" options={users} selected={rule.translators} onChange={(ids) => update(code, { translators: ids })} />
            <PeoplePicker legend="Reviewers" options={users} selected={rule.reviewers} onChange={(ids) => update(code, { reviewers: ids })} />
          </section>
        )
      })}
    </div>
  )
}

export default TranslationRulesField
