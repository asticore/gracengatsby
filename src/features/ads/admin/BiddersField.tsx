'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'

import { ADAPTERS } from '../adapters'

type Entry = { enabled?: boolean; sellerId?: string; params?: Record<string, string | number> }
type Value = Record<string, Entry>

/** One small form per header-bidding adapter, writing the `bidders` JSON. */
export function BiddersField({ path, readOnly }: { path: string; readOnly?: boolean }) {
  const { value, setValue } = useField<Value | string | null>({ path })
  const current: Value = value && typeof value === 'object' ? (value as Value) : (() => { try { return JSON.parse(String(value ?? '{}')) as Value } catch { return {} } })()

  const patch = (code: string, change: Partial<Entry>) => setValue({ ...current, [code]: { ...current[code], ...change } })
  const setParam = (code: string, name: string, raw: string, type: 'string' | 'number') => {
    const params = { ...(current[code]?.params ?? {}) }
    if (raw === '') delete params[name]
    else params[name] = type === 'number' && /^\d+$/.test(raw) ? Number(raw) : raw
    patch(code, { params })
  }

  return (
    <div className="field-type">
      <FieldLabel label="Bidders" />
      {ADAPTERS.map((a) => {
        const entry = current[a.code] ?? {}
        return (
          <fieldset key={a.code} style={{ margin: '0 0 12px', padding: 12, border: '1px solid var(--theme-elevation-150)' }}>
            <legend>
              <label>
                <input type="checkbox" checked={entry.enabled === true} disabled={readOnly} onChange={(e) => patch(a.code, { enabled: e.target.checked })} /> {a.label}
              </label>
            </legend>
            <p style={{ margin: '0 0 8px', fontSize: 12 }}>{a.help}</p>
            {a.params.map((p) => (
              <label key={p.name} style={{ display: 'block', marginBottom: 6 }}>
                {p.label}{p.scope === 'unit' ? ' (default, override per unit)' : ''}
                <input type="text" disabled={readOnly} value={String(entry.params?.[p.name] ?? '')} onChange={(e) => setParam(a.code, p.name, e.target.value.trim(), p.type)} style={{ display: 'block', width: '100%' }} />
              </label>
            ))}
            <label style={{ display: 'block' }}>
              ads.txt account id
              <input type="text" disabled={readOnly} value={entry.sellerId ?? ''} onChange={(e) => patch(a.code, { sellerId: e.target.value.trim() })} style={{ display: 'block', width: '100%' }} />
            </label>
          </fieldset>
        )
      })}
    </div>
  )
}
