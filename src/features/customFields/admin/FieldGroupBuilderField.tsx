'use client'

import React, { useState } from 'react'
import { useField } from '@/engine/ui'

import { CustomFieldInput } from '@/fields/customFields/CustomFieldInput'
import { CONDITION_OPERATORS, CUSTOM_FIELD_TYPES, type ConditionRule, type CustomFieldDef, type CustomFieldType, type FlexibleLayout } from '@/fields/customFields/types'

import { findDuplicateNames, MAX_FIELD_DEPTH, rawDefinitionList } from '../normalize'

/**
 * The Fields builder on a Field Group. Edits the group's `definition` JSON
 * (a list of CustomFieldDef) and previews each field as it will render.
 *
 * Nested sub-fields (group, repeater, flexible layouts) are edited with the same
 * component, to MAX_FIELD_DEPTH. Reordering is by up/down buttons.
 */

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  textarea: 'Text area',
  wysiwyg: 'Rich text (markdown)',
  number: 'Number',
  checkbox: 'Checkbox',
  select: 'Dropdown',
  radio: 'Radio buttons',
  'button-group': 'Button group',
  image: 'Image',
  file: 'File',
  gallery: 'Gallery',
  url: 'URL',
  email: 'Email',
  phone: 'Phone',
  date: 'Date',
  datetime: 'Date and time',
  time: 'Time',
  color: 'Colour',
  link: 'Link',
  relationship: 'Relationship',
  oembed: 'Embed (video / audio)',
  map: 'Map location',
  group: 'Group',
  repeater: 'Repeater',
  flexible: 'Flexible content',
}

const TEXT_LIKE = new Set<CustomFieldType>(['text', 'textarea', 'wysiwyg', 'url', 'email', 'phone'])
const CHOICE = new Set<CustomFieldType>(['select', 'radio', 'button-group'])
const COMPLEX = new Set<CustomFieldType>(['group', 'repeater', 'flexible', 'gallery', 'link', 'map', 'relationship', 'oembed'])
const RELATION_TARGETS = ['pages', 'posts', 'products', 'events', 'faqs']

const inputClass =
  'w-full rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-[var(--theme-input-bg,#fff)] px-[8px] py-[6px] text-[13px] text-inherit [font-family:inherit]'
const buttonClass =
  'cursor-pointer rounded-[5px] border border-[var(--theme-elevation-150,#cac7d1)] bg-transparent px-[9px] py-[4px] text-[12px] text-inherit hover:border-[#2e3192] disabled:opacity-40'

/** Field names are used as keys in stored values and merge tags: lowercase letters, digits and underscores. */
export const toFieldName = (raw: string): string => raw.toLowerCase().replace(/[^a-z0-9_]/g, '_')

const newField = (type: CustomFieldType, index: number): CustomFieldDef => ({
  label: 'New field',
  name: `field_${index + 1}`,
  type,
  required: false,
  ...(type === 'select' || type === 'radio' || type === 'button-group' ? { options: [{ label: 'Option 1', value: 'option_1' }] } : {}),
  ...(type === 'flexible' ? { layouts: [{ name: 'layout_1', label: 'Layout 1', subFields: [] }] } : {}),
  ...(type === 'group' || type === 'repeater' ? { subFields: [] } : {}),
})

/** Known helper: the sibling names a condition can refer to (every other field at this level). */
function siblingNames(list: CustomFieldDef[], self: CustomFieldDef): string[] {
  return list.filter((f) => f !== self && f.name).map((f) => f.name)
}

