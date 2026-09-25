/**
 * Shared helper for the field renderers in this directory.
 *
 * `@/engine`'s `Field` type is real Payload's own union across every field
 * type (text, row, tabs, ui, ...) - `label`/`required` aren't on every member
 * (a `row` or `tabs` field has neither), so TS rejects `field.label` directly.
 * Every leaf renderer needs the same two properties off of whichever field it
 * was actually given, so it's centralized here instead of a cast repeated in
 * 8+ files.
 */

import type { Field } from '@/engine'
import type { FieldsMap } from '@/admin/context/FormContext'

export function fieldLabel(field: Field): string | Record<string, string> | undefined {
  return (field as { label?: string | Record<string, string> }).label
}

export function fieldRequired(field: Field): boolean | undefined {
  return (field as { required?: boolean }).required
}

/**
 * Fields with a `name` nest the path; pure layout fields (row/collapsible,
 * unnamed tabs) don't. Shared by FieldRenderer (dispatch) and flattenDoc/
 * unflattenFields below (moving data in and out of FormContext's flat map) so
 * all three agree on exactly the same path for a given field.
 */
export function childPath(parentPath: string, name?: string): string {
  if (!name) return parentPath
  return parentPath ? `${parentPath}.${name}` : name
}

function getAtPath(data: Record<string, unknown>, path: string): unknown {
  if (!path) return data
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[segment]
    return undefined
  }, data)
}

/** Rebuilds a nested object from FormContext's flat, dotted-path fields map - for saving, and for evaluating `admin.condition`. */
export function unflattenFields(fields: FieldsMap): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const path of Object.keys(fields)) {
    const segments = path.split('.')
    let cursor = result
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]
      if (typeof cursor[segment] !== 'object' || cursor[segment] === null) cursor[segment] = {}
      cursor = cursor[segment] as Record<string, unknown>
    }
    cursor[segments[segments.length - 1]] = fields[path]?.value
  }
  return result
}

export { getAtPath }

/**
 * The inverse of `unflattenFields`: walks a `Field[]` array (the same
 * recursion rules `FieldRenderer` uses) and pulls each leaf's current value
 * out of a fetched document, producing FormContext's flat map - this is what
 * seeds `FormProvider`'s `initialFields` when an EditView loads an existing
 * document.
 */
export function flattenDoc(doc: Record<string, unknown>, fields: Field[], parentPath = ''): FieldsMap {
  const result: FieldsMap = {}

  const walk = (fieldList: Field[], basePath: string) => {
    for (const field of fieldList) {
      switch (field.type) {
        case 'row':
        case 'collapsible':
          walk(field.fields, basePath)
          continue
        case 'group': {
          const name = 'name' in field ? field.name : undefined
          walk(field.fields, childPath(basePath, name))
          continue
        }
        case 'tabs':
          for (const tab of field.tabs) {
            walk(tab.fields, childPath(basePath, 'name' in tab ? tab.name : undefined))
          }
          continue
        case 'ui':
          continue
        default: {
          const name = 'name' in field ? field.name : undefined
          if (!name) continue
          const path = childPath(basePath, name)
          result[path] = { value: getAtPath(doc, path) }
        }
      }
    }
  }

  walk(fields, parentPath)
  return result
}
