'use client'

import React, { useEffect, useState } from 'react'
import { FieldLabel, useField } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { lengthUnit, normaliseUnitSystem, unitHelp, weightUnit, type UnitSystem } from '@/features/ecommerce/lib/units'
import { displayToCanonical, parseTyped, shownText, type UnitKind } from '@/features/ecommerce/lib/unitInput'

type UnitFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/** One request per page load, shared by every weight and size box (variation rows included). */
let systemRequest: Promise<UnitSystem | null> | null = null

function loadUnitSystem(): Promise<UnitSystem | null> {
  if (!systemRequest) {
    systemRequest = fetch('/api/admin-shop-units', { credentials: 'include' })
      .then((res) => (res.ok ? (res.json() as Promise<{ system?: unknown }>) : null))
      .then((body) => normaliseUnitSystem(body?.system))
      .catch((): null => {
        systemRequest = null
        return null
      })
  }
  return systemRequest
}

function useUnitSystem(): UnitSystem | null {
  const [system, setSystem] = useState<UnitSystem | null>(null)
  useEffect(() => {
    let cancelled = false
    void loadUnitSystem().then((loaded) => {
      if (!cancelled) setSystem(loaded)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return system
}

/**
 * `admin.components.Field` for product weight and size boxes. Shows the stored kg or cm converted
 * into the shop's unit (Shop settings > Currency and units), with that unit as a suffix whose
 * tooltip explains it. Typed values are converted back to kg or cm on change, so the form always
 * saves metric. Until the unit setting has loaded the box is locked, so nothing is typed in the
 * wrong unit.
 */
function UnitNumberInput({ field, path, readOnly, kind }: UnitFieldProps & { kind: UnitKind }) {
  const { setValue, value } = useField<number | undefined>({ path })
  const system = useUnitSystem()
  const [draft, setDraft] = useState<string | null>(null)

  const unit = system === null ? '' : kind === 'weight' ? weightUnit(system) : lengthUnit(system)
  const help = system === null ? 'Loading the shop unit setting.' : unitHelp(kind, system)
  const text = system === null ? '' : shownText(kind, value, system, draft)

  return (
    <div className="field-type number">
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} name={field.name} path={path} required={fieldRequired(field)} />
      <div style={{ alignItems: 'center', display: 'flex', gap: 4 }}>
        <input
          id={`field-${path}`}
          name={path}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          readOnly={readOnly || system === null}
          value={text}
          title={help}
          onChange={(e) => {
            if (system === null) return
            const next = e.target.value
            setDraft(next)
            const typed = parseTyped(next)
            setValue(typed === undefined ? undefined : displayToCanonical(kind, typed, system))
          }}
        />
        <span title={help} aria-label={help} style={{ opacity: 0.7 }}>
          {unit}
        </span>
      </div>
    </div>
  )
}

export function WeightInput(props: UnitFieldProps) {
  return <UnitNumberInput {...props} kind="weight" />
}

export function DimensionInput(props: UnitFieldProps) {
  return <UnitNumberInput {...props} kind="dimension" />
}