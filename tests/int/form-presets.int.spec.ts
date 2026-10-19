import { describe, expect, it } from 'vitest'

import { FORM_ELEMENTS } from '@/features/forms/elementDefs'
import { FIELD_TYPES, fieldTypeOf, isFieldElementType } from '@/features/forms/layout'
import { FORM_PRESETS } from '@/views/visualEditor/formPresets'

const elementByType = new Map(FORM_ELEMENTS.map((e) => [e.type, e]))

describe('form presets', () => {
  it('has unique ids and the five expected presets', () => {
    const ids = FORM_PRESETS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['newsletter-signup', 'login', 'register', 'password-reset', 'contact'])
  })

  it('every preset has a label, a description and submit and success text', () => {
    for (const p of FORM_PRESETS) {
      expect(p.label.trim(), p.id).not.toBe('')
      expect(p.description.trim(), p.id).not.toBe('')
      expect(p.settings.submitButtonLabel.trim(), p.id).not.toBe('')
      expect(p.settings.successMessage.trim(), p.id).not.toBe('')
      expect(p.fields.length, p.id).toBeGreaterThan(0)
    }
  })

  it('every field is an element node of an allowlisted form field type', () => {
    for (const p of FORM_PRESETS) {
      for (const node of p.fields) {
        expect(node.blockType, p.id).toBe('element')
        expect(isFieldElementType(node.elementType), `${p.id}: ${node.elementType}`).toBe(true)
        expect(FIELD_TYPES, p.id).toContain(fieldTypeOf(String(node.elementType)))
        expect(elementByType.has(String(node.elementType)), `${p.id}: ${node.elementType} has no element def`).toBe(true)
      }
    }
  })

  it('only sets props the field element def declares', () => {
    for (const p of FORM_PRESETS) {
      for (const node of p.fields) {
        const def = elementByType.get(String(node.elementType))!
        const declared = new Set(def.fields.map((f) => f.name))
        for (const key of Object.keys(node.props ?? {})) {
          expect(declared.has(key), `${p.id}: ${node.elementType}.${key}`).toBe(true)
        }
      }
    }
  })

  it('has unique field names within each preset', () => {
    for (const p of FORM_PRESETS) {
      const names = p.fields.map((node) => String(node.props?.name ?? ''))
      for (const name of names) expect(name, `${p.id} field name`).not.toBe('')
      expect(new Set(names).size, `${p.id} field names`).toBe(names.length)
    }
  })

  it('uses only plain ASCII in its text', () => {
    for (const p of FORM_PRESETS) {
      const text = JSON.stringify(p)
      expect(/^[\x00-\x7f]*$/.test(text), p.id).toBe(true)
    }
  })
})
