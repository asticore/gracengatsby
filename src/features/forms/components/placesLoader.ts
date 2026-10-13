/**
 * Loads the Google Maps JavaScript API with its Places library, once per key.
 * Resolves true only when the Places classes exist. Never throws: a missing key,
 * a blocked script or a bad key all resolve false, and the caller then keeps
 * the plain address fields.
 */

type PlacesNamespace = { Autocomplete: new (input: HTMLInputElement, options: Record<string, unknown>) => unknown }
type GoogleGlobal = { maps?: { places?: PlacesNamespace; event?: { clearInstanceListeners?: (target: unknown) => void } } }

const loads = new Map<string, Promise<boolean>>()

const googleGlobal = (): GoogleGlobal | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { google?: GoogleGlobal }).google

export const placesReady = (): boolean => Boolean(googleGlobal()?.maps?.places?.Autocomplete)

export const placesNamespace = (): PlacesNamespace | undefined => googleGlobal()?.maps?.places

export const clearPlaceListeners = (target: unknown): void => {
  try {
    googleGlobal()?.maps?.event?.clearInstanceListeners?.(target)
  } catch {
    // Nothing to clean up if the library is gone.
  }
}

export function loadPlacesLibrary(key: string): Promise<boolean> {
  if (!key || typeof document === 'undefined') return Promise.resolve(false)
  const existing = loads.get(key)
  if (existing) return existing

  const pending = new Promise<boolean>((resolve) => {
    if (placesReady()) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places`
    script.async = true
    script.addEventListener('load', () => resolve(placesReady()))
    script.addEventListener('error', () => resolve(false))
    document.head.appendChild(script)
  })
  loads.set(key, pending)
  return pending
}
