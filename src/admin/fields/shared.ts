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

export function fieldLabel(field: Field): string | Record<string, string> | undefined {
  return (field as { label?: string | Record<string, string> }).label
}

export function fieldRequired(field: Field): boolean | undefined {
  return (field as { required?: boolean }).required
}