function ConditionEditor({ def, list, onChange }: { def: CustomFieldDef; list: CustomFieldDef[]; onChange: (groups: ConditionRule[][] | null) => void }) {
  const groups = def.conditions ?? []
  const names = siblingNames(list, def)
  const update = (next: ConditionRule[][]) => onChange(next.length ? next : null)

  return (
    <div className="flex flex-col gap-[6px] rounded-[5px] border border-dashed border-[var(--theme-elevation-150,#cac7d1)] p-[8px]">
      <span className="text-[12px] font-semibold">Show this field when…</span>
      {groups.length === 0 && <span className="text-[11px] opacity-65">Always shown.</span>}
      {groups.map((rules, gi) => (
        <div key={gi} className="flex flex-col gap-[4px]">
          {gi > 0 && <span className="text-[11px] font-semibold uppercase opacity-60">or</span>}
          {rules.map((rule, ri) => (
            <div key={ri} className="flex flex-wrap items-center gap-[4px]">
              {ri > 0 && <span className="text-[11px] uppercase opacity-60">and</span>}
              <select
                className={inputClass}
                aria-label="Condition field"
                value={rule.field}
                onChange={(e) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, field: e.target.value } : r)) : g)))}
              >
                <option value="">Choose field</option>
                {names.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                aria-label="Condition operator"
                value={rule.operator}
                onChange={(e) =>
                  update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, operator: e.target.value as ConditionRule['operator'] } : r)) : g)))
                }
              >
                {CONDITION_OPERATORS.map((op) => (
                  <option key={op} value={op}>
                    {op}
                  </option>
                ))}
              </select>
              {rule.operator !== 'isEmpty' && rule.operator !== 'notEmpty' && (
                <input
                  className={inputClass}
                  aria-label="Condition value"
                  placeholder="value"
                  value={rule.value ?? ''}
                  onChange={(e) => update(groups.map((g, i) => (i === gi ? g.map((r, j) => (j === ri ? { ...r, value: e.target.value } : r)) : g)))}
                />
              )}
              <button type="button" className={buttonClass} onClick={() => update(groups.map((g, i) => (i === gi ? g.filter((_, j) => j !== ri) : g)).filter((g) => g.length))}>
                ✕
              </button>
            </div>
          ))}
          <div className="flex gap-[4px]">
            <button
              type="button"
              className={buttonClass}
              disabled={names.length === 0}
              onClick={() => update(groups.map((g, i) => (i === gi ? [...g, { field: names[0] ?? '', operator: 'equals' as const, value: '' }] : g)))}
            >
              + and
            </button>
          </div>
        </div>
      ))}
      <div>
        <button
          type="button"
          className={buttonClass}
          disabled={names.length === 0}
          onClick={() => update([...groups, [{ field: names[0] ?? '', operator: 'equals' as const, value: '' }]])}
        >
          + or
        </button>
      </div>
    </div>
  )
}

