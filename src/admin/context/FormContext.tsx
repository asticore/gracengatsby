'use client'

/**
 * From-scratch replacement for `@payloadcms/ui`'s form context.
 *
 * Backs `useField`, `useFormFields`, and `useFormModified` (re-exported from
 * `@/engine/ui`) with the exact call signatures the existing custom field
 * components already depend on:
 *   - SlugComponent.tsx:        useField<T>({path}) -> {value, setValue}
 *                                useFormFields(([fields]) => fields?.[x]?.value)
 *   - CustomFieldsPanel.tsx:    useField<T>({path}) -> {value, setValue}
 *   - BackupPanel.tsx / SendTestEmailButton.tsx: useFormModified() -> boolean
 *
 * One FormProvider wraps one document form (create/edit view). It holds the
 * full path -> value map for that document, flat (dotted paths, matching how
 * the existing field components already key into it - e.g. 'testing.testRecipient').
 */

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

export type FieldsMap = Record<string, { value: unknown } | undefined>

type FormContextValue = {
  fields: FieldsMap
  modified: boolean
  resetModified: () => void
  setValue: (path: string, value: unknown) => void
}

const FormContext = createContext<FormContextValue | null>(null)

export const FormProvider: React.FC<{
  children: React.ReactNode
  initialFields?: FieldsMap
}> = ({ children, initialFields }) => {
  const [fields, setFields] = useState<FieldsMap>(() => initialFields ?? {})
  const [modified, setModified] = useState(false)

  const setValue = useCallback((path: string, value: unknown) => {
    setFields((prev) => ({ ...prev, [path]: { value } }))
    setModified(true)
  }, [])

  const resetModified = useCallback(() => setModified(false), [])

  const value = useMemo(
    () => ({ fields, modified, resetModified, setValue }),
    [fields, modified, resetModified, setValue],
  )

  return <FormContext.Provider value={value}>{children}</FormContext.Provider>
}

function useFormContext(hookName: string): FormContextValue {
  const ctx = useContext(FormContext)
  if (!ctx) throw new Error(`${hookName} must be used within a FormProvider`)
  return ctx
}

export function useField<T = unknown>({ path }: { path: string }): { value: T; setValue: (next: T) => void } {
  const ctx = useFormContext('useField')
  const value = ctx.fields[path]?.value as T
  const setValue = useCallback((next: T) => ctx.setValue(path, next), [ctx, path])
  return { value, setValue }
}

export function useFormFields<T>(selector: (args: [FieldsMap]) => T): T {
  const ctx = useFormContext('useFormFields')
  return selector([ctx.fields])
}

export function useFormModified(): boolean {
  const ctx = useFormContext('useFormModified')
  return ctx.modified
}

/** Called by EditView/GlobalEditView after a successful save. */
export function useResetFormModified(): () => void {
  const ctx = useFormContext('useResetFormModified')
  return ctx.resetModified
}
