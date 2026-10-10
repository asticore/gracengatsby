'use client'

import React, { useEffect } from 'react'
import { FieldLabel, useField, useFormFields } from '@/engine/ui'
import type { Field } from '@/engine'
import { fieldLabel, fieldRequired } from '@/admin/fields/shared'
import { BUILT_IN_FONTS, fontStack, sanitizeInstalledFonts } from '@/features/fonts/installed'
import { loadFontInAdmin } from './fontLoader'
import './fonts-manager.css'

type FontPickerFieldProps = {
  field: Field
  path: string
  readOnly?: boolean
}

const SAMPLE = 'The quick brown fox jumps over the lazy dog'

/**
 * Picks the heading or body font. Lists the built-in faces for that role plus
 * every font installed in the Custom fonts field, and stores the chosen key
 * (a built-in key or an installed font id) as plain text.
 */
export function FontPickerField({ field, path, readOnly }: FontPickerFieldProps) {
  const { value, setValue } = useField<string | null | undefined>({ path })
  const role = (field.admin as { fontRole?: string } | undefined)?.fontRole === 'body' ? 'body' : 'heading'

  // Sibling field inside the same theme group: theme.customFonts.
  const customPath = path.includes('.') ? `${path.slice(0, path.lastIndexOf('.'))}.customFonts` : 'customFonts'
  const installedValue = useFormFields(([fields]) => fields?.[customPath]?.value)
  const installed = sanitizeInstalledFonts(installedValue)

  const builtIns = BUILT_IN_FONTS.filter((font) => font.role === role)
  const builtInIds = new Set(BUILT_IN_FONTS.map((font) => font.value))
  const installedForRole = installed.filter((font) => !builtInIds.has(font.id))
  const fallback = builtIns[0]
  const current = typeof value === 'string' ? value : ''
  const selectedBuiltIn = builtIns.find((font) => font.value === current)
  const selectedInstalled = installedForRole.find((font) => font.id === current)
  const selectedValue = selectedBuiltIn?.value ?? selectedInstalled?.id ?? fallback.value

  const stackFor = (): string => {
    if (selectedInstalled) return fontStack(selectedInstalled.family, selectedInstalled.category)
    const builtIn = selectedBuiltIn ?? fallback
    return fontStack(builtIn.family, builtIn.category)
  }

  // Load the chosen face so the sample renders in it. DOM writes only.
  useEffect(() => {
    if (selectedInstalled) loadFontInAdmin(selectedInstalled)
  }, [selectedInstalled])

  useEffect(() => {
    const builtIn = selectedBuiltIn
    if (!builtIn) return
    loadFontInAdmin({
      id: builtIn.fontsourceId,
      family: builtIn.family,
      source: 'fontsource',
      category: builtIn.category,
      weights: [400, 700],
      italic: false,
      local: false,
      files: {},
    })
  }, [selectedBuiltIn])

  return (
    <div className="field-type fm-picker">
      <FieldLabel label={fieldLabel(field)} required={fieldRequired(field)} />

      <select
        id={`field-${path}`}
        className="fm-select fm-picker-select"
        value={selectedValue}
        disabled={readOnly}
        onChange={(event) => setValue(event.target.value)}
      >
        <optgroup label="Built in">
          {builtIns.map((font) => (
            <option key={font.value} value={font.value}>
              {font.label}
            </option>
          ))}
        </optgroup>
        {installedForRole.length > 0 && (
          <optgroup label="Installed">
            {installedForRole.map((font) => (
              <option key={font.id} value={font.id}>
                {font.family}
              </option>
            ))}
          </optgroup>
        )}
      </select>

      <p className="fm-sample" style={{ fontFamily: stackFor() }} aria-label="Font preview">
        {SAMPLE}
      </p>

      {field.admin?.description && <p className="fm-hint">{String(field.admin.description)}</p>}
    </div>
  )
}
