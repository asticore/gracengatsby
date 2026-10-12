'use client'

import React from 'react'
import { FieldLabel, useField } from '@/engine/ui'

import { MAX_TIERS, parseTiers, type TicketTier } from '../tiers'
import './edit-screens.css'

type Row = Omit<TicketTier, 'capacity' | 'price'> & { price: number | string; capacity: number | string | null }

/**
 * Rows editor for an event's ticket tiers. Writes the `ticketTiers` JSON as an
 * array of tiers; empty rows are dropped by the server when it reads them back.
 */
export function TicketTiersField({ path, readOnly }: { path: string; readOnly?: boolean }) {
  const { value, setValue } = useField<unknown>({ path })
  const rows = parseTiers(value) as Row[]
  // Rows being typed into can be blank for a moment, so keep the raw array when it is one.
  const current: Row[] = Array.isArray(value) ? (value as Row[]) : rows

  const update = (index: number, patch: Partial<Row>) => {
    setValue(current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }
  const add = () => setValue([...current, { name: '', description: '', price: 0, capacity: null, salesEnd: null }])
  const remove = (index: number) => setValue(current.filter((_, i) => i !== index))

  return (
    <div className="field-type es-tiers">
      <FieldLabel label="Ticket tiers" />
      <p className="es-muted">Different kinds of ticket (for example Standard and VIP) shown on the event page. Prices are in dollars.</p>
      {current.length === 0 && <p className="es-muted">No tiers yet. Without tiers the event uses its single ticket setting.</p>}
      {current.map((row, index) => (
        <fieldset className="es-tier" disabled={readOnly} key={index}>
          <legend>Tier {index + 1}</legend>
          <label>
            Name
            <input onChange={(event) => update(index, { name: event.target.value })} type="text" value={row.name ?? ''} />
          </label>
          <label>
            Description
            <input onChange={(event) => update(index, { description: event.target.value })} type="text" value={row.description ?? ''} />
          </label>
          <div className="es-tier__row">
            <label>
              Price ($)
              <input min={0} onChange={(event) => update(index, { price: event.target.value })} step="0.01" type="number" value={row.price ?? 0} />
            </label>
            <label>
              Places (blank for no limit)
              <input min={0} onChange={(event) => update(index, { capacity: event.target.value === '' ? null : event.target.value })} type="number" value={row.capacity ?? ''} />
            </label>
            <label>
              Stop selling on
              <input
                onChange={(event) => update(index, { salesEnd: event.target.value ? new Date(`${event.target.value}T23:59:59Z`).toISOString() : null })}
                type="date"
                value={row.salesEnd ? String(row.salesEnd).slice(0, 10) : ''}
              />
            </label>
          </div>
          <button className="doc-link doc-link--danger" onClick={() => remove(index)} type="button">
            Remove this tier
          </button>
        </fieldset>
      ))}
      {!readOnly && current.length < MAX_TIERS && (
        <button className="btn" onClick={add} type="button">
          Add a ticket tier
        </button>
      )}
    </div>
  )
}

export default TicketTiersField
