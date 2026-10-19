/** Saved style presets (localStorage, optional). Each holds the serialized style text from editorClipboard. */
import { parseStyleClipboardText } from './editorClipboard'

export const PRESETS_KEY = 've-style-presets'
export const MAX_PRESETS = 30

export type StylePreset = { id: string; name: string; text: string }

export function addPreset(list: readonly StylePreset[], name: string, text: string, id: string): StylePreset[] {
  const clean = name.trim().slice(0, 60)
  if (!clean || !text) return [...list]
  const next = [...list.filter((p) => p.name.toLowerCase() !== clean.toLowerCase()), { id, name: clean, text }]
  return next.slice(-MAX_PRESETS)
}

export function removePreset(list: readonly StylePreset[], id: string): StylePreset[] {
  return list.filter((p) => p.id !== id)
}

export function sanitisePresets(raw: unknown): StylePreset[] {
  let data: unknown = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return []
    }
  }
  if (!Array.isArray(data)) return []
  const out: StylePreset[] = []
  for (const v of data) {
    if (!v || typeof v !== 'object') continue
    const { id, name, text } = v as Record<string, unknown>
    if (typeof id !== 'string' || typeof name !== 'string' || typeof text !== 'string' || !name.trim()) continue
    if (!parseStyleClipboardText(text).ok) continue
    out.push({ id, name, text })
  }
  return out.slice(-MAX_PRESETS)
}

/**
 * The design after applying a preset: same device replaces the design (as Paste style does);
 * a different device stores it as that device's override.
 */
export function applyPresetDesign(
  current: Record<string, unknown>,
  text: string,
  device: 'desktop' | 'tablet' | 'mobile',
): Record<string, unknown> | null {
  const parsed = parseStyleClipboardText(text)
  if (!parsed.ok) return null
  if (parsed.device === device) return { ...(parsed.design as Record<string, unknown>) }
  return { ...current, [parsed.device]: parsed.design }
}

export function loadPresets(): StylePreset[] {
  try {
    return sanitisePresets(window.localStorage.getItem(PRESETS_KEY))
  } catch {
    return []
  }
}

export function savePresets(list: readonly StylePreset[]): void {
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(list))
  } catch {
    /* storage unavailable */
  }
}
