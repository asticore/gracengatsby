'use client'

/**
 * Generic, field-array-driven renderer - the core of the from-scratch admin
 * (Stage 11 Phase 1). Every collection/global's `fields: Field[]` (a plain
 * data array, not a runtime Payload call - see the plan doc's "Key discovery")
 * is walked by this ONE component instead of 38 hand-written per-entity forms.
 *
 * Every field is also gated by `useFieldVisible`, which live-evaluates its
 * `admin.condition` (if any) against current sibling form data - see that
 * function's own doc comment for how a condition survives the server->client
 * boundary (shipped as source text, reconstructed with `new Function`).
 *
 * Handles, by `field.type`:
 *   - Pure layout, no path segment added: `row`, `collapsible` (recurse into
 *     `.fields` at the SAME path prefix as the parent).
 *   - Data-holding containers, path nests under `.name`: `group`, `tabs`
 *     (each tab optionally named; an unnamed tab doesn't nest the path).
 *   - `ui`: presentational only, no value - rendered via componentRegistry if
 *     an admin.components.Field override is set, otherwise skipped (nothing
 *     to render generically for a field with no shape of its own).
 *   - Scalar leaves (text/textarea/number/email/checkbox/date/select/radio):
 *     delegated to the sibling renderer files in this directory.
 *   - relationship/upload: a real search-select picker (Phase 3, `./
 *     RelationshipField.tsx`) - single-value or multi-value (chips) depending
 *     on `hasMany`, client-side filtered over one fetched page of
 *     `GET /api/<relationTo>`. See that file's own doc comment for the
 *     label/search heuristic's limits.
 *   - array/blocks: real repeatable-row UI (Phase 3, `./ArrayField.tsx` and
 *     `./BlocksField.tsx`) with per-row-subfield editing, add/remove/reorder
 *     controls, and fallback to raw JSON for unsupported nested types.
 *   - Complex types not yet given dedicated UI (Phase 3 polish item):
 *     richText/json/join/code/point get a FUNCTIONAL STOPGAP here inline, so
 *     nothing crashes for any of the 38 entities before those get a real pass -
 *     see the plan doc's Phase breakdown.
 *
 * A field's own `admin.components.Field` override (a `'<path>#<Export>'`
 * string, e.g. SlugComponent) always wins over the built-in renderer for its
 * type, resolved via `resolveComponent` - this is the same mechanism real
 * Payload used via the generated importMap.js, just hand-rolled.
 */

import React from 'react'
import type { Field } from '@/engine'
import { resolveComponent } from '@/admin/componentRegistry'
import { FieldLabel, useField, useFormFields } from '@/engine/ui'
import { childPath, fieldLabel, fieldRequired, getAtPath, reviveCondition, unflattenFields } from './shared'

import { ArrayFieldRenderer } from './ArrayField'
import { BlocksFieldRenderer } from './BlocksField'
import { CheckboxFieldRenderer } from './CheckboxField'
import { DateFieldRenderer } from './DateField'
import { EmailFieldRenderer } from './EmailField'
import { NumberFieldRenderer } from './NumberField'
import { RadioFieldRenderer } from './RadioField'
import { RelationshipFieldRenderer } from './RelationshipField'
import { SelectFieldRenderer } from './SelectField'
import { TextFieldRenderer } from './TextField'
import { TextareaFieldRenderer } from './TextareaField'

export type ScalarFieldRendererProps = {
  field: Field
  path: string
  readOnly?: boolean
}

/**
 * Evaluates `field.admin.condition(data, siblingData, {user})` against the
 * current form state - LIVE reactive to sibling values (Stage 11 Phase 3).
 * `condition` arrives here as a STRING (its source text), not a function -
 * `sanitizeFieldsForClient` (shared.ts) ships it that way since a real
 * function can't cross the server->client boundary; `reviveCondition`
 * reconstructs it. `user` is not wired up yet (auth context isn't threaded
 * into the admin tree as of Phase 1) - a condition that branches on `user`
 * will see `undefined` for it until that's addressed; tracked in the plan doc.
 */
function useFieldVisible(field: Field, parentPath: string): boolean {
  const conditionSource = (field as { admin?: { condition?: unknown } }).admin?.condition
  return useFormFields(([fields]) => {
    if (typeof conditionSource !== 'string') return true
    const condition = reviveCondition(conditionSource)
    if (!condition) return true
    const data = unflattenFields(fields)
    const siblingData = (getAtPath(data, parentPath) as Record<string, unknown>) ?? data
    try {
      return Boolean(condition(data, siblingData, { user: undefined }))
    } catch {
      // A throwing condition function should hide the field it guards rather than crash the whole form.
      return false
    }
  })
}

