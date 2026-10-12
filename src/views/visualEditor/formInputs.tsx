'use client'

import React, { createContext, useContext } from 'react'

import type { ConditionOperator, FormFieldOption } from '@/features/forms/types'

/** The other fields in the form being edited, so a logic rule can point at one. Empty outside the form builder. */
export type FormFieldChoice = { name: string; label: string }
export const FormEditorContext = createContext<{ fields: FormFieldChoice[] }>({ fields: [] })

const OPERATORS: { value: ConditionOperator; label: string; needsValue: boolean }[] = [
  { value: 'equals', label: 'is', needsValue: true },
  { value: 'notEquals', label: 'is not', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'notContains', label: 'does not contain', needsValue: true },
  { value: 'greaterThan', label: 'is greater than', needsValue: true },
  { value: 'lessThan', label: 'is less than', needsValue: true },
  { value: 'isEmpty', label: 'is empty', needsValue: false },
  { value: 'isNotEmpty', label: 'is not empty', needsValue: false },
]

type Rule = { field?: string; operator?: ConditionOperator; value?: string }
type Logic = { enabled?: boolean; action?: 'show' | 'hide'; match?: 'all' | 'any'; rules?: Rule[] }

/** The rule builder behind "Conditional logic": show or hide a field depending on other answers. */
export const FormLogicInput: React.FC<{ value: unknown; onChange: (next: unknown) => void }> = ({ value, onChange }) => {
  const { fields } = useContext(FormEditorContext)
  const logic: Logic = value && typeof value === 'object' ? (value as Logic) : {}
  const rules = Array.isArray(logic.rules) ? logic.rules : []
  const set = (patch: Partial<Logic>) => onChange({ ...logic, ...patch })
  const setRule = (index: number, patch: Rule) => set({ rules: rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) })

  return (
    <div className="ve-field ve-field--full">
      <label className="ve-field--checkbox">
        <input type="checkbox" checked={Boolean(logic.enabled)} onChange={(event) => set({ enabled: event.target.checked, rules: rules.length ? rules : [{ operator: 'equals' }] })} />
        <span>Conditional logic</span>
      </label>
      {logic.enabled && (
        <div className="ve-section-fields">
          <div className="ve-col-row">
            <select aria-label="Show or hide" value={logic.action === 'hide' ? 'hide' : 'show'} onChange={(event) => set({ action: event.target.value as 'show' | 'hide' })}>
              <option value="show">Show this field</option>
              <option value="hide">Hide this field</option>
            </select>
            <span>if</span>
            <select aria-label="Match all or any" value={logic.match === 'any' ? 'any' : 'all'} onChange={(event) => set({ match: event.target.value as 'all' | 'any' })}>
              <option value="all">all</option>
              <option value="any">any</option>
            </select>
            <span>of these match</span>
          </div>
          {rules.map((rule, index) => {
            const operator = OPERATORS.find((entry) => entry.value === (rule.operator || 'equals')) || OPERATORS[0]
            return (
              <div className="ve-col-row" key={index}>
                <select aria-label="Field" value={rule.field || ''} onChange={(event) => setRule(index, { field: event.target.value })}>
                  <option value="">Choose a field</option>
                  {fields.map((field) => (
                    <option key={field.name} value={field.name}>
                      {field.label || field.name}
                    </option>
                  ))}
                </select>
                <select aria-label="Condition" value={operator.value} onChange={(event) => setRule(index, { operator: event.target.value as ConditionOperator })}>
                  {OPERATORS.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
                {operator.needsValue && <input type="text" aria-label="Value" value={rule.value || ''} onChange={(event) => setRule(index, { value: event.target.value })} />}
                <button type="button" className="ve-icon-btn" aria-label="Remove rule" onClick={() => set({ rules: rules.filter((_, i) => i !== index) })}>
                  ✕
                </button>
              </div>
            )
          })}
          <button type="button" className="ve-btn ve-btn--ghost" onClick={() => set({ rules: [...rules, { operator: 'equals' }] })} disabled={rules.length >= 10}>
            + Add rule
          </button>
        </div>
      )}
    </div>
  )
}

/** An editable list of choices: label, stored value and (on a purchasable form) a price. */
export const FormOptionsInput: React.FC<{ label: string; value: unknown; onChange: (next: unknown) => void }> = ({ label, value, onChange }) => {
  const options: FormFieldOption[] = Array.isArray(value) ? (value as FormFieldOption[]) : []
  const setOption = (index: number, patch: FormFieldOption) => onChange(options.map((option, i) => (i === index ? { ...option, ...patch } : option)))

  return (
    <div className="ve-field ve-field--full">
      <span>{label}</span>
      {options.map((option, index) => (
        <div className="ve-col-row" key={index}>
          <input
            type="text"
            aria-label={`Choice ${index + 1} label`}
            placeholder="Label"
            value={option.label || ''}
            onChange={(event) => {
              const text = event.target.value
              // The stored value follows the label until the author edits it on purpose.
              const followsLabel = !option.value || option.value === option.label
              setOption(index, { label: text, ...(followsLabel ? { value: text } : {}) })
            }}
          />
          <input type="text" aria-label={`Choice ${index + 1} value`} placeholder="Value" value={option.value || ''} onChange={(event) => setOption(index, { value: event.target.value })} />
          <input
            type="number"
            aria-label={`Choice ${index + 1} price`}
            placeholder="Price"
            value={typeof option.price === 'number' ? option.price : ''}
            onChange={(event) => setOption(index, { price: event.target.value === '' ? undefined : Number(event.target.value) })}
          />
          <button type="button" className="ve-icon-btn" aria-label={`Remove choice ${index + 1}`} onClick={() => onChange(options.filter((_, i) => i !== index))}>
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="ve-btn ve-btn--ghost" onClick={() => onChange([...options, { label: `Option ${options.length + 1}`, value: `Option ${options.length + 1}` }])} disabled={options.length >= 100}>
        + Add choice
      </button>
    </div>
  )
}
