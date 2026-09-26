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

/**
 * Strips every function value out of a `Field[]` tree (recursively, through
 * `row`/`group`/`tabs`/`array`/`blocks` nesting) before it crosses the
 * server -> client boundary into `EditForm`/`FieldRenderer` (a `'use client'`
 * tree).
 *
 * Found live (not caught by `tsc`/`npm run build`, which don't render
 * anything): a real collection/global's `Field[]` array - the same plain
 * data object `readRegistry` hands back, see `src/admin/auth.ts`'s header -
 * still carries real FUNCTION values on plenty of fields: `access.create`/
 * `.read`/`.update`, `hooks.beforeChange`/`.afterRead`, `validate`,
 * occasionally `defaultValue` (e.g. `Posts.ts`). React/Next refuses to
 * serialize a Server Component prop containing a function for a Client
 * Component ("Functions cannot be passed directly to Client Components"),
 * which 500'd EVERY EditView/GlobalEditView page once actually rendered.
 *
 * The `JSON.stringify` replacer trick (return `undefined` for a function
 * value) is what does the stripping - for a plain object key that removes
 * the key entirely (not a `null`), and it walks the WHOLE nested tree for
 * free, exactly matching `FieldRenderer`'s own recursion rules (row/group/
 * tabs/array/blocks all just become nested objects/arrays here too), so
 * there is no need to hand-write the recursion twice.
 *
 * `admin.condition` is the ONE exception: every condition fn in this codebase
 * (confirmed by inspection 2026-09-26 - grep `condition:` across
 * collections/globals/blocks/features) is a pure function of its own
 * `(data, siblingData, options)` params only, no closures over outer
 * variables or imports - safe to ship as source text (`fn.toString()`)
 * instead of stripping it, and reconstruct client-side with `new Function`
 * (see `reviveCondition` below and `FieldRenderer.tsx`'s `useFieldVisible`,
 * which is what gives conditionally-shown fields real live reactivity to
 * sibling values instead of always showing). Every OTHER function
 * (`access.*`, `hooks.*`, `validate`, ...) stays stripped entirely - only
 * `admin.condition` is a client-UI concern.
 *
 * Known, accepted regression: a function-valued `defaultValue` (only
 * `Posts.ts` today) is dropped rather than resolved - a blank create form
 * for that one field starts empty instead of prefilled.
 */
export function sanitizeFieldsForClient(fields: Field[]): Field[] {
  return JSON.parse(
    JSON.stringify(fields, (key, value) => {
      if (typeof value !== 'function') return value
      return key === 'condition' ? value.toString() : undefined
    }),
  ) as Field[]
}

const conditionFnCache = new Map<string, (...args: unknown[]) => unknown>()

/**
 * Reconstructs an `admin.condition` function from the source text
 * `sanitizeFieldsForClient` shipped it as (see that function's doc comment
 * for why this is safe for every condition actually used in this codebase).
 * Cached by source string so repeated calls (e.g. on every keystroke, via
 * `useFieldVisible`'s `useFormFields` selector) don't re-parse each time.
 * Returns `undefined` on any parse/reconstruction failure - callers should
 * treat that the same as "no condition" or "hide the field", never crash.
 */
export function reviveCondition(source: string): ((...args: unknown[]) => unknown) | undefined {
  const cached = conditionFnCache.get(source)
  if (cached) return cached
  try {
    // Reconstructing this app's own admin.condition source (stringified server-side by
    // sanitizeFieldsForClient above), not arbitrary input.
    const fn = new Function(`return (${source})`)() as (...args: unknown[]) => unknown
    conditionFnCache.set(source, fn)
    return fn
  } catch {
    return undefined
  }
}
