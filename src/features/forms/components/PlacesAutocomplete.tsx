'use client'

import React, { useEffect, useRef } from 'react'

import { parsePlaceAddress, type PlaceAddress } from '../placesParse'
import { clearPlaceListeners, loadPlacesLibrary, placesNamespace } from './placesLoader'

/**
 * The street-address line with Google Places suggestions attached. It is still
 * a plain text input: if the key is missing or the script fails, typing works
 * exactly as before and no error is shown. Picking a suggestion hands the parsed
 * parts to onPlace, which fills the sub-fields the same way the OpenStreetMap
 * path does.
 */

export type PlaceChoice = PlaceAddress & { lat?: number; lon?: number }

type PlaceResult = {
  address_components?: unknown
  formatted_address?: unknown
  geometry?: { location?: { lat: () => number; lng: () => number } }
}

export const PlacesAutocomplete: React.FC<{
  id: string
  apiKey: string
  value: string
  onText: (text: string) => void
  onPlace: (address: PlaceChoice) => void
}> = ({ id, apiKey, value, onText, onPlace }) => {
  const input = useRef<HTMLInputElement | null>(null)
  const handlers = useRef({ onText, onPlace })

  useEffect(() => {
    handlers.current = { onText, onPlace }
  })

  useEffect(() => {
    let cancelled = false
    let autocomplete: unknown = null
    void loadPlacesLibrary(apiKey).then((ready) => {
      const element = input.current
      const places = placesNamespace()
      if (cancelled || !ready || !element || !places) return
      autocomplete = new places.Autocomplete(element, { fields: ['address_components', 'formatted_address', 'geometry'], types: ['address'] })
      const instance = autocomplete as { addListener: (event: string, handler: () => void) => void; getPlace: () => PlaceResult }
      instance.addListener('place_changed', () => {
        const place = instance.getPlace()
        const location = place.geometry?.location
        handlers.current.onPlace({
          ...parsePlaceAddress(place.address_components, place.formatted_address),
          lat: location ? location.lat() : undefined,
          lon: location ? location.lng() : undefined,
        })
      })
    })
    return () => {
      cancelled = true
      if (autocomplete) clearPlaceListeners(autocomplete)
    }
  }, [apiKey])

  return (
    <input
      ref={input}
      id={id}
      type="text"
      placeholder="Street address"
      autoComplete="off"
      value={value}
      onChange={(event) => onText(event.target.value)}
      onKeyDown={(event) => {
        // Enter picks a suggestion; it must not submit the whole form by accident.
        if (event.key === 'Enter') event.preventDefault()
      }}
    />
  )
}
