import type { SectionNode } from '@/lib/sectionTree'

import { FORM_PRESETS, type FormPreset } from './formPresets'

export type FormPresetCard = { id: string; label: string; description: string }

/** Library cards for the "Forms" group, one per preset, in preset order. */
export function formPresetCards(presets: FormPreset[] = FORM_PRESETS): FormPresetCard[] {
  return presets.map(({ id, label, description }) => ({ id, label, description }))
}

/** Case-insensitive match on label, description or the group name, mirroring the Global group's search. */
export function filterFormPresetCards(cards: FormPresetCard[], query: string): FormPresetCard[] {
  const needle = query.trim().toLowerCase()
  return cards.filter(
    (c) => !needle || c.label.toLowerCase().includes(needle) || c.description.toLowerCase().includes(needle) || 'forms'.includes(needle),
  )
}

/**
 * The block a Forms card inserts: a `form` block carrying the preset's id, heading, submit/success settings and a
 * deep copy of its fields. The block's `form` relationship stays empty (a page block can only point at a saved form
 * document); whatever creates the form document from `preset`/`fields` is outside this file. Returns null for an
 * unknown id.
 */
export function formPresetNode(id: string, presets: FormPreset[] = FORM_PRESETS): SectionNode | null {
  const preset = presets.find((p) => p.id === id)
  if (!preset) return null
  return {
    blockType: 'form',
    showTitle: true,
    heading: preset.label,
    preset: preset.id,
    fields: JSON.parse(JSON.stringify(preset.fields)) as unknown,
    settings: { ...preset.settings },
  }
}