/** One field's editor. `list` is the sibling list it sits in (for reordering and conditions). */
function FieldEditor({
  def,
  list,
  depth,
  onChange,
  onRemove,
  onMove,
  canUp,
  canDown,
}: {
  def: CustomFieldDef
  list: CustomFieldDef[]
  depth: number
  onChange: (next: CustomFieldDef) => void
  onRemove: () => void
  onMove: (delta: -1 | 1) => void
  canUp: boolean
  canDown: boolean
}) {
  const [open, setOpen] = useState(false)
  const set = (patch: Partial<CustomFieldDef>) => onChange({ ...def, ...patch })
  const nestable = depth < MAX_FIELD_DEPTH
  const type = def.type

  return (
    <div className="flex flex-col gap-[8px] rounded-[6px] border border-[var(--theme-elevation-150,#e2ded4)] p-[10px]">
      <div className="flex flex-wrap items-center gap-[6px]">
        <button type="button" className={buttonClass} onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? '▾' : '▸'}
        </button>
        <strong className="text-[13px]">{def.label || def.name}</strong>
        <span className="text-[11px] opacity-60">
          {TYPE_LABELS[type]} · {def.name}
          {def.required ? ' · required' : ''}
        </span>
        <span className="ml-auto flex gap-[4px]">
          <button type="button" className={buttonClass} disabled={!canUp} onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </button>
          <button type="button" className={buttonClass} disabled={!canDown} onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </button>
          <button type="button" className={buttonClass} onClick={onRemove}>
            Remove
          </button>
        </span>
      </div>

      {open && (
        <div className="flex flex-col gap-[10px]">
          <div className="grid grid-cols-1 gap-[8px] md:grid-cols-3">
            <label className="flex flex-col gap-[3px] text-[12px]">
              Label
              <input className={inputClass} value={def.label} onChange={(e) => set({ label: e.target.value })} />
            </label>
            <label className="flex flex-col gap-[3px] text-[12px]">
              Name (merge tag key)
              <input className={inputClass} value={def.name} onChange={(e) => set({ name: toFieldName(e.target.value) })} />
            </label>
            <label className="flex flex-col gap-[3px] text-[12px]">
              Type
              <select className={inputClass} value={type} onChange={(e) => onChange({ ...newField(e.target.value as CustomFieldType, 0), label: def.label, name: def.name, required: def.required, conditions: def.conditions })}>
                {CUSTOM_FIELD_TYPES.filter((t) => nestable || (t !== 'group' && t !== 'repeater' && t !== 'flexible')).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
                {!CUSTOM_FIELD_TYPES.includes(type) && <option value={type}>{type}</option>}
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-[12px] text-[12px]">
            <label className="flex items-center gap-[6px]">
              <input type="checkbox" checked={Boolean(def.required)} onChange={(e) => set({ required: e.target.checked })} />
              Required
            </label>
            <label className="flex items-center gap-[6px]">
              Width
              <select className={inputClass} value={def.width ?? 'half'} onChange={(e) => set({ width: e.target.value as 'half' | 'full' })}>
                <option value="half">Half</option>
                <option value="full">Full</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-[3px] text-[12px]">
            Help text
            <input className={inputClass} value={def.helpText ?? ''} onChange={(e) => set({ helpText: e.target.value || null })} />
          </label>

          {!COMPLEX.has(type) && type !== 'checkbox' && (
            <label className="flex flex-col gap-[3px] text-[12px]">
              Default value
              <input className={inputClass} value={def.defaultValue ?? ''} onChange={(e) => set({ defaultValue: e.target.value || null })} />
            </label>
          )}

          {type === 'checkbox' && (
            <div className="flex flex-wrap gap-[12px] text-[12px]">
              <label className="flex flex-col gap-[3px]">
                Label when ticked
                <input className={inputClass} value={def.trueLabel ?? ''} placeholder="Yes" onChange={(e) => set({ trueLabel: e.target.value || null })} />
              </label>
              <label className="flex flex-col gap-[3px]">
                Default
                <select className={inputClass} value={def.defaultValue ?? ''} onChange={(e) => set({ defaultValue: e.target.value || null })}>
                  <option value="">Unticked</option>
                  <option value="true">Ticked</option>
                </select>
              </label>
            </div>
          )}

          {CHOICE.has(type) && (
            <OptionsEditor def={def} onChange={set} />
          )}

          {type === 'select' && (
            <label className="flex items-center gap-[6px] text-[12px]">
              <input type="checkbox" checked={Boolean(def.multiple)} onChange={(e) => set({ multiple: e.target.checked })} />
              Allow several choices
            </label>
          )}

          {type === 'number' && (
            <div className="flex flex-wrap gap-[8px]">
              <NumberInput label="Minimum" value={def.min} onChange={(min) => set({ min })} />
              <NumberInput label="Maximum" value={def.max} onChange={(max) => set({ max })} />
              <NumberInput label="Step" value={def.step} onChange={(step) => set({ step })} />
            </div>
          )}

          {TEXT_LIKE.has(type) && (
            <div className="flex flex-col gap-[8px]">
              <div className="flex flex-wrap gap-[8px]">
                <NumberInput label="Min length" value={def.min} onChange={(min) => set({ min })} />
                <NumberInput label="Max length" value={def.max} onChange={(max) => set({ max })} />
              </div>
              <label className="flex flex-col gap-[3px] text-[12px]">
                Pattern (regular expression)
                <input className={inputClass} value={def.pattern ?? ''} placeholder="^[A-Z]{2}[0-9]+$" onChange={(e) => set({ pattern: e.target.value || null })} />
              </label>
              <label className="flex flex-col gap-[3px] text-[12px]">
                Message when the pattern fails
                <input className={inputClass} value={def.patternMessage ?? ''} onChange={(e) => set({ patternMessage: e.target.value || null })} />
              </label>
            </div>
          )}

          {(type === 'gallery' || (type === 'relationship' && def.hasMany) || type === 'repeater' || type === 'flexible') && (
            <div className="flex flex-wrap gap-[8px]">
              <NumberInput label={type === 'gallery' ? 'Minimum items' : 'Minimum rows'} value={def.min} onChange={(min) => set({ min })} />
              <NumberInput label={type === 'gallery' ? 'Maximum items' : 'Maximum rows'} value={def.max} onChange={(max) => set({ max })} />
            </div>
          )}

          {(type === 'image' || type === 'file') && (
            <label className="flex flex-col gap-[3px] text-[12px]">
              Allowed file types (comma separated, eg image/,application/pdf). Empty allows any.
              <input className={inputClass} value={def.mimeTypes ?? ''} onChange={(e) => set({ mimeTypes: e.target.value || null })} />
            </label>
          )}

          {type === 'relationship' && (
            <div className="flex flex-col gap-[6px] text-[12px]">
              <span className="font-semibold">Can point to</span>
              <div className="flex flex-wrap gap-[10px]">
                {RELATION_TARGETS.map((slug) => (
                  <label key={slug} className="flex items-center gap-[4px]">
                    <input
                      type="checkbox"
                      checked={(def.relationTo ?? []).includes(slug)}
                      onChange={(e) =>
                        set({ relationTo: e.target.checked ? [...(def.relationTo ?? []), slug] : (def.relationTo ?? []).filter((s) => s !== slug) })
                      }
                    />
                    {slug}
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-[6px]">
                <input type="checkbox" checked={Boolean(def.hasMany)} onChange={(e) => set({ hasMany: e.target.checked })} />
                Allow several
              </label>
            </div>
          )}

          {type === 'map' && (
            <NumberInput label="Default zoom" value={def.defaultZoom} onChange={(defaultZoom) => set({ defaultZoom })} />
          )}

          {(type === 'group' || type === 'repeater') && nestable && (
            <SubList title={type === 'group' ? 'Group fields' : 'Row fields'} defs={def.subFields ?? []} depth={depth + 1} onChange={(subFields) => set({ subFields })} />
          )}

          {type === 'flexible' && nestable && (
            <LayoutsEditor layouts={def.layouts ?? []} depth={depth + 1} onChange={(layouts) => set({ layouts })} />
          )}

          <ConditionEditor def={def} list={list} onChange={(conditions) => set({ conditions })} />

          <LivePreview def={def} />
        </div>
      )}
    </div>
  )
}

function NumberInput({ label, value, onChange }: { label: string; value: number | null | undefined; onChange: (n: number | null) => void }) {
  return (
    <label className="flex flex-col gap-[3px] text-[12px]">
      {label}
      <input
        className={inputClass}
        type="number"
        step="any"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  )
}

function OptionsEditor({ def, onChange }: { def: CustomFieldDef; onChange: (patch: Partial<CustomFieldDef>) => void }) {
  const options = def.options ?? []
  const setOptions = (next: { label: string; value: string }[]) => onChange({ options: next })
  return (
    <div className="flex flex-col gap-[4px]">
      <span className="text-[12px] font-semibold">Choices</span>
      {options.map((option, index) => (
        <div key={index} className="flex gap-[4px]">
          <input
            className={inputClass}
            aria-label="Choice label"
            value={option.label}
            onChange={(e) => setOptions(options.map((o, i) => (i === index ? { ...o, label: e.target.value } : o)))}
          />
          <input
            className={inputClass}
            aria-label="Choice value"
            value={option.value}
            onChange={(e) => setOptions(options.map((o, i) => (i === index ? { ...o, value: toFieldName(e.target.value) } : o)))}
          />
          <button type="button" className={buttonClass} onClick={() => setOptions(options.filter((_, i) => i !== index))}>
            ✕
          </button>
        </div>
      ))}
      <div>
        <button type="button" className={buttonClass} onClick={() => setOptions([...options, { label: `Option ${options.length + 1}`, value: `option_${options.length + 1}` }])}>
          Add choice
        </button>
      </div>
    </div>
  )
}

/** A list of fields (top-level, group sub-fields or repeater row fields). */
function SubList({ title, defs, depth, onChange }: { title: string; defs: CustomFieldDef[]; depth: number; onChange: (next: CustomFieldDef[]) => void }) {
  const set = (next: CustomFieldDef[]) => onChange(next)
  return (
    <div className="flex flex-col gap-[8px] rounded-[6px] bg-[rgba(0,0,0,0.02)] p-[8px]">
      <span className="text-[12px] font-semibold">{title}</span>
      {defs.map((def, index) => (
        <FieldEditor
          key={`${index}-${def.name}`}
          def={def}
          list={defs}
          depth={depth}
          onChange={(next) => set(defs.map((d, i) => (i === index ? next : d)))}
          onRemove={() => set(defs.filter((_, i) => i !== index))}
          onMove={(delta) => set(moveAt(defs, index, delta))}
          canUp={index > 0}
          canDown={index < defs.length - 1}
        />
      ))}
      <div>
        <button type="button" className={buttonClass} onClick={() => set([...defs, newField('text', defs.length)])}>
          Add field
        </button>
      </div>
    </div>
  )
}

function LayoutsEditor({ layouts, depth, onChange }: { layouts: FlexibleLayout[]; depth: number; onChange: (next: FlexibleLayout[]) => void }) {
  return (
    <div className="flex flex-col gap-[8px] rounded-[6px] bg-[rgba(0,0,0,0.02)] p-[8px]">
      <span className="text-[12px] font-semibold">Layouts</span>
      {layouts.map((layout, index) => (
        <div key={index} className="flex flex-col gap-[6px] rounded-[5px] border border-[var(--theme-elevation-150,#e2ded4)] p-[8px]">
          <div className="flex gap-[6px]">
            <input
              className={inputClass}
              aria-label="Layout label"
              value={layout.label}
              onChange={(e) => onChange(layouts.map((l, i) => (i === index ? { ...l, label: e.target.value } : l)))}
            />
            <input
              className={inputClass}
              aria-label="Layout name"
              value={layout.name}
              onChange={(e) => onChange(layouts.map((l, i) => (i === index ? { ...l, name: toFieldName(e.target.value) } : l)))}
            />
            <button type="button" className={buttonClass} disabled={index === 0} onClick={() => onChange(moveAt(layouts, index, -1))}>
              ↑
            </button>
            <button type="button" className={buttonClass} onClick={() => onChange(layouts.filter((_, i) => i !== index))}>
              Remove
            </button>
          </div>
          <SubList
            title="Fields in this layout"
            defs={layout.subFields}
            depth={depth}
            onChange={(subFields) => onChange(layouts.map((l, i) => (i === index ? { ...l, subFields } : l)))}
          />
        </div>
      ))}
      <div>
        <button
          type="button"
          className={buttonClass}
          onClick={() => onChange([...layouts, { name: `layout_${layouts.length + 1}`, label: `Layout ${layouts.length + 1}`, subFields: [] }])}
        >
          Add layout
        </button>
      </div>
    </div>
  )
}

/** Shows the field as an editor will see it, with a throwaway value. */
function LivePreview({ def }: { def: CustomFieldDef }) {
  const [value, setValue] = useState<unknown>(undefined)
  return (
    <div className="flex flex-col gap-[4px] rounded-[6px] border border-dashed border-[var(--theme-elevation-150,#cac7d1)] p-[8px]">
      <span className="text-[11px] uppercase tracking-[0.06em] opacity-60">Preview</span>
      <CustomFieldInput def={def} value={value} onChange={setValue} idPrefix="preview" />
    </div>
  )
}

function moveAt<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

/** Registered as the admin component for the `definition` field of field-groups. */
export const FieldGroupBuilderField: React.FC<{ path?: string }> = ({ path = 'definition' }) => {
  const { value, setValue } = useField<unknown>({ path })
  // Raw list so a row being renamed or retyped stays put; the server normalises on save.
  const list = rawDefinitionList(value)
  const duplicates = findDuplicateNames(list)

  return (
    <div className="mb-[24px] flex flex-col gap-[10px]">
      <div className="flex items-baseline justify-between">
        <h3 className="m-0 text-[15px]">Fields</h3>
        <span className="text-[12px] opacity-65">{list.length} field{list.length === 1 ? '' : 's'}</span>
      </div>
      {duplicates.length > 0 && (
        <p role="alert" className="m-0 rounded-[5px] border border-[#b3453a] p-[8px] text-[12px] text-[#b3453a]">
          These names are used more than once in this group: {duplicates.join(', ')}. Only the first one is saved; rename the others.
        </p>
      )}
      <SubList title="" defs={list} depth={1} onChange={(next) => setValue(next)} />
      <p className="m-0 text-[11px] opacity-65">
        Use a field in templates as {'{{field:name}}'}. Nested values use dots, eg {'{{field:repeater.0.title}}'}. Inside a Loop, the same tags fill in per item.
      </p>
    </div>
  )
}

export default FieldGroupBuilderField
