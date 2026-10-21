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

export type FormPresetResult = { ok: true; node: SectionNode } | { ok: false; error: string }

/**
 * Creates a saved form document from a preset (POST /api/forms, the engine's ordinary collection endpoint, using the
 * editor's own session) and returns the `form` block that points at it. The preset's fields become the form's layout
 * (published too, so the block renders on the page straight away); its wording goes in `settings`. Nothing is
 * returned for insertion unless the server confirms the create, so a failure leaves the page untouched.
 */
export async function createFormFromPreset(
  id: string,
  fetchImpl: typeof fetch = fetch,
  presets: FormPreset[] = FORM_PRESETS,
): Promise<FormPresetResult> {
  const preset = presets.find((p) => p.id === id)
  if (!preset) return { ok: false, error: 'That form preset no longer exists.' }
  const layout = JSON.parse(JSON.stringify(preset.fields)) as unknown
  try {
    const res = await fetchImpl('/api/forms', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: preset.label,
        layout,
        publishedLayout: layout,
        formStatus: 'published',
        settings: { ...preset.settings },
      }),
    })
    if (!res.ok) return { ok: false, error: `The form could not be created (${res.status}).` }
    const json = (await res.json().catch((): null => null)) as { doc?: { id?: unknown } } | null
    const newId = json?.doc?.id
    if (typeof newId !== 'string' && typeof newId !== 'number') return { ok: false, error: 'The form could not be created.' }
    return { ok: true, node: { blockType: 'form', form: newId, showTitle: true } }
  } catch {
    return { ok: false, error: 'The form could not be created. Check your connection and try again.' }
  }
}

/**
 * The unsaved shape of a preset as a `form` block (id, heading, a deep copy of its fields and settings). A page block
 * can only point at a saved form document, so inserting uses `createFormFromPreset`; this stays for previews. Returns
 * null for an unknown id.
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
