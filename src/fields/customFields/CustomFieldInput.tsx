'use client'

import React from 'react'

import type { CustomFieldDef } from './types'

/**
 * Renders one custom field as a real input, used by the native admin panel
 * (CustomFieldsPanel) to edit a collection's Field Group values.
 */

const fieldClassName = 'flex min-w-0 flex-[1_1_260px] flex-col gap-[5px]'
const fieldInlineClassName = 'flex min-w-0 flex-[1_1_100%] flex-row items-center gap-[8px]'
const labelClassName = 'text-[12px] font-semibold'
const helpClassName = 'm-0 text-[11px] opacity-65'
const controlClassName =
  'w-full rounded-[5px] border border-[var(--theme-elevation-150,#d8d3c8)] bg-[var(--theme-input-bg,#fff)] px-[9px] py-[7px] text-[13px] text-inherit [font-family:inherit]'
const btnClassName =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#d8d3c8)] bg-transparent px-[10px] py-[5px] text-[12px] text-inherit hover:border-[#c9a15a]'

export const CustomFieldInput: React.FC<{
  def: CustomFieldDef
  value: unknown
  onChange: (value: unknown) => void
  onPickImage?: () => void
}> = ({ def, value, onChange, onPickImage }) => {
  const id = `cf-${def.name}`

  const label = (
    <label className={labelClassName} htmlFor={id}>
      {def.label}
      {def.required ? <span className="text-[#b3453a]"> *</span> : null}
    </label>
  )

  const help = def.helpText ? <p className={helpClassName}>{def.helpText}</p> : null

  const wrap = (control: React.ReactNode) => (
    <div className={fieldClassName}>
      {label}
      {control}
      {help}
    </div>
  )

  switch (def.type) {
    case 'textarea':
      return wrap(
        <textarea
          id={id}
          className={controlClassName}
          rows={4}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />,
      )

    case 'number':
      return wrap(
        <input
          id={id}
          className={controlClassName}
          type="number"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />,
      )

    case 'checkbox':
      return (
        <div className={fieldInlineClassName}>
          <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
          {label}
          {help}
        </div>
      )

    case 'select':
      return wrap(
        <select
          id={id}
          className={controlClassName}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">—</option>
          {(def.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>,
      )

    case 'date':
      return wrap(
        <input
          id={id}
          className={controlClassName}
          type="date"
          value={typeof value === 'string' ? value.slice(0, 10) : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />,
      )

    case 'color':
      return wrap(
        <div className="flex items-center gap-[8px]">
          <input
            id={id}
            className="h-[34px] w-[38px] cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#d8d3c8)] p-0 [background:none]"
            type="color"
            value={typeof value === 'string' && value ? value : '#000000'}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            className={controlClassName}
            type="text"
            placeholder="#000000"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>,
      )

    case 'image':
      return wrap(
        <div className="flex items-center gap-[10px]">
          {typeof value === 'string' && value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt=""
              className="h-[56px] w-[56px] rounded-[5px] border border-[var(--theme-elevation-150,#e2ded4)] object-cover"
            />
          ) : (
            <div className="flex h-[56px] w-[56px] items-center justify-center rounded-[5px] border border-dashed border-[var(--theme-elevation-150,#e2ded4)] text-center text-[10px] opacity-60">
              No image
            </div>
          )}
          <div className="flex flex-col gap-[4px]">
            {onPickImage && (
              <button type="button" className={btnClassName} onClick={onPickImage}>
                {value ? 'Change' : 'Choose image'}
              </button>
            )}
            {value ? (
              <button type="button" className={btnClassName} onClick={() => onChange(undefined)}>
                Remove
              </button>
            ) : null}
          </div>
        </div>,
      )

    case 'url':
    case 'text':
    default:
      return wrap(
        <input
          id={id}
          className={controlClassName}
          type={def.type === 'url' ? 'url' : 'text'}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />,
      )
  }
}