function FieldWrapper({ children, type }: { children: React.ReactNode; type: string }) {
  return <div className={`field-type ${type}`}>{children}</div>
}

/** Minimal, functional-but-rough stand-in for a complex field type not yet given dedicated UI (Phase 3). */
function JsonStopgapRenderer({ field, path, readOnly }: ScalarFieldRendererProps) {
  const { value, setValue } = useField<unknown>({ path })
  const [text, setText] = React.useState(() => (value === undefined ? '' : JSON.stringify(value, null, 2)))
  const [error, setError] = React.useState<string | null>(null)

  return (
    <FieldWrapper type={field.type}>
      <FieldLabel htmlFor={`field-${path}`} label={fieldLabel(field)} required={fieldRequired(field)} />
      <textarea
        id={`field-${path}`}
        className="field-type json"
        readOnly={readOnly}
        rows={8}
        style={{ fontFamily: 'monospace', width: '100%' }}
        value={text}
        onChange={(event) => {
          const next = event.target.value
          setText(next)
          if (next.trim() === '') {
            setError(null)
            setValue(undefined)
            return
          }
          try {
            setValue(JSON.parse(next))
            setError(null)
          } catch {
            setError('Not valid JSON yet - keeps your last valid value until this parses.')
          }
        }}
      />
      <div className="field-description">
        {error ?? 'Raw JSON - a real picker/editor for this field type is a later polish pass.'}
      </div>
    </FieldWrapper>
  )
}

export const FieldRenderer: React.FC<{
  fields: Field[]
  parentPath?: string
  readOnly?: boolean
}> = ({ fields, parentPath = '', readOnly }) => (
  <>
    {fields.map((field, index) => (
      <SingleFieldRenderer key={('name' in field && field.name) || `${field.type}-${index}`} field={field} parentPath={parentPath} readOnly={readOnly} />
    ))}
  </>
)

const SingleFieldRenderer: React.FC<{
  field: Field
  parentPath: string
  readOnly?: boolean
}> = ({ field, parentPath, readOnly }) => {
  const visible = useFieldVisible(field, parentPath)

  const overridePath = (field as { admin?: { components?: { Field?: string } } }).admin?.components?.Field
  const Override = resolveComponent(overridePath)

  if (!visible) return null

  const fieldReadOnly = readOnly || Boolean((field as { admin?: { readOnly?: boolean } }).admin?.readOnly)

  if (Override) {
    const path = childPath(parentPath, 'name' in field ? field.name : undefined)
    // `resolveComponent` is a pure lookup into a module-level static registry
    // (src/admin/componentRegistry.ts) - it never creates a component, only
    // returns one of a fixed set of stable references, so the identity this
    // JSX tag gets is stable across renders even though the lint rule can't
    // see that through the function call.
    // eslint-disable-next-line react-hooks/static-components
    return <Override field={field} path={path} readOnly={fieldReadOnly} />
  }

  switch (field.type) {
    case 'row':
    case 'collapsible':
      return <FieldRenderer fields={field.fields} parentPath={parentPath} readOnly={readOnly} />

    case 'group': {
      const name = 'name' in field ? field.name : undefined
      return <FieldRenderer fields={field.fields} parentPath={childPath(parentPath, name)} readOnly={readOnly} />
    }

    case 'tabs':
      return (
        <>
          {field.tabs.map((tab, index) => (
            <FieldRenderer
              key={('name' in tab && tab.name) || `tab-${index}`}
              fields={tab.fields}
              parentPath={childPath(parentPath, 'name' in tab ? tab.name : undefined)}
              readOnly={readOnly}
            />
          ))}
        </>
      )

    case 'ui':
      // No generic shape to render for a field that's pure UI with no override - see file header.
      return null

    default:
      break
  }

  const name = 'name' in field ? field.name : undefined
  if (!name) return null
  const path = childPath(parentPath, name)

  switch (field.type) {
    case 'text':
      return <TextFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'textarea':
      return <TextareaFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'number':
      return <NumberFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'email':
      return <EmailFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'checkbox':
      return <CheckboxFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'date':
      return <DateFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'select':
      return <SelectFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />
    case 'radio':
      return <RadioFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />

    case 'relationship':
    case 'upload':
      return <RelationshipFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />

    case 'array':
      return <ArrayFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />

    case 'blocks':
      return <BlocksFieldRenderer field={field} path={path} readOnly={fieldReadOnly} />

    case 'richText':
    case 'json':
    case 'code':
    case 'point':
    case 'join':
      return <JsonStopgapRenderer field={field} path={path} readOnly={fieldReadOnly} />

    default:
      return null
  }
}

export default FieldRenderer
